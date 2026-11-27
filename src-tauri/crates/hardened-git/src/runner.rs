//! Running a hardened `git` and collecting what it printed.

use std::ffi::OsString;
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::argv::hardened_git_argv;
use crate::environment::{git_env, git_env_from_process};
use crate::HardeningError;

const POLL_INTERVAL: Duration = Duration::from_millis(2);

/// What to run, and what to bound.
pub struct GitInvocation<'a> {
    /// The folder `git -C` names.
    pub cwd: &'a Path,
    /// The subcommand and its arguments, without a leading `-C`.
    pub args: &'a [String],
    /// A network verb; the verbs `fetch`, `pull`, `push`, `clone` and `ls-remote` always are.
    pub network: bool,
    /// Per stream: output past this many bytes ends the run with
    /// [`GitRunError::OutputTooLarge`].
    pub max_output: usize,
    /// A run past this is killed and ends with [`GitRunError::TimedOut`]. `None` waits.
    pub timeout: Option<Duration>,
    /// Bytes written to standard input; `None` closes it.
    pub stdin: Option<&'a [u8]>,
    /// The environment to start from. `None` is this process's own; callers that must not
    /// depend on it (tests, a spawned child's chosen environment) pass theirs.
    pub environment: Option<Vec<(OsString, OsString)>>,
}

impl<'a> GitInvocation<'a> {
    /// A read with the usual 4 MiB bound per stream, no timeout and no standard input.
    pub fn new(cwd: &'a Path, args: &'a [String]) -> Self {
        Self {
            cwd,
            args,
            network: false,
            max_output: 4 * 1024 * 1024,
            timeout: None,
            stdin: None,
            environment: None,
        }
    }
}

/// What a finished `git` printed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitOutput {
    /// Exit code; `None` when a signal ended the process.
    pub code: Option<i32>,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

impl GitOutput {
    pub fn success(&self) -> bool {
        self.code == Some(0)
    }

    pub fn stdout_text(&self) -> String {
        String::from_utf8_lossy(&self.stdout).into_owned()
    }

    pub fn stderr_text(&self) -> String {
        String::from_utf8_lossy(&self.stderr).into_owned()
    }
}

/// Why a hardened `git` produced no [`GitOutput`].
#[derive(Debug, thiserror::Error)]
pub enum GitRunError {
    #[error(transparent)]
    Hardening(#[from] HardeningError),
    /// `git` could not be started (not installed, or not on the search path).
    #[error("git could not start: {0}")]
    Spawn(std::io::Error),
    #[error("git printed more than the allowed output")]
    OutputTooLarge,
    #[error("git did not finish in time")]
    TimedOut,
}

/// A Windows child must not open a console window.
pub(crate) fn hide_console(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    #[cfg(not(windows))]
    {
        let _ = command;
    }
}

/// Reads to the end of `stream`, keeping at most `limit` bytes. Past the limit the rest is read and
/// dropped, so the child never blocks on a full pipe, and the second value says it happened.
fn read_bounded(mut stream: impl Read, limit: usize) -> (Vec<u8>, bool) {
    let mut bytes = Vec::new();
    let mut over = false;
    let mut chunk = [0u8; 16 * 1024];
    loop {
        match stream.read(&mut chunk) {
            Ok(0) | Err(_) => return (bytes, over),
            Ok(count) => {
                let take = chunk.get(..count).unwrap_or(&[]);
                if over || bytes.len() + take.len() > limit {
                    over = true;
                    bytes = Vec::new();
                } else {
                    bytes.extend_from_slice(take);
                }
            }
        }
    }
}

/// Runs `git` with every hardening applied: the argument list of [`hardened_git_argv`], the
/// environment of [`git_env`] (transports stay only for the snapshot `commit`), no terminal input.
pub fn run_git(invocation: GitInvocation<'_>) -> Result<GitOutput, GitRunError> {
    let argv = hardened_git_argv(invocation.cwd, invocation.args, invocation.network)?;
    let runs_user_hooks = crate::argv::subcommand_of(invocation.args) == Some("commit");
    let environment = match invocation.environment {
        Some(base) => git_env(base, runs_user_hooks),
        None => git_env_from_process(runs_user_hooks),
    };
    let mut command = Command::new("git");
    hide_console(&mut command);
    command
        .args(&argv)
        .env_clear()
        .envs(environment)
        .stdin(if invocation.stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn().map_err(GitRunError::Spawn)?;

    let input = invocation.stdin.map(<[u8]>::to_vec);
    let writer = child.stdin.take().zip(input).map(|(mut pipe, bytes)| {
        std::thread::spawn(move || {
            // A `git` that exits before reading everything closes the pipe; that is its answer.
            let _ = pipe.write_all(&bytes);
        })
    });
    let limit = invocation.max_output;
    let stdout_reader = child
        .stdout
        .take()
        .map(|pipe| std::thread::spawn(move || read_bounded(pipe, limit)));
    let stderr_reader = child
        .stderr
        .take()
        .map(|pipe| std::thread::spawn(move || read_bounded(pipe, limit)));

    let deadline = invocation.timeout.map(|timeout| Instant::now() + timeout);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {}
            Err(error) => return Err(GitRunError::Spawn(error)),
        }
        if deadline.is_some_and(|moment| Instant::now() >= moment) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(GitRunError::TimedOut);
        }
        std::thread::sleep(POLL_INTERVAL);
    };
    if let Some(handle) = writer {
        let _ = handle.join();
    }
    let (stdout, stdout_over) = stdout_reader
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();
    let (stderr, stderr_over) = stderr_reader
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();
    if stdout_over || stderr_over {
        return Err(GitRunError::OutputTooLarge);
    }
    Ok(GitOutput {
        code: status.code(),
        stdout,
        stderr,
    })
}
