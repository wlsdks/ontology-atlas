pub(crate) mod app_log;
#[cfg(target_os = "macos")]
pub(crate) mod tray;
pub(crate) mod window;

use crate::{deep_link, MAIN_WINDOW_LABEL};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;
use tauri::{AppHandle, Manager};
use window::show_main_window;

/// 20 attempts 250 ms apart: five seconds for a cold start to produce a document.
#[cfg(desktop)]
const DEEP_LINK_ROUTE_ATTEMPTS: usize = 20;
#[cfg(desktop)]
const DEEP_LINK_ROUTE_INTERVAL_MS: u64 = 250;

/// Only `http`/`https`: the screen's address goes straight to the OS, so any other
/// scheme could open arbitrary things. Uses one OS command instead of a plugin.
#[tauri::command]
pub(crate) fn open_external_url(url: String) -> Result<(), String> {
    if !is_openable_url(&url) {
        return Err(format!("refused-scheme:{url}"));
    }
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut c = Command::new("/usr/bin/open");
        c.arg(&url);
        c
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        // No shell: `cmd /C start` would let a metacharacter in the URL (`&`, `|`,
        // `%`, `^`) run a command, and the openable-URL check allows those since it
        // only bars whitespace. rundll32 hands the URL straight to the protocol
        // handler as one argument.
        let mut c = Command::new("rundll32.exe");
        c.args(["url.dll,FileProtocolHandler", &url]);
        c
    };
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut command = {
        let mut c = Command::new("xdg-open");
        c.arg(&url);
        c
    };
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|err| format!("open-failed:{err}"))?;

    // Dropping a `Child` does not reap it; a detached wait keeps the command instant
    // without leaving a zombie per clicked link.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

/// An allowlist, because denylists miss new schemes.
pub(crate) fn is_openable_url(url: &str) -> bool {
    let lowered = url.trim().to_ascii_lowercase();
    (lowered.starts_with("https://") || lowered.starts_with("http://"))
        && !url.chars().any(|c| c.is_whitespace())
}

pub(crate) fn reveal_in_finder_command(dir: &Path) -> Command {
    let mut command = Command::new("open");
    command.arg("-a").arg("Finder").arg(dir);
    command
}

/// The URL is never logged: it may be a trick link and its payload a server config.
/// The only effect is a pre-filled form the person still confirms.
#[cfg(desktop)]
pub(crate) fn answer_deep_link(app: &AppHandle, url: &str) {
    let payload = match deep_link::parse_install_deep_link(url) {
        Ok(payload) => payload,
        Err(refusal) => {
            // Dropped, not redirected, so a refused URL cannot move the window.
            log::warn!("deep link refused: {refusal}");
            return;
        }
    };
    log::info!(
        "deep link: opening the connector form with a {} byte install payload",
        payload.len()
    );
    show_main_window(app);
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    // A cold-start link arrives before the document exists; the script reports arrival.
    let script = deep_link::build_install_route_script(&payload);
    tauri::async_runtime::spawn(async move {
        let arrived = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        for _ in 0..DEEP_LINK_ROUTE_ATTEMPTS {
            if arrived.load(std::sync::atomic::Ordering::SeqCst) {
                return;
            }
            let sink = std::sync::Arc::clone(&arrived);
            let _ = window.eval_with_callback(script.as_str(), move |result| {
                if result.trim() == "true" {
                    sink.store(true, std::sync::atomic::Ordering::SeqCst);
                }
            });
            std::thread::sleep(Duration::from_millis(DEEP_LINK_ROUTE_INTERVAL_MS));
        }
        log::warn!("deep link: the connector form did not come up within the retry window");
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The screen's address goes straight to the OS, so a bypass could open anything.
    #[test]
    fn only_http_urls_are_handed_to_the_os() {
        for good in [
            "https://example.com",
            "http://example.com/a?b=c",
            "HTTPS://EXAMPLE.COM",
        ] {
            assert!(super::is_openable_url(good), "{good} was blocked");
        }
        for bad in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,x",
            "ftp://example.com",
            "/ko/topology/",
            "",
            "https://exa mple.com",
            "https://example.com\nfile:///etc/passwd",
        ] {
            assert!(!super::is_openable_url(bad), "{bad:?} would be opened");
        }
    }

    #[test]
    fn reveal_app_log_dir_opens_only_the_given_folder_in_finder() {
        let command = reveal_in_finder_command(Path::new("/tmp/atlas logs"));
        assert_eq!(command.get_program(), "open");
        let args: Vec<_> = command.get_args().collect();
        assert_eq!(args, ["-a", "Finder", "/tmp/atlas logs"]);
    }
}
