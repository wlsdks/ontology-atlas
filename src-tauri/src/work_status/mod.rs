//! Work status: which agent session holds which worktree of a chosen repository, read from Git
//! and from the pids that worktree locks name. Nothing here writes, signals or leaves the machine.

mod fingerprint;
mod git_read;
mod worktrees;

use std::path::PathBuf;

use serde::Serialize;
use tauri::State;

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
    match worktrees::read_repository(&root, &acp_roots) {
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
/// locked, unlocked or committed to; the page rereads only when it differs. Spawns no process.
#[tauri::command(async)]
pub fn work_status_fingerprint(repository_path: String) -> Option<String> {
    let root = granted_root(&repository_path).ok()?;
    fingerprint::admin_fingerprint(&root)
}
