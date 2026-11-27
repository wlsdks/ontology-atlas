use serde::Serialize;

pub(crate) mod bound;
pub(crate) mod text;

use super::repo::{require_repo_root, vault_pathspec};
use super::runner::{run_git, validate_vault_dir};

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

/// The commit that dates one wanted path.
#[derive(Debug, Clone)]
struct DatingCommit {
    at: String,
    hash: String,
}

/// How a wanted path is dated. A concept document is dated by its bytes, so a commit that only
/// puts back earlier bytes (an undo, a revert) returns the earlier date; a cited file by its newest commit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Dating {
    NewestCommit,
    FirstCommitWithPresentBytes,
}

/// One path a commit touched in `git log --raw --no-abbrev` output, and the blob it left there.
pub(crate) fn raw_touch(line: &str) -> Option<(&str, &str)> {
    let (status, path) = line.strip_prefix(':')?.split_once('\t')?;
    let blob = status.split(' ').nth(3)?;
    Some((blob, path))
}

/// Per path, the blob its newest touch left and the commit dating it so far.
#[derive(Clone)]
pub(crate) struct DatingState<T: Clone> {
    present: Option<String>,
    pub(crate) dated: Option<T>,
}

impl<T: Clone> Default for DatingState<T> {
    fn default() -> Self {
        Self {
            present: None,
            dated: None,
        }
    }
}

impl<T: Clone> DatingState<T> {
    /// Called newest commit first. O(1) per touch.
    pub(crate) fn touched(&mut self, dating: Dating, blob: &str, exact: bool, commit: &T) {
        match (&self.present, dating, exact) {
            (None, _, _) => {
                self.present = Some(blob.to_string());
                self.dated = Some(commit.clone());
            }
            (Some(present), Dating::FirstCommitWithPresentBytes, true) if present == blob => {
                self.dated = Some(commit.clone());
            }
            _ => {}
        }
    }
}

/// One `git log --name-only` walk matched in memory, not one process per concept.
pub(crate) const MAX_EVIDENCE_PATHS: usize = 512;
const EVIDENCE_WALK_COMMITS: &str = "--max-count=3000";

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
        if wanted.len() >= MAX_EVIDENCE_PATHS {
            return;
        }
        if wanted.iter().any(|path| path.key == key) {
            return;
        }
        wanted.push(WantedPath {
            key: key.to_string(),
            resolved,
            dating,
        });
    };
    // Documents first: the cap is shared, and implementation paths must not starve
    // concept documents.
    for raw in &vault_paths {
        if let Some(clean) = safe_relative_path(raw) {
            push(
                raw,
                format!("{prefix}{clean}"),
                Dating::FirstCommitWithPresentBytes,
            );
        }
    }
    for raw in &repo_paths {
        if let Some(clean) = safe_relative_path(raw) {
            push(raw, clean, Dating::NewestCommit);
        }
    }
    if wanted.is_empty() {
        return Ok(Vec::new());
    }

    let last = last_changes(&repo_root, &wanted)?;

    Ok(wanted
        .iter()
        .enumerate()
        .map(|(index, path)| {
            let on_disk = repo_root.join(&path.resolved);
            let dated = last.get(index).and_then(|state| state.dated.as_ref());
            PathLastChange {
                path: path.key.clone(),
                exists: on_disk.exists(),
                is_dir: on_disk.is_dir(),
                last_changed_at: dated.map(|commit| commit.at.clone()),
                last_commit: dated.map(|commit| commit.hash.clone()),
            }
        })
        .collect())
}

struct WantedPath {
    /// As the caller wrote it.
    key: String,
    /// Repository-relative.
    resolved: String,
    dating: Dating,
}

/// The dating commit of each wanted path, by its index, from one walk. O(log lines x wanted).
fn last_changes(
    repo_root: &std::path::Path,
    wanted: &[WantedPath],
) -> Result<Vec<DatingState<DatingCommit>>, String> {
    const REC: char = '\x1e';
    let format = format!("--pretty=format:{REC}%H %cI");
    let mut args: Vec<&str> = vec![
        // Otherwise git C-quotes non-ASCII paths and Korean names never match.
        "-c",
        "core.quotepath=false",
        "log",
        EVIDENCE_WALK_COMMITS,
        &format,
        "--raw",
        "--no-abbrev",
        "--no-renames",
        "--",
    ];
    for path in wanted {
        args.push(path.resolved.as_str());
    }
    let out = run_git(repo_root, &args)?;

    let mut last = vec![DatingState::<DatingCommit>::default(); wanted.len()];
    if out.success {
        let mut current: Option<DatingCommit> = None;
        for line in out.stdout.lines() {
            if let Some(rest) = line.strip_prefix(REC) {
                current = rest.trim().split_once(' ').map(|(hash, at)| DatingCommit {
                    at: at.to_string(),
                    hash: hash.to_string(),
                });
                continue;
            }
            let (Some(commit), Some((blob, touched))) = (current.as_ref(), raw_touch(line)) else {
                continue;
            };
            for (path, state) in wanted.iter().zip(last.iter_mut()) {
                let exact = touched == path.resolved;
                if exact || is_under(touched, &path.resolved) {
                    state.touched(path.dating, blob, exact, commit);
                }
            }
        }
    }

    Ok(last)
}

pub(crate) fn is_under(candidate: &str, folder: &str) -> bool {
    candidate
        .strip_prefix(folder)
        .is_some_and(|rest| rest.starts_with('/'))
}

fn safe_relative_path(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty()
        || trimmed.starts_with('/')
        || trimmed.starts_with('-')
        || trimmed.contains('\\')
        || trimmed.contains('\0')
        || trimmed.split('/').any(|part| part == "..")
    {
        return None;
    }
    Some(trimmed.to_string())
}
