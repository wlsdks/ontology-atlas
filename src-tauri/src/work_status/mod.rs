//! Work status: which agent session holds which worktree of a chosen repository, read from Git,
//! from the pids that worktree locks name, from the working folders of agent programs, and from
//! Claude Code's own session list; while visible, from macOS's file-change notices and from the
//! memory and CPU agents' commands use. Nothing here writes or leaves the machine, and the only
//! process it signals is one it started.

mod activity;
mod agent_processes;
mod agent_sessions;
mod file_pulse;
mod fingerprint;
mod git_read;
mod landed;
mod load;
mod worktrees;

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::acp::session::AcpSessions;
use worktrees::WorktreeRow;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkStatusSnapshot {
    /// `ready`, or why nothing was read: `ungranted`, `unreadable`, `no-history`, `git-missing`.
    status: String,
    /// The repository's top folder; the page watches it through `work_status_fingerprint`.
    root: String,
    /// `owner/name` from `origin` when it has that shape, else the folder name.
    repository: String,
    /// The remote host without user information, when `origin` names one.
    host: Option<String>,
    /// The branch merged rows are measured against.
    base_branch: Option<String>,
    worktrees: Vec<WorktreeRow>,
}

impl WorkStatusSnapshot {
    fn unavailable(status: &str) -> Self {
        Self {
            status: status.into(),
            root: String::new(),
            repository: String::new(),
            host: None,
            base_branch: None,
            worktrees: vec![],
        }
    }
}

/// The repository the page chose, or the one its open vault lives in; both are source grants.
fn granted_root(repository_path: &str) -> Result<PathBuf, &'static str> {
    crate::canonical_source_root(repository_path).map_err(|reason| {
        if reason == "source-root-not-granted" {
            "ungranted"
        } else {
            "unreadable"
        }
    })
}

#[tauri::command(async)]
pub fn work_status_read(
    sessions: State<'_, AcpSessions>,
    repository_path: String,
) -> WorkStatusSnapshot {
    let root = match granted_root(&repository_path) {
        Ok(root) => root,
        Err(status) => return WorkStatusSnapshot::unavailable(status),
    };
    let acp_roots = sessions.session_roots();
    let acp_pids: Vec<u32> = acp_roots.iter().map(|(pid, _)| *pid).collect();
    let processes = agent_processes::agent_processes(&acp_pids);
    match worktrees::read_repository(&root, &acp_roots, &processes) {
        Ok(read) => WorkStatusSnapshot {
            status: "ready".into(),
            root: read.root.to_string_lossy().into_owned(),
            repository: read.repository,
            host: read.host,
            base_branch: read.base_branch,
            worktrees: read.rows,
        },
        Err(status) => WorkStatusSnapshot::unavailable(status),
    }
}

/// A digest of the Git administrative files that change when a worktree is added, removed,
/// locked, unlocked or committed to, plus which agent works in which worktree; the page rereads
/// only when it differs. Spawns no process.
#[tauri::command(async)]
pub fn work_status_fingerprint(
    sessions: State<'_, AcpSessions>,
    repository_path: String,
) -> Option<String> {
    let root = granted_root(&repository_path).ok()?;
    let acp_pids: Vec<u32> = sessions
        .session_roots()
        .iter()
        .map(|(pid, _)| *pid)
        .collect();
    fingerprint::admin_fingerprint(&root, &agent_processes::agent_processes(&acp_pids))
}

/// What each Claude Code session in the repository's worktrees says of itself (waiting for its
/// person, working, or done replying) and how the last read of the list went. One
/// `claude agents --json` every ten seconds, or a second after a Claude Code process appears or
/// ends, with no network; `None` while one runs or while the person has the read switched off.
#[tauri::command(async)]
pub fn work_status_agent_sessions(
    app: AppHandle,
    sessions: State<'_, AcpSessions>,
    repository_path: String,
) -> Option<agent_sessions::SessionsRead> {
    let root = granted_root(&repository_path).ok()?;
    let working_folder = app.path().app_data_dir().ok()?;
    let acp_pids: Vec<u32> = sessions
        .session_roots()
        .iter()
        .map(|(pid, _)| *pid)
        .collect();
    agent_sessions::sessions_read(
        &root,
        &agent_processes::agent_processes(&acp_pids),
        &working_folder,
    )
}

/// The person switched the session-list read on or off. Off holds in Rust, so no ask starts the
/// program, and the last list leaves memory.
#[tauri::command(async)]
pub fn work_status_set_agent_sessions_read(on: bool) {
    agent_sessions::set_reading(on);
}

/// One stamp per worktree from stats of its `HEAD`, `index` and reflog; the page reads a
/// worktree's activity again only when its stamp moves or on its beat. Spawns no process.
#[tauri::command(async)]
pub fn work_status_activity_stamps(repository_path: String) -> Option<BTreeMap<String, String>> {
    activity::activity_stamps(&granted_root(&repository_path).ok()?)
}

/// What one worktree is doing: its newest commit subjects beyond the base branch and its
/// uncommitted files. Two `git` processes, one read at a time.
#[tauri::command(async)]
pub fn work_status_activity(
    repository_path: String,
    worktree_id: String,
    base_branch: Option<String>,
) -> Option<activity::WorktreeActivity> {
    let root = granted_root(&repository_path).ok()?;
    activity::read_activity(&root, &worktree_id, base_branch.as_deref())
}

/// The newest changes the base branch took in, merges and squashed commits alike, with how much
/// each changed: the record of finished work, which outlives the worktrees it was done in. One `git log`.
#[tauri::command(async)]
pub fn work_status_landed(
    repository_path: String,
    base_branch: String,
) -> Option<landed::LandedRead> {
    landed::read_landed(&granted_root(&repository_path).ok()?, &base_branch)
}

/// One finished change opened: the branch commits a merge brought and the files it changed.
#[tauri::command(async)]
pub fn work_status_landed_detail(
    repository_path: String,
    hash: String,
) -> Option<landed::LandedDetail> {
    landed::read_detail(&granted_root(&repository_path).ok()?, &hash)
}

/// The person switched session names on or off. Off holds in Rust: the list is read without
/// names and the names held leave memory at once; on, they return with the next list read.
#[tauri::command(async)]
pub fn work_status_set_session_names(on: bool) {
    agent_sessions::set_names(on);
}

/// How many files changed in each drawn worktree, per 10 s step for the last hour, and when the
/// last change was. Watches the folders of `worktree_ids` that Git lists for the repository, one
/// watcher for all, and answers from memory; at most one `git check-ignore` per worktree in 10 s.
/// `None` while switched off, and on every platform but macOS.
#[tauri::command(async)]
pub fn work_status_file_pulse(
    repository_path: String,
    worktree_ids: Vec<String>,
) -> Option<file_pulse::PulseRead> {
    #[cfg(target_os = "macos")]
    {
        let root = granted_root(&repository_path).ok()?;
        file_pulse::pulse_read(
            agent_sessions::worktree_folders(&root),
            &worktree_ids,
            file_pulse::git_check,
        )
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (repository_path, worktree_ids);
        None
    }
}

/// Work status was hidden: the watcher stops, and the counts wait for it to be shown again. Rust
/// also ends a watcher nobody asked for in 10 s, so a page that vanished leaves none running.
#[tauri::command(async)]
pub fn work_status_pause_file_pulse() {
    file_pulse::stop_watching();
}

/// The person switched the file-change pulse on or off. Off stops the watcher, drops every count,
/// and holds in Rust, so no ask starts it again.
#[tauri::command(async)]
pub fn work_status_set_file_pulse(on: bool) {
    file_pulse::set_watching(on);
}

/// Memory and CPU per worktree, by tool, and this Mac's memory, CPU and GPU, sampled at most once
/// in 4 s. `None` while switched off, while a sample runs, and on every platform but macOS.
#[tauri::command(async)]
pub fn work_status_load(
    sessions: State<'_, AcpSessions>,
    repository_path: String,
) -> Option<load::LoadRead> {
    let root = granted_root(&repository_path).ok()?;
    let acp_pids: Vec<u32> = sessions
        .session_roots()
        .iter()
        .map(|(pid, _)| *pid)
        .collect();
    load::load_read(&agent_sessions::worktree_folders(&root), &acp_pids)
}

/// Load is read now (switched on and the screen visible) or not. Off holds in Rust and drops every
/// sample held, so the first sample after it has no CPU figure.
#[tauri::command(async)]
pub fn work_status_set_load(on: bool) {
    load::set_reading(on);
}
