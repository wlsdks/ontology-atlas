use std::path::Path;

use super::bounded_command::LOGIN_PROBE_TIMEOUT;
use super::runtime_environment::apply_runtime_environment;

// Only measured login-status commands. Exit code only: `claude auth status` prints
// the email and organization ID, which must never enter process memory.
pub(super) const LOGIN_PROBE: &[(&str, &[&str])] = &[
    ("claude-acp", &["auth", "status"]),
    ("codex-acp", &["login", "status"]),
];

// Measured with a throwaway config home; no vendor documents exit codes. Any other
// non-zero code (127, a kill, a changed argument) is not "signed out".
const LOGIN_LOGGED_OUT_EXIT: i32 = 1;

// The only place non-zero is interpreted. Transient failures and signals are
// unknown, or a working tool vanishes from the list.
fn classify_login_exit(code: Option<i32>) -> Option<bool> {
    match code {
        Some(0) => Some(true),
        Some(LOGIN_LOGGED_OUT_EXIT) => Some(false),
        _ => None,
    }
}

pub(super) fn login_probe_args(runtime_id: &str) -> Option<&'static [&'static str]> {
    LOGIN_PROBE
        .iter()
        .find(|(id, _)| *id == runtime_id)
        .map(|(_, args)| *args)
}

type RealProbe = (
    fn(&Path) -> bool,
    fn(&Path) -> Vec<String>,
    fn(&Path) -> Option<String>,
    fn(&str, &Path, &[&str], &str) -> Option<bool>,
);

// Output goes to null: `claude auth status` prints the email and organization ID.
// One log line per probe keeps the id, exit code and duration, never output.
fn run_login_probe(runtime_id: &str, path: &Path, args: &[&str], child_path: &str) -> Option<bool> {
    use std::process::{Command, Stdio};
    let started = std::time::Instant::now();
    let mut command = Command::new(path);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    // The rebuilt PATH, or the `claude` wrapper cannot find node and reads as signed out.
    apply_runtime_environment(&mut command, runtime_id, child_path);
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(err) => {
            log::info!(
                "acp login probe: runtime={runtime_id} exit=spawn-failed({}) duration_ms={}",
                err.kind(),
                started.elapsed().as_millis()
            );
            return None;
        }
    };

    // A multiple of the measured times; past it, kill and answer unknown.
    let deadline = started + LOGIN_PROBE_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let verdict = classify_login_exit(status.code());
                log::info!(
                    "acp login probe: runtime={runtime_id} exit={:?} verdict={} duration_ms={}",
                    status.code(),
                    match verdict {
                        Some(true) => "signed-in",
                        Some(false) => "signed-out",
                        None => "unknown",
                    },
                    started.elapsed().as_millis()
                );
                return verdict;
            }
            Ok(None) => {
                if std::time::Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    log::info!(
                        "acp login probe: runtime={runtime_id} exit=timeout verdict=unknown duration_ms={}",
                        started.elapsed().as_millis()
                    );
                    return None;
                }
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            Err(err) => {
                log::info!(
                    "acp login probe: runtime={runtime_id} exit=wait-failed({}) verdict=unknown duration_ms={}",
                    err.kind(),
                    started.elapsed().as_millis()
                );
                return None;
            }
        }
    }
}

pub(crate) fn real_probe() -> RealProbe {
    let is_executable = |path: &Path| -> bool {
        let Ok(meta) = std::fs::metadata(path) else {
            return false;
        };
        if !meta.is_file() {
            return false;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            meta.permissions().mode() & 0o111 != 0
        }
        #[cfg(not(unix))]
        {
            true
        }
    };
    let list_dir = |path: &Path| -> Vec<String> {
        let Ok(entries) = std::fs::read_dir(path) else {
            return Vec::new();
        };
        entries
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect()
    };
    // Reads only nvm's one-line `alias/default`, not arbitrary files.
    let read_text = |path: &Path| -> Option<String> {
        let meta = std::fs::metadata(path).ok()?;
        if !meta.is_file() || meta.len() > 4096 {
            return None;
        }
        std::fs::read_to_string(path).ok()
    };
    // Login is asked of the CLI, never read from credential files. Exit code only;
    // output is discarded. Failure or timeout is unknown, not signed out.
    let login_ok =
        |runtime_id: &str, path: &Path, args: &[&str], child_path: &str| -> Option<bool> {
            let first = run_login_probe(runtime_id, path, args, child_path);
            if first != Some(false) {
                return first;
            }
            // A signed-out answer is asked twice before it is shown: a load spike rarely
            // repeats, so disagreement reads as unknown rather than erasing a working tool.
            let second = run_login_probe(runtime_id, path, args, child_path);
            if second == Some(false) {
                Some(false)
            } else {
                None
            }
        };

    (is_executable, list_dir, read_text, login_ok)
}

#[cfg(test)]
mod tests;
