//! Git's verdict on which changed paths it ignores: one `git check-ignore` per batch, through the
//! hardened runner, with the paths on its input. A tracked file is never reported as ignored.

use std::collections::HashSet;
use std::io::{Read, Write};
use std::os::unix::process::CommandExt;
use std::path::Path;
use std::process::{Child, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use super::counts::Verdict;

/// Git ends `check-ignore` with 0 when it ignores some path and 1 when it ignores none.
const SOME_IGNORED: i32 = 0;
const NONE_IGNORED: i32 = 1;
/// Git ends with 128 when it refuses a path, after printing the verdicts it reached.
const REFUSED: i32 = 128;
/// A `.gitignore` that is a named pipe, or a slow disk, must not hold the ask.
pub(crate) const TIME_LIMIT: Duration = Duration::from_secs(5);
/// 4,096 waiting paths of about 1 KiB each fit with room to spare.
const OUTPUT_CAP_BYTES: usize = 8 * 1024 * 1024;
const ERROR_CAP_BYTES: usize = 16 * 1024;
const EXIT_POLL: Duration = Duration::from_millis(10);

/// Every name is sent as `./<path>`, so Git reads it as a plain path and never as pathspec magic
/// (`:!x`, `:(glob)x`, `:/x`); Git answers with the same prefix.
const PLAIN_PATH_PREFIX: &str = "./";

/// The verdict on `relative_paths`, asked in that order, in the worktree at `folder`; `None`
/// when Git could not say within `TIME_LIMIT`.
pub(crate) fn ignored_paths<'a>(
    folder: &Path,
    relative_paths: impl Iterator<Item = &'a str>,
) -> Option<Verdict> {
    let mut input = Vec::new();
    let mut asked = Vec::new();
    for path in relative_paths {
        input.extend_from_slice(PLAIN_PATH_PREFIX.as_bytes());
        input.extend_from_slice(path.as_bytes());
        input.push(0);
        asked.push(path);
    }
    let mut command = crate::git::hardened_base_command();
    command
        // `check-ignore` refuses every path under literal pathspecs; the prefix keeps names plain.
        .env_remove("GIT_LITERAL_PATHSPECS")
        .env("GIT_NO_LAZY_FETCH", "1")
        .env("GIT_ALLOW_PROTOCOL", "")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("LC_ALL", "C")
        .args(["check-ignore", "-z", "--stdin"])
        .current_dir(folder)
        .process_group(0)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let child = command.spawn().ok()?;
    let (code, printed, error) = run_capped(child, input)?;
    let ignored: HashSet<String> = printed
        .split(|byte| *byte == 0)
        .filter_map(|path| {
            let path = String::from_utf8_lossy(path);
            path.strip_prefix(PLAIN_PATH_PREFIX).map(str::to_string)
        })
        .collect();
    match code {
        SOME_IGNORED | NONE_IGNORED => Some(Verdict {
            ignored,
            refused: None,
        }),
        REFUSED => {
            let error = String::from_utf8_lossy(&error);
            let refused = asked
                .iter()
                .find(|path| error.contains(&format!("'{PLAIN_PATH_PREFIX}{path}'")))?;
            Some(Verdict {
                ignored,
                refused: Some((*refused).to_string()),
            })
        }
        _ => None,
    }
}

/// The exit code, output and error output of `child`, fed `input`; `None` past the time limit or
/// a cap. Whatever the child started is killed with it on every way out.
fn run_capped(mut child: Child, input: Vec<u8>) -> Option<(i32, Vec<u8>, Vec<u8>)> {
    let mut stdin = child.stdin.take()?;
    let stdout = child.stdout.take()?;
    let stderr = child.stderr.take()?;
    // Written and read from other threads so a full pipe cannot stall either side.
    std::thread::spawn(move || stdin.write_all(&input));
    let (printed_to, printed) = mpsc::channel();
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stdout
            .take(OUTPUT_CAP_BYTES as u64 + 1)
            .read_to_end(&mut bytes);
        let _ = printed_to.send(bytes);
    });
    let (error_to, error) = mpsc::channel();
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stderr.take(ERROR_CAP_BYTES as u64).read_to_end(&mut bytes);
        let _ = error_to.send(bytes);
    });
    let deadline = Instant::now() + TIME_LIMIT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(EXIT_POLL),
            _ => break None,
        }
    };
    // SAFETY: the group is the one `process_group(0)` made, named by the child's own pid.
    unsafe { libc::killpg(child.id() as libc::pid_t, libc::SIGKILL) };
    let _ = child.wait();
    let code = status?.code()?;
    let left = deadline.saturating_duration_since(Instant::now());
    let printed = printed.recv_timeout(left).ok()?;
    let error = error.recv_timeout(left).unwrap_or_default();
    (printed.len() <= OUTPUT_CAP_BYTES).then_some((code, printed, error))
}
