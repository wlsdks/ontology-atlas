#[cfg(target_os = "macos")]
use super::reveal_in_finder_command;
#[cfg(target_os = "macos")]
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub(crate) fn reveal_app_log_dir(app: AppHandle) -> Result<(), String> {
    let dir = app.path().app_log_dir().map_err(|err| err.to_string())?;

    #[cfg(target_os = "macos")]
    {
        fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
        let status = reveal_in_finder_command(&dir)
            .status()
            .map_err(|err| err.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("open exited with status {status}"))
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = dir;
        Err("Finder reveal is only available on macOS".into())
    }
}

/// The release binary is stripped, so this line is the only record of where it died.
fn format_panic_report(thread_name: &str, location: &str, message: &str) -> String {
    format!("panic in thread '{thread_name}' at {location}: {message}")
}

/// Writes `panic.log` and stderr, then defers to the previous hook. Never touches `log`.
pub(crate) fn install_panic_logger() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let message = info
            .payload()
            .downcast_ref::<&str>()
            .map(|text| (*text).to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "unknown panic payload".to_string());
        let location = info
            .location()
            .map(|at| format!("{}:{}:{}", at.file(), at.line(), at.column()))
            .unwrap_or_else(|| "unknown location".to_string());
        let thread = std::thread::current();
        let thread_name = thread.name().unwrap_or("unnamed").to_string();
        let report = format_panic_report(&thread_name, &location, &message);
        // No `log::error!`: the logger can itself panic, and a panic inside the hook aborts.
        append_panic_report_file(&report);
        // `writeln!`, not `eprintln!`, which panics on a closed pipe, a real state for a
        // Finder-launched app; a double panic would lose both reports.
        let _ = writeln!(std::io::stderr(), "{report}");
        previous(info);
    }));
}

/// fern panics on a failed stderr write, and the parent may close the pipe any time.
pub(crate) struct QuietStderr;

impl Write for QuietStderr {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let _ = std::io::stderr().write_all(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        let _ = std::io::stderr().flush();
        Ok(())
    }
}

/// Same directory as the log plugin on macOS.
#[cfg(target_os = "macos")]
fn panic_report_path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(
        PathBuf::from(home)
            .join("Library")
            .join("Logs")
            .join("dev.jinan.ontology-atlas")
            .join("panic.log"),
    )
}

#[cfg(not(target_os = "macos"))]
fn panic_report_path() -> Option<PathBuf> {
    None
}

fn append_panic_report_file(report: &str) {
    let Some(path) = panic_report_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(file, "[unix {stamp}] {report}");
    }
}

/// Puts WebView crashes in the native log, which a shipped app otherwise never shows.
/// Bounded so a runaway page cannot fill it.
#[tauri::command]
pub(crate) async fn log_webview_error(
    message: String,
    source: Option<String>,
    line: Option<u32>,
    column: Option<u32>,
    stack: Option<String>,
    kind: String,
) -> Result<(), String> {
    let report = format_webview_error_report(
        &message,
        source.as_deref(),
        line,
        column,
        stack.as_deref(),
        &kind,
    );
    log::error!("{report}");
    Ok(())
}

fn format_webview_error_report(
    message: &str,
    source: Option<&str>,
    line: Option<u32>,
    column: Option<u32>,
    stack: Option<&str>,
    kind: &str,
) -> String {
    fn clip(text: &str, max: usize) -> String {
        if text.chars().count() <= max {
            return text.to_string();
        }
        let head: String = text.chars().take(max).collect();
        format!("{head}… (clipped)")
    }
    let kind = match kind {
        "error" | "unhandledrejection" | "render" => kind,
        _ => "unknown",
    };
    let mut report = format!("webview {kind}: {}", clip(message, 2_000));
    if let Some(source) = source.filter(|s| !s.is_empty()) {
        report.push_str(&format!(" at {}", clip(source, 512)));
        if let Some(line) = line {
            report.push_str(&format!(":{line}"));
            if let Some(column) = column {
                report.push_str(&format!(":{column}"));
            }
        }
    }
    if let Some(stack) = stack.filter(|s| !s.is_empty()) {
        report.push('\n');
        report.push_str(&clip(stack, 8_000));
    }
    report
}

#[cfg(test)]
mod tests {
    #[test]
    fn reveal_app_log_dir_is_registered_without_arguments() {
        let source = include_str!("../lib.rs");
        let handler = source
            .split(".invoke_handler(tauri::generate_handler![")
            .nth(1)
            .and_then(|rest| rest.split("])").next())
            .expect("Tauri invoke handler");
        assert!(handler.contains("reveal_app_log_dir,"));
        assert!(include_str!("app_log.rs")
            .contains("fn reveal_app_log_dir(app: AppHandle) -> Result<(), String>"));
    }
}

#[cfg(test)]
mod webview_error_report_tests {
    use super::format_webview_error_report;

    #[test]
    fn report_names_kind_location_and_stack() {
        let report = format_webview_error_report(
            "boom",
            Some("http://tauri.localhost/app.js"),
            Some(12),
            Some(5),
            Some("Error: boom\n  at f"),
            "render",
        );
        assert_eq!(
            report,
            "webview render: boom at http://tauri.localhost/app.js:12:5\nError: boom\n  at f"
        );
    }

    #[test]
    fn report_clips_runaway_text_and_unknown_kinds() {
        let long = "x".repeat(3_000);
        let report = format_webview_error_report(&long, None, None, None, None, "weird");
        assert!(report.starts_with("webview unknown: "));
        assert!(report.ends_with("… (clipped)"));
        assert!(report.chars().count() < 2_100);
    }
}

#[cfg(test)]
mod panic_report_tests {
    use super::format_panic_report;

    #[test]
    fn panic_report_names_thread_location_and_message() {
        assert_eq!(
            format_panic_report("main", "src/lib.rs:12:5", "index out of bounds"),
            "panic in thread 'main' at src/lib.rs:12:5: index out of bounds"
        );
    }

    #[test]
    fn panic_report_keeps_the_unknown_placeholders_readable() {
        assert_eq!(
            format_panic_report("unnamed", "unknown location", "unknown panic payload"),
            "panic in thread 'unnamed' at unknown location: unknown panic payload"
        );
    }
}
