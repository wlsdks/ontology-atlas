use serde::Serialize;
use std::path::Path;

use super::changes::{
    build_change_summary, build_commit_message, find_staged_outside_vault, format_snapshot_summary,
    get_full_porcelain_status, get_porcelain_status, ChangeEntry,
};
use super::classify::{classified_error_string, classify_git_error, git_error_text};
use super::repo::{
    get_current_branch, get_head_hash, get_remote_url, get_upstream_ref, is_head_detached,
    require_repo_root, vault_pathspec,
};
use super::runner::{run_git, run_network_git, validate_vault_dir};
use crate::errors::coded;

#[cfg(test)]
mod tests;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushOutcome {
    pub(super) pushed: bool,
    remote_url: Option<String>,
    pub(super) message: Option<String>,
    guidance: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshotResult {
    pub(super) committed: bool,
    /// "no-changes" or null (committed).
    pub(super) reason: Option<String>,
    commit_hash: Option<String>,
    subject: Option<String>,
    summary: Option<String>,
    counts: SnapshotCounts,
    files: Vec<ChangeEntry>,
    staged_outside_vault: Vec<String>,
    /// Only when push was requested.
    pub(super) push: Option<PushOutcome>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotCounts {
    added: usize,
    modified: usize,
    deleted: usize,
    renamed: usize,
    total: usize,
}

/// Adds and commits only the vault scope. No changes is `reason:"no-changes"` and
/// a requested push still goes. `set_upstream` is the explicit "send this branch"
/// press and is never implied by `push`.
#[tauri::command(async)]
pub fn git_snapshot(
    vault_path: String,
    message: Option<String>,
    push: Option<bool>,
    set_upstream: Option<bool>,
) -> Result<GitSnapshotResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let pathspec = vault_pathspec(&repo_root, &vault_dir);
    let set_upstream = set_upstream.unwrap_or(false);

    let rows = get_porcelain_status(&repo_root, &pathspec)?;
    if rows.is_empty() {
        // A requested push still sends already recorded steps when nothing is new.
        let push_outcome = if push.unwrap_or(false) {
            Some(run_push(&repo_root, set_upstream))
        } else {
            None
        };
        return Ok(GitSnapshotResult {
            committed: false,
            reason: Some("no-changes".into()),
            commit_hash: None,
            subject: None,
            summary: None,
            counts: SnapshotCounts {
                added: 0,
                modified: 0,
                deleted: 0,
                renamed: 0,
                total: 0,
            },
            files: Vec::new(),
            staged_outside_vault: Vec::new(),
            push: push_outcome,
        });
    }

    let changes = build_change_summary(&rows, &repo_root, &vault_dir);
    let auto_summary = format_snapshot_summary(&changes);
    let custom = message.as_deref().map(str::trim).filter(|m| !m.is_empty());
    let subject = custom.unwrap_or(&auto_summary).to_string();
    let full_message = build_commit_message(&subject, &auto_summary, &changes, custom.is_some());

    let full_rows = get_full_porcelain_status(&repo_root);
    let staged_outside = find_staged_outside_vault(&full_rows, &pathspec);

    // Only untracked files inside the vault are added; tracked changes go through the
    // pathspec partial commit without touching the index.
    let untracked: Vec<&str> = rows
        .iter()
        .filter(|r| r.index == '?' && r.worktree == '?')
        .map(|r| r.path.as_str())
        .collect();
    if !untracked.is_empty() {
        let mut add_args: Vec<&str> = vec!["add", "--"];
        add_args.extend_from_slice(&untracked);
        let add_run = run_git(&repo_root, &add_args)?;
        if !add_run.success {
            let info = classify_git_error(&git_error_text(&add_run), "commit");
            return Err(classified_error_string(&info));
        }
    }

    let commit_run = run_git(
        &repo_root,
        &["commit", "-m", &full_message, "--", &pathspec],
    )?;
    if !commit_run.success {
        let info = classify_git_error(&git_error_text(&commit_run), "commit");
        return Err(classified_error_string(&info));
    }

    let commit_hash = get_head_hash(&repo_root);

    let counts = SnapshotCounts {
        added: changes.iter().filter(|c| c.status == "added").count(),
        modified: changes.iter().filter(|c| c.status == "modified").count(),
        deleted: changes.iter().filter(|c| c.status == "deleted").count(),
        renamed: changes.iter().filter(|c| c.status == "renamed").count(),
        total: changes.len(),
    };

    // `-u` only on the explicit send-this-branch press, never because an upstream is missing.
    let push_outcome = if push.unwrap_or(false) {
        Some(run_push(&repo_root, set_upstream))
    } else {
        None
    };

    Ok(GitSnapshotResult {
        committed: true,
        reason: None,
        commit_hash,
        subject: Some(subject),
        summary: Some(auto_summary),
        counts,
        files: changes,
        staged_outside_vault: staged_outside,
        push: push_outcome,
    })
}

/// The commit already exists, so a push failure returns guidance, not `Err`.
/// Without `set_upstream`, `origin` or a branch, nothing is sent.
fn run_push(repo_root: &Path, set_upstream: bool) -> PushOutcome {
    let upstream = get_upstream_ref(repo_root);
    let first_send = upstream.is_none();
    if first_send {
        let refusal = if !set_upstream || get_remote_url(repo_root, "origin").is_none() {
            let branch = get_current_branch(repo_root).unwrap_or_else(|| "<branch>".into());
            Some((
                coded("push-no-upstream", ""),
                format!("git push -u origin {branch}"),
            ))
        } else if is_head_detached(repo_root) {
            // A detached HEAD has no branch name to send under.
            Some((
                coded("push-detached-head", ""),
                "git switch <branch>".to_string(),
            ))
        } else {
            None
        };
        if let Some((message, guidance)) = refusal {
            return PushOutcome {
                pushed: false,
                remote_url: None,
                message: Some(message),
                guidance: Some(guidance),
            };
        }
    }
    let args: &[&str] = if first_send {
        &["push", "--set-upstream", "origin", "HEAD"]
    } else {
        &["push"]
    };
    match run_network_git(repo_root, args) {
        Ok(out) if out.success => {
            let remote_name = upstream
                .as_deref()
                .and_then(|name| name.split('/').next())
                .unwrap_or("origin");
            PushOutcome {
                pushed: true,
                remote_url: get_remote_url(repo_root, remote_name),
                message: None,
                guidance: None,
            }
        }
        Ok(out) => {
            let info = classify_git_error(&git_error_text(&out), "push");
            PushOutcome {
                pushed: false,
                remote_url: None,
                message: Some(classified_error_string(&info)),
                guidance: info.guidance,
            }
        }
        Err(err) => PushOutcome {
            pushed: false,
            remote_url: None,
            message: Some(err),
            guidance: None,
        },
    }
}
