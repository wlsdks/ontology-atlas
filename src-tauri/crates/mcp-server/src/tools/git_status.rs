//! `git_status`: what changed in the vault's folder since the last commit, and what else is in
//! flight in the repository that a snapshot of the vault would leave out. Read-only.

use hardened_git::{ChangeKind, HeadState, StatusRow};
use serde::Serialize;

use super::vault_repository::{locate, Located, VaultRepository};
use crate::answer::ToolOutput;
use crate::dispatch::CallContext;
use crate::error::ToolError;

#[derive(Serialize)]
struct Counts {
    total: usize,
    staged: usize,
    unstaged: usize,
    untracked: usize,
    #[serde(rename = "outsideVault")]
    outside_vault: usize,
    #[serde(rename = "stagedOutsideVault")]
    staged_outside_vault: usize,
}

#[derive(Serialize)]
struct FileRow<'a> {
    path: &'a str,
    index: char,
    worktree: char,
    status: &'static str,
    staged: bool,
    unstaged: bool,
}

#[derive(Serialize)]
struct Risk {
    level: &'static str,
    warnings: Vec<String>,
}

#[derive(Serialize)]
struct Status<'a> {
    operation: &'static str,
    ok: bool,
    #[serde(rename = "repoRoot")]
    repo_root: String,
    #[serde(rename = "vaultRoot")]
    vault_root: String,
    #[serde(rename = "vaultPathspec")]
    vault_pathspec: &'a str,
    head: Option<&'a str>,
    branch: Option<&'a str>,
    #[serde(rename = "detachedHead")]
    detached_head: bool,
    #[serde(rename = "operationInProgress")]
    operation_in_progress: Option<&'static str>,
    counts: Counts,
    files: Vec<FileRow<'a>>,
    #[serde(rename = "stagedOutsideVault")]
    staged_outside_vault: Vec<&'a str>,
    risk: Risk,
}

fn status_word(kind: ChangeKind) -> &'static str {
    match kind {
        ChangeKind::Untracked => "untracked",
        ChangeKind::Deleted => "deleted",
        ChangeKind::Added => "added",
        ChangeKind::Modified => "modified",
    }
}

fn file_row(row: &StatusRow) -> FileRow<'_> {
    FileRow {
        path: &row.path,
        index: row.index,
        worktree: row.worktree,
        status: status_word(row.kind),
        staged: row.staged,
        unstaged: row.unstaged,
    }
}

/// The warnings of a status, in the order an agent reads them: what blocks a snapshot first.
fn risk_of(
    head: &HeadState,
    operation: Option<&str>,
    staged_outside: usize,
    outside: usize,
) -> Risk {
    let detached = matches!(head, HeadState::Detached { .. });
    let unborn = head.commit().is_none();
    let level = if operation.is_some() || unborn || detached {
        "high"
    } else if staged_outside > 0 {
        "medium"
    } else {
        "low"
    };
    let mut warnings = Vec::new();
    if let Some(name) = operation {
        warnings.push(format!("git {name} is in progress; snapshot is blocked"));
    }
    if unborn {
        warnings.push(
            "repository has no HEAD commit yet; create an initial commit before MCP snapshots"
                .to_string(),
        );
    }
    if detached {
        warnings.push(
            "repository is on a detached HEAD; snapshot is blocked to prevent an orphan commit"
                .to_string(),
        );
    }
    if staged_outside > 0 {
        warnings.push(format!(
            "{staged_outside} staged file(s) outside the vault will not be included"
        ));
    }
    if outside > 0 {
        warnings.push(format!(
            "{outside} changed file(s) outside the vault remain untouched"
        ));
    }
    Risk { level, warnings }
}

fn read_status(found: &VaultRepository) -> Result<ToolOutput, ToolError> {
    let tree = found
        .repository
        .working_tree(&[])
        .map_err(|error| ToolError::failed(error.to_string()))?;
    let operation = found
        .repository
        .operation_in_progress()
        .map_err(|error| ToolError::failed(error.to_string()))?
        .map(|operation| operation.name());
    let (inside, outside): (Vec<&StatusRow>, Vec<&StatusRow>) = tree
        .rows
        .iter()
        .partition(|row| found.scope.holds(&row.path));
    let staged_outside: Vec<&str> = outside
        .iter()
        .filter(|row| row.staged)
        .map(|row| row.path.as_str())
        .collect();
    let counts = Counts {
        total: inside.len(),
        staged: inside.iter().filter(|row| row.staged).count(),
        unstaged: inside.iter().filter(|row| row.unstaged).count(),
        untracked: inside
            .iter()
            .filter(|row| row.kind == ChangeKind::Untracked)
            .count(),
        outside_vault: outside.len(),
        staged_outside_vault: staged_outside.len(),
    };
    let risk = risk_of(&tree.head, operation, staged_outside.len(), outside.len());
    ToolOutput::json(&Status {
        operation: "git_status",
        ok: true,
        repo_root: found.top_level.to_string_lossy().into_owned(),
        vault_root: found.vault.to_string_lossy().into_owned(),
        vault_pathspec: found.scope.as_str(),
        head: tree.head.commit().map(|commit| commit.as_str()),
        branch: tree.head.branch(),
        detached_head: matches!(tree.head, HeadState::Detached { .. }),
        operation_in_progress: operation,
        counts,
        files: inside.iter().map(|row| file_row(row)).collect(),
        staged_outside_vault: staged_outside,
        risk,
    })
}

pub fn call(context: &CallContext<'_>) -> Result<ToolOutput, ToolError> {
    match locate(context, "git_status")? {
        Located::Found(found) => read_status(&found),
        Located::Missing(reason) => ToolOutput::json(&reason),
    }
}
