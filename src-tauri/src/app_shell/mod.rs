pub(crate) mod app_log;
mod deep_link;
#[cfg(target_os = "macos")]
pub(crate) mod tray;
pub(crate) mod window;

use crate::MAIN_WINDOW_LABEL;
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

#[cfg(any(target_os = "macos", test))]
pub(crate) fn reveal_in_finder_command(dir: &Path) -> Command {
    let mut command = Command::new("open");
    command.arg("-a").arg("Finder").arg(dir);
    command
}

/// Explorer or the desktop's file manager, with the item selected in its folder. Callers
/// pass a path their own vault checks already resolved; nothing is opened or launched.
/// A fresh thread keeps the shell's COM apartment (Windows) and the D-Bus client's own
/// runtime (Linux) away from the async runtime's threads.
///
/// The plugin's Windows arm reports success even when Explorer refuses, so the one failure
/// detectable beforehand, an entry that vanished after the vault check, is checked here.
#[cfg(any(windows, target_os = "linux"))]
pub(crate) fn reveal_in_file_manager(path: &Path) -> Result<(), String> {
    reveal_target_present(path)?;
    std::thread::scope(|scope| {
        scope
            .spawn(|| tauri_plugin_opener::reveal_item_in_dir(path))
            .join()
    })
    .map_err(|_| crate::coded_error::coded("reveal-failed", "the file manager call panicked"))?
    .map_err(|error| crate::coded_error::coded("reveal-failed", error))
}

#[cfg(any(windows, target_os = "linux", test))]
fn reveal_target_present(path: &Path) -> Result<(), String> {
    match std::fs::symlink_metadata(path) {
        Ok(_) => Ok(()),
        Err(error) => Err(crate::coded_error::coded("reveal-failed", error)),
    }
}

#[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
pub(crate) fn reveal_in_file_manager(_path: &Path) -> Result<(), String> {
    Err("reveal-unsupported-on-this-platform".into())
}

/// The native window drop is the only way a dropped path reaches the Library: Rust offers
/// what was dropped and the page gets the offer, never a path it could name itself. The
/// walk runs on its own thread because this callback is on the main thread.
pub(crate) fn answer_drag_drop(app: &AppHandle, event: &tauri::DragDropEvent) {
    use crate::library::dropped::{
        begin_armed_drop, drop_armed, offer_drop, SourceDropEvent, SOURCE_DROP_EVENT,
    };
    use tauri::Emitter;

    if !drop_armed() {
        return;
    }
    match event {
        tauri::DragDropEvent::Enter { .. } => {
            let _ = app.emit(SOURCE_DROP_EVENT, SourceDropEvent::Over);
        }
        tauri::DragDropEvent::Leave => {
            let _ = app.emit(SOURCE_DROP_EVENT, SourceDropEvent::Leave);
        }
        tauri::DragDropEvent::Drop { paths, .. } => {
            let Some(drop) = begin_armed_drop() else {
                return;
            };
            let _ = app.emit(SOURCE_DROP_EVENT, SourceDropEvent::Reading);
            let app = app.clone();
            let paths = paths.clone();
            std::thread::spawn(move || {
                offer_drop(drop, &paths, |offer| {
                    let _ = app.emit(SOURCE_DROP_EVENT, SourceDropEvent::Offered { offer });
                });
            });
        }
        _ => {}
    }
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

    /// Explorer's own failure is invisible to the plugin, so a vanished entry must fail here.
    #[test]
    fn a_reveal_target_that_vanished_is_a_visible_error() {
        let missing = std::env::temp_dir().join(format!(
            "atlas-reveal-missing-{}/note.md",
            std::process::id()
        ));
        let refused = reveal_target_present(&missing).unwrap_err();
        assert!(refused.starts_with("reveal-failed: "), "{refused}");
        assert!(reveal_target_present(&std::env::temp_dir()).is_ok());
    }

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

    /// Reveal calls the opener crate from Rust only. Registering the plugin or granting an
    /// `opener:` permission would let the WebView open any URL or program, which reveal never needs.
    #[test]
    fn the_webview_gets_no_opener_permission() {
        let capability = include_str!("../../capabilities/default.json");
        assert!(
            !capability.contains("opener:"),
            "the WebView was granted the opener plugin"
        );
    }

    #[test]
    fn reveal_app_log_dir_opens_only_the_given_folder_in_finder() {
        let command = reveal_in_finder_command(Path::new("/tmp/atlas logs"));
        assert_eq!(command.get_program(), "open");
        let args: Vec<_> = command.get_args().collect();
        assert_eq!(args, ["-a", "Finder", "/tmp/atlas logs"]);
    }
}
