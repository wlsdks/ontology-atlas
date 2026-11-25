//! Whether a Claude Code session waits for its person, works or has replied, from Claude Code's
//! own session list (`claude agents --json`). The list is read by one fixed call on macOS, which
//! gives the program no network; no argument, environment or transcript of any process is read,
//! and nothing is written. Only the last list, without ids, is held, in memory, until the person
//! switches the read off; it holds each session's name only while the person leaves names on.

// Only macOS runs the call, so its parse and half the statuses are unused elsewhere.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

#[cfg(target_os = "macos")]
mod call;
mod name;
mod pace;
mod parse;
#[cfg(test)]
mod tests;

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;

use serde::Serialize;

use super::agent_processes::{AgentProcess, AgentTool};
use super::fingerprint::common_dir;
use super::worktrees::{admin_ids_by_worktree, normalize, points_back};
use name::SessionName;
use pace::{Pace, SeenSession};
use parse::{ListedSession, SessionState};

/// A list's start is cut to the second its process start is told in, and a clock can step.
const START_SLACK_SECONDS: i64 = 2;
const MAIN_CHECKOUT_ID: &str = "main";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SessionRow {
    /// The worktree the session's own folder lies in.
    worktree_id: String,
    pid: u32,
    state: SessionState,
    /// One line of at most 60 characters; never written, logged or sent anywhere but the page.
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<SessionName>,
}

/// How the last read of the list went: what the status line says beside its switch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ReadStatus {
    /// Sessions run and the first read has not come due.
    #[default]
    Pending,
    /// No Claude Code session runs, so nothing is read.
    NoSession,
    Read,
    /// No program in the folders Claude Code installs itself in.
    NotFound,
    TimedOut,
    Failed,
    /// The program printed something that is not the list.
    UnknownForm,
    /// This system cannot run the program with no network, so it is never run.
    Unsupported,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub(crate) struct SessionsRead {
    status: ReadStatus,
    rows: Vec<SessionRow>,
}

#[derive(Default)]
struct Reader {
    /// The person switched the read off: no ask starts the program, whoever sends it.
    off: bool,
    /// The person switched session names off: the list is read without them.
    names_off: bool,
    pace: Pace,
    status: ReadStatus,
    listed: Vec<ListedSession>,
}

static READER: Mutex<Option<Reader>> = Mutex::new(None);

/// Each Claude Code session standing in one of the repository's worktrees, with what it says of
/// itself, and how the last read went. Reads the list when `Pace` allows, else answers from the
/// last one; `None` while another read runs or the read is switched off. A list that cannot be
/// read leaves no rows, so rooms keep the words they had.
pub(super) fn sessions_read(
    root: &Path,
    processes: &[AgentProcess],
    working_folder: &Path,
) -> Option<SessionsRead> {
    let mut guard = READER.try_lock().ok()?;
    let reader = guard.get_or_insert_with(Reader::default);
    if reader.off {
        return None;
    }
    let sessions = claude_sessions(processes);
    if reader.pace.take_turn(Instant::now(), &sessions) {
        (reader.status, reader.listed) = match read_list(working_folder, !reader.names_off) {
            Ok(listed) => (ReadStatus::Read, listed),
            Err(status) => (status, vec![]),
        };
    }
    if sessions.is_empty() {
        reader.listed.clear();
        reader.status = status_with_no_session();
    }
    Some(SessionsRead {
        status: reader.status,
        rows: join(&reader.listed, &sessions, &worktree_folders(root)),
    })
}

/// Whether the person leaves the read on. Off drops the last list, waiting out a read in flight,
/// and holds here, so an ask already on its way starts nothing. The pace is kept: switching back
/// on reads one second after the last read at the soonest.
pub(super) fn set_reading(on: bool) {
    let Ok(mut guard) = READER.lock() else {
        return;
    };
    let reader = guard.get_or_insert_with(Reader::default);
    reader.off = !on;
    reader.listed.clear();
    reader.status = ReadStatus::default();
    reader.pace.expect_change();
}

/// Whether the person leaves session names on. Off drops every name held at once, waiting out a
/// read in flight; on asks for the next read as after a change, so names return within one read.
pub(super) fn set_names(on: bool) {
    let Ok(mut guard) = READER.lock() else {
        return;
    };
    let reader = guard.get_or_insert_with(Reader::default);
    reader.names_off = !on;
    if on {
        reader.pace.expect_change();
    } else {
        forget_names(&mut reader.listed);
    }
}

pub(crate) fn forget_names(listed: &mut [ListedSession]) {
    for session in listed {
        session.name = None;
    }
}

pub(crate) fn status_with_no_session() -> ReadStatus {
    if cfg!(target_os = "macos") {
        ReadStatus::NoSession
    } else {
        ReadStatus::Unsupported
    }
}

/// The Claude Code programs the process read credits with work, one per pid, in pid order.
pub(crate) fn claude_sessions(processes: &[AgentProcess]) -> Vec<SeenSession> {
    let mut sessions: Vec<SeenSession> = processes
        .iter()
        .filter(|process| process.tool == AgentTool::ClaudeCode)
        .map(|process| (process.pid, process.started_at))
        .collect();
    sessions.sort();
    sessions.dedup();
    sessions
}

#[cfg(target_os = "macos")]
fn read_list(working_folder: &Path, keep_names: bool) -> Result<Vec<ListedSession>, ReadStatus> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let home = home.ok_or(ReadStatus::NotFound)?;
    let program = call::installed_program(&home).ok_or(ReadStatus::NotFound)?;
    let command = call::list_command(&program, &home, working_folder);
    listed_from(
        call::run_capped(command, call::TIME_LIMIT, call::OUTPUT_CAP_BYTES),
        keep_names,
    )
}

/// The list in what a call printed, or the reason there is none.
#[cfg(target_os = "macos")]
pub(crate) fn listed_from(
    printed: Result<Vec<u8>, call::CallFailure>,
    keep_names: bool,
) -> Result<Vec<ListedSession>, ReadStatus> {
    let output = printed.map_err(|failure| match failure {
        call::CallFailure::TimedOut => ReadStatus::TimedOut,
        call::CallFailure::Failed => ReadStatus::Failed,
    })?;
    std::str::from_utf8(&output)
        .ok()
        .and_then(|text| parse::parse_sessions(text, keep_names))
        .ok_or(ReadStatus::UnknownForm)
}

/// Only macOS can run the program with no network, so only macOS runs it.
#[cfg(not(target_os = "macos"))]
fn read_list(_working_folder: &Path, _keep_names: bool) -> Result<Vec<ListedSession>, ReadStatus> {
    Err(ReadStatus::Unsupported)
}

/// The main checkout and each linked worktree Git records that lies under it or names this
/// repository's record in its own `.git` file, as the worktree read admits them: a stray record
/// cannot bring another project's session onto the page. Reads Git's small administrative files;
/// spawns no process.
pub(crate) fn worktree_folders(root: &Path) -> Vec<(PathBuf, String)> {
    let Some(common) = common_dir(root) else {
        return vec![];
    };
    let Some(main) = common
        .parent()
        .map(|folder| normalize(&folder.to_string_lossy()))
    else {
        return vec![];
    };
    let linked = admin_ids_by_worktree(&common)
        .into_iter()
        .filter(|(folder, id)| folder.starts_with(&main) || points_back(folder, &common, id))
        .collect::<Vec<_>>();
    std::iter::once((main, MAIN_CHECKOUT_ID.to_string()))
        .chain(linked)
        .collect()
}

/// A listed session counts when the process read shows the same pid as Claude Code, started no
/// later than the session did (a later start is another program that took the pid), and its
/// folder lies in a worktree: the deepest one. O(listed × (sessions + worktrees)).
pub(crate) fn join(
    listed: &[ListedSession],
    sessions: &[SeenSession],
    worktrees: &[(PathBuf, String)],
) -> Vec<SessionRow> {
    listed
        .iter()
        .filter_map(|entry| {
            let (_, process_start) = sessions.iter().find(|(pid, _)| *pid == entry.pid)?;
            if (*process_start)? > entry.started_at_ms / 1000 + START_SLACK_SECONDS {
                return None;
            }
            let folder = normalize(&entry.folder.to_string_lossy());
            let (_, worktree_id) = worktrees
                .iter()
                .filter(|(path, _)| folder.starts_with(path))
                .max_by_key(|(path, _)| path.components().count())?;
            Some(SessionRow {
                worktree_id: worktree_id.clone(),
                pid: entry.pid,
                state: entry.state,
                name: entry.name.clone(),
            })
        })
        .collect()
}
