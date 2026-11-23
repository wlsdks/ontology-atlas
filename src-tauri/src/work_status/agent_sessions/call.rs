//! The one fixed call that asks the person's own Claude Code for its session list. Nothing about
//! it comes from the page, a file or the search path, and macOS gives the program no network.

use std::io::Read;
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

const ARGUMENTS: [&str; 2] = ["agents", "--json"];
pub(crate) const TIME_LIMIT: Duration = Duration::from_secs(5);
pub(crate) const OUTPUT_CAP_BYTES: usize = 1024 * 1024;
const EXIT_POLL: Duration = Duration::from_millis(20);

/// Claude Code's documented switch for its updater, telemetry and flag fetches. A plain call was
/// seen to try one HTTPS connection; the list itself needs none.
const QUIET_SWITCH: (&str, &str) = ("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1");
const SANDBOX_PROGRAM: &str = "/usr/bin/sandbox-exec";
/// Everything the program could do before, except open a socket.
const NO_NETWORK_PROFILE: &str = "(version 1)(allow default)(deny network*)";

/// Where Claude Code installs itself, in the order tried; never a search of `PATH`.
pub(crate) fn installed_program(home: &Path) -> Option<PathBuf> {
    [
        home.join(".local/bin/claude"),
        PathBuf::from("/opt/homebrew/bin/claude"),
        PathBuf::from("/usr/local/bin/claude"),
    ]
    .into_iter()
    .find(|candidate| candidate.is_file())
}

/// The call, whole: the program under the no-network sandbox, its two arguments, an environment of
/// `HOME` and the quiet switch, Atlas's own folder to stand in, and no input.
pub(crate) fn list_command(program: &Path, home: &Path, working_folder: &Path) -> Command {
    let mut command = Command::new(SANDBOX_PROGRAM);
    crate::child_process::no_console::hide_console(&mut command);
    command
        .args(["-p", NO_NETWORK_PROFILE])
        .arg(program)
        .args(ARGUMENTS)
        .env_clear()
        .env("HOME", home)
        .env(QUIET_SWITCH.0, QUIET_SWITCH.1)
        .current_dir(working_folder)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    command
}

/// Why a call printed nothing Atlas keeps.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CallFailure {
    /// Still running at the time limit.
    TimedOut,
    /// Not started, ended with an error, or printed more than the cap.
    Failed,
}

/// What the command printed, when it ended well and closed its output within `time_limit` and
/// `output_cap` bytes. Whatever it started is killed with it on every way out, so nothing the
/// call began is running once this returns.
pub(crate) fn run_capped(
    mut command: Command,
    time_limit: Duration,
    output_cap: usize,
) -> Result<Vec<u8>, CallFailure> {
    let mut child = command
        .process_group(0)
        .spawn()
        .map_err(|_| CallFailure::Failed)?;
    let stdout = child.stdout.take().ok_or(CallFailure::Failed)?;
    let (printed, received) = mpsc::channel();
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stdout.take(output_cap as u64 + 1).read_to_end(&mut bytes);
        let _ = printed.send(bytes);
    });
    let deadline = Instant::now() + time_limit;
    let mut output: Option<Vec<u8>> = None;
    let outcome = loop {
        if output.is_none() {
            output = received.try_recv().ok();
        }
        if output
            .as_ref()
            .is_some_and(|bytes| bytes.len() > output_cap)
        {
            break Err(CallFailure::Failed);
        }
        match child.try_wait() {
            // A child the program left holding the output keeps it open: its end is awaited
            // only until the same deadline.
            Ok(Some(status)) if status.success() => {
                let left = deadline.saturating_duration_since(Instant::now());
                break match output.take().or_else(|| received.recv_timeout(left).ok()) {
                    Some(bytes) if bytes.len() <= output_cap => Ok(bytes),
                    Some(_) => Err(CallFailure::Failed),
                    None => Err(CallFailure::TimedOut),
                };
            }
            Ok(None) if Instant::now() < deadline => std::thread::sleep(EXIT_POLL),
            Ok(None) => break Err(CallFailure::TimedOut),
            _ => break Err(CallFailure::Failed),
        }
    };
    // SAFETY: the group is the one `process_group(0)` made, named by the child's own pid.
    unsafe { libc::killpg(child.id() as libc::pid_t, libc::SIGKILL) };
    let _ = child.wait();
    outcome
}
