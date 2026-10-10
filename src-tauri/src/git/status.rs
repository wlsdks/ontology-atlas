use serde::Serialize;

use super::changes::{find_staged_outside_vault, get_full_porcelain_status, get_porcelain_status};
use super::repo::{
    divergence_counts, find_repo_root, get_current_branch, get_head_short_hash, get_remote_url, get_upstream_ref,
    is_head_detached, vault_pathspec,
};
use super::runner::validate_vault_dir;

#[cfg(test)]
mod tests;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    initialized: bool,
    repo_root: Option<String>,
    pub(super) branch: Option<String>,
    /// `None` means push is unavailable.
    pub(super) upstream: Option<String>,
    changed_count: usize,
    /// The snapshot never touches them.
    staged_outside_vault: Vec<String>,
    /// `None` without an upstream. Without these the Push button could only lie.
    pub(super) ahead: Option<usize>,
    /// `None` without an upstream.
    pub(super) behind: Option<usize>,
    /// Read locally, never contacting the remote. "No remote", "never pushed" and
    /// "no branch" need different next steps, or connecting a remote overwrites origin.
    pub(super) has_origin: bool,
    /// Nothing can be sent until a branch is checked out.
    detached: bool,
    /// `None` before the first commit.
    head_short_hash: Option<String>,
}

/// Reports `initialized:false` outside a repo instead of an error, since auto-init is forbidden.
#[tauri::command(async)]
pub fn git_status(vault_path: String) -> Result<GitStatusResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let Some(repo_root) = find_repo_root(&vault_dir)? else {
        return Ok(GitStatusResult {
            initialized: false,
            repo_root: None,
            branch: None,
            upstream: None,
            changed_count: 0,
            staged_outside_vault: Vec::new(),
            ahead: None,
            behind: None,
            has_origin: false,
            detached: false,
            head_short_hash: None,
        });
    };
    let pathspec = vault_pathspec(&repo_root, &vault_dir);
    let rows = get_porcelain_status(&repo_root, &pathspec)?;
    let full_rows = get_full_porcelain_status(&repo_root);
    let staged_outside = find_staged_outside_vault(&full_rows, &pathspec);
    let upstream = get_upstream_ref(&repo_root);
    let (ahead, behind) = match upstream.as_deref() {
        Some(_) => divergence_counts(&repo_root),
        None => (None, None),
    };

    Ok(GitStatusResult {
        initialized: true,
        repo_root: Some(repo_root.to_string_lossy().into_owned()),
        branch: get_current_branch(&repo_root),
        upstream,
        changed_count: rows.len(),
        staged_outside_vault: staged_outside,
        ahead,
        behind,
        has_origin: get_remote_url(&repo_root, "origin").is_some(),
        detached: is_head_detached(&repo_root),
        head_short_hash: get_head_short_hash(&repo_root),
    })
}
