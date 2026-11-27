use std::fs;
use std::path::{Path, PathBuf};

use hardened_git::RepoPath;
use source_scan::{place_folder, FolderPlacementError};

use super::runner::run_git;
use crate::coded_error::coded;

#[cfg(test)]
mod tests;

/// `Ok(None)` outside a git repo.
pub(crate) fn find_repo_root(vault_dir: &Path) -> Result<Option<PathBuf>, String> {
    let out = run_git(vault_dir, &["rev-parse", "--show-toplevel"])?;
    if !out.success {
        return Ok(None);
    }
    let trimmed = out.stdout.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    // Canonicalized to match vault_dir's pathspec base (for example /var vs /private/var).
    let root = PathBuf::from(trimmed);
    let canonical = fs::canonicalize(&root).unwrap_or(root);
    if !repo_toplevel_is_trustworthy(&canonical) || !vault_dir.starts_with(&canonical) {
        return Ok(None);
    }
    Ok(Some(canonical))
}

pub(super) fn repo_toplevel_is_trustworthy(toplevel: &Path) -> bool {
    toplevel.join(".git").exists() && crate::vault_root_rejection(toplevel).is_none()
}

/// `Err` outside a repo; this never auto-inits. The `git_init` button is a separate,
/// explicit path.
pub(super) fn require_repo_root(vault_dir: &Path) -> Result<PathBuf, String> {
    match find_repo_root(vault_dir)? {
        Some(root) => Ok(root),
        None => Err(coded("git-repo-missing", "")),
    }
}

/// Where the vault lies below the repository's top, as git is asked about it: `.` when the vault
/// is the top, and also when it is not inside the repository (callers reach here only with a
/// vault `find_repo_root` found inside it).
pub(super) fn vault_place(repo_root: &Path, vault_dir: &Path) -> RepoPath {
    place_folder(repo_root, vault_dir)
        .map(|placed| placed.path)
        .unwrap_or_else(|_| RepoPath::root())
}

/// [`vault_place`] as the text a pathspec argument takes. A vault whose folder name is not text
/// cannot be written in one, so its lossy spelling is used, which names nothing and therefore
/// never widens a snapshot to the whole repository.
pub(super) fn vault_pathspec(repo_root: &Path, vault_dir: &Path) -> String {
    match place_folder(repo_root, vault_dir) {
        Ok(placed) => placed.path.as_str().to_string(),
        Err(FolderPlacementError::NotAskable { real }) => real
            .strip_prefix(fs::canonicalize(repo_root).unwrap_or_else(|_| repo_root.to_path_buf()))
            .map(|below| below.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| ".".into()),
        Err(FolderPlacementError::Outside { .. }) => ".".into(),
    }
}

pub(super) fn get_current_branch(repo_root: &Path) -> Option<String> {
    let out = run_git(repo_root, &["rev-parse", "--abbrev-ref", "HEAD"]).ok()?;
    if !out.success {
        return None;
    }
    let trimmed = out.stdout.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub(super) fn get_upstream_ref(repo_root: &Path) -> Option<String> {
    let out = run_git(
        repo_root,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    )
    .ok()?;
    if !out.success {
        return None;
    }
    let trimmed = out.stdout.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// As of the last fetch, so the screen needs a separate Fetch to refresh them.
pub(super) fn divergence_counts(repo_root: &Path) -> (Option<usize>, Option<usize>) {
    let out = match run_git(
        repo_root,
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    ) {
        Ok(o) if o.success => o,
        // A vanished upstream or broken ref is unknown, not 0.
        _ => return (None, None),
    };
    let mut parts = out.stdout.split_whitespace();
    let ahead = parts.next().and_then(|v| v.parse::<usize>().ok());
    let behind = parts.next().and_then(|v| v.parse::<usize>().ok());
    (ahead, behind)
}

pub(super) fn get_head_hash(repo_root: &Path) -> Option<String> {
    let out = run_git(repo_root, &["rev-parse", "HEAD"]).ok()?;
    if !out.success {
        return None;
    }
    let trimmed = out.stdout.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub(super) fn get_remote_url(repo_root: &Path, remote_name: &str) -> Option<String> {
    let out = run_git(repo_root, &["remote", "get-url", remote_name]).ok()?;
    if !out.success {
        return None;
    }
    let trimmed = out.stdout.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// `git symbolic-ref -q HEAD` fails exactly then; if git cannot run, report not detached.
pub(super) fn is_head_detached(repo_root: &Path) -> bool {
    run_git(repo_root, &["symbolic-ref", "-q", "HEAD"])
        .map(|out| !out.success)
        .unwrap_or(false)
}

pub(super) fn get_head_short_hash(repo_root: &Path) -> Option<String> {
    let out = run_git(repo_root, &["rev-parse", "--short", "HEAD"]).ok()?;
    if !out.success {
        return None;
    }
    let trimmed = out.stdout.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}
