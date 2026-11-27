use hardened_git::{GitReadError, GitRunError, RepoPath};
use serde::Serialize;
use source_scan::{date_paths, Dating, DatingCommit, WantedPath, DATING_WINDOW_COMMITS};

pub(crate) mod bound;
pub(crate) mod text;

use super::repo::{require_repo_root, vault_pathspec};
use super::runner::{hardened_repository, validate_vault_dir};
use crate::coded_error::coded;

#[cfg(test)]
mod tests;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathLastChange {
    path: String,
    /// A moved file or folder reads `false`.
    exists: bool,
    /// A folder's change time is weaker evidence than a file's.
    is_dir: bool,
    /// `None` when uncommitted or older than the window.
    last_changed_at: Option<String>,
    /// Hash of that commit: a concept document's is where its cited files are re-read.
    last_commit: Option<String>,
}

/// One walk over the history dates every wanted path, not one process per concept.
pub(crate) const MAX_EVIDENCE_PATHS: usize = source_scan::MAX_DATED_PATHS;

/// Date vault-relative documents and repository-relative paths under the vault grant.
#[tauri::command(async)]
pub fn git_paths_last_change(
    vault_path: String,
    repo_paths: Vec<String>,
    vault_paths: Vec<String>,
) -> Result<Vec<PathLastChange>, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let pathspec = vault_pathspec(&repo_root, &vault_dir);
    let prefix = if pathspec == "." {
        String::new()
    } else {
        format!("{pathspec}/")
    };

    let mut wanted: Vec<WantedPath> = Vec::new();
    let mut push = |key: &str, resolved: String, dating: Dating| {
        if wanted.len() >= MAX_EVIDENCE_PATHS || wanted.iter().any(|path| path.key == key) {
            return;
        }
        if let Some(resolved) = RepoPath::new(&resolved) {
            wanted.push(WantedPath {
                key: key.to_string(),
                resolved,
                dating,
            });
        }
    };
    // Documents first: the cap is shared, and implementation paths must not starve
    // concept documents.
    for raw in &vault_paths {
        push(
            raw,
            format!("{prefix}{}", raw.trim().trim_end_matches('/')),
            Dating::FirstCommitWithPresentBytes,
        );
    }
    for raw in &repo_paths {
        push(
            raw,
            raw.trim().trim_end_matches('/').to_string(),
            Dating::NewestCommit,
        );
    }
    if wanted.is_empty() {
        return Ok(Vec::new());
    }

    let last = last_changes(&repo_root, &wanted)?;

    Ok(wanted
        .iter()
        .zip(last)
        .map(|(path, dated)| {
            let on_disk = repo_root.join(path.resolved.as_str());
            PathLastChange {
                path: path.key.clone(),
                exists: on_disk.exists(),
                is_dir: on_disk.is_dir(),
                last_changed_at: dated.as_ref().map(|commit| commit.committed_at.clone()),
                last_commit: dated
                    .as_ref()
                    .map(|commit| commit.commit.as_str().to_string()),
            }
        })
        .collect())
}

/// The dating commit of each wanted path, in the order asked. A branch with no commit has no
/// history, and a `git log` that cannot finish dates nothing; only a `git` that cannot start
/// is an error.
fn last_changes(
    repo_root: &std::path::Path,
    wanted: &[WantedPath],
) -> Result<Vec<Option<DatingCommit>>, String> {
    let repository = hardened_repository(repo_root);
    let undated = || vec![None; wanted.len()];
    match repository.head() {
        Ok(Some(_)) => {}
        Ok(None) => return Ok(undated()),
        Err(error) => return unreadable(error, undated),
    }
    match date_paths(&repository, wanted, DATING_WINDOW_COMMITS) {
        Ok(dated) => Ok(dated),
        Err(error) => unreadable(error, undated),
    }
}

fn unreadable<T>(error: GitReadError, undated: impl FnOnce() -> T) -> Result<T, String> {
    match error {
        GitReadError::Run(GitRunError::Spawn(cause)) => Err(coded("git-not-runnable", cause)),
        _ => Ok(undated()),
    }
}
