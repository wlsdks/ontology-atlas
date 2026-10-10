use std::fs;
use std::path::{Component, Path, PathBuf};

use super::runner::run_git;
use crate::errors::coded;

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

/// "." when the vault is the repo root.
pub(super) fn vault_pathspec(repo_root: &Path, vault_dir: &Path) -> String {
    match vault_dir.strip_prefix(repo_root) {
        Ok(rel) => {
            let mut parts: Vec<String> = Vec::new();
            for component in rel.components() {
                if let Component::Normal(part) = component {
                    parts.push(part.to_string_lossy().into_owned());
                }
            }
            if parts.is_empty() {
                ".".into()
            } else {
                parts.join("/")
            }
        }
        Err(_) => ".".into(),
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
