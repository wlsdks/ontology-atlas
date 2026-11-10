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
    pushed: bool,
    remote_url: Option<String>,
    message: Option<String>,
    guidance: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushOnlyOutcome {
    pushed: bool,
    upstream_set: bool,
    message: Option<String>,
    guidance: Option<String>,
}

/// Push exactly the displayed commit to its displayed branch destination, without recording files.
#[tauri::command(async)]
pub fn git_push_only(
    vault_path: String,
    expected_branch: String,
    expected_head: String,
    expected_upstream: Option<String>,
    set_upstream: bool,
) -> Result<PushOnlyOutcome, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let pathspec = vault_pathspec(&repo_root, &vault_dir);
    if is_head_detached(&repo_root)
        || get_current_branch(&repo_root).as_deref() != Some(expected_branch.as_str())
        || get_head_hash(&repo_root).as_deref() != Some(expected_head.as_str())
        || get_upstream_ref(&repo_root) != expected_upstream
    {
        return Err(coded("push-state-changed", ""));
    }
    if !get_porcelain_status(&repo_root, &pathspec)?.is_empty() {
        return Err(coded("push-folder-changed", ""));
    }

    let (remote, target) = if let Some(upstream) = expected_upstream {
        let remote = single_git_config(&repo_root, &format!("branch.{expected_branch}.remote"))?;
        let target = single_git_config(&repo_root, &format!("branch.{expected_branch}.merge"))?;
        if remote == "."
            || !target.starts_with("refs/heads/")
            || upstream != format!("{remote}/{}", &target["refs/heads/".len()..])
        {
            return Err(coded("push-state-changed", ""));
        }
        (remote, target)
    } else if set_upstream && get_remote_url(&repo_root, "origin").is_some() {
        // A missing tracking ref may mean the configured destination was not fetched.
        for key in ["remote", "merge"] {
            let setting = run_git(
                &repo_root,
                &[
                    "config",
                    "--get-all",
                    &format!("branch.{expected_branch}.{key}"),
                ],
            )?;
            if setting.success {
                return Err(coded("push-existing-upstream", ""));
            }
            if !setting.stderr.trim().is_empty() {
                return Err(coded("push-state-changed", ""));
            }
        }
        (
            "origin".to_string(),
            format!("refs/heads/{expected_branch}"),
        )
    } else {
        return Err(coded("push-no-upstream", ""));
    };

    // Git sends to every configured push URL. Refuse ambiguous destinations before
    // starting so an earlier destination cannot succeed while a later one fails.
    let urls = run_git(
        &repo_root,
        &["remote", "get-url", "--push", "--all", &remote],
    )?;
    if !urls.success || urls.stdout.trim().is_empty() {
        return Err(coded("push-state-changed", ""));
    }
    if urls.stdout.lines().count() != 1 {
        return Err(coded("push-multiple-destinations", ""));
    }
    // Repository-provided transport commands and credential helpers can execute
    // code during a network operation. Global user configuration remains available.
    for scope in ["--local", "--worktree"] {
        let commands = run_git(
            &repo_root,
            &[
                "config",
                scope,
                "--includes",
                "--name-only",
                "--get-regexp",
                r"^(core\.(sshcommand|gitproxy)|credential\..*helper|remote\..*\.(receivepack|vcs))$",
            ],
        )?;
        if commands.success {
            return Err(coded("push-local-command-config", ""));
        }
        if !commands.stderr.trim().is_empty() {
            return Err(coded("push-state-changed", ""));
        }
    }

    // An explicit object and destination ignore push.default and remote push refspecs;
    // disable mirror and followTags so configuration cannot add unrelated refs.
    let mirror = format!("remote.{remote}.mirror=false");
    let refspec = format!("{expected_head}:{target}");
    let out = run_network_git(
        &repo_root,
        &[
            "-c",
            &mirror,
            "-c",
            "push.pushOption=",
            "push",
            "--no-follow-tags",
            "--recurse-submodules=no",
            "--",
            &remote,
            &refspec,
        ],
    )?;
    if !out.success {
        let info = classify_git_error(&git_error_text(&out), "push");
        return Ok(PushOnlyOutcome {
            pushed: false,
            upstream_set: false,
            message: Some(classified_error_string(&info)),
            guidance: info.guidance,
        });
    }
    // A raw object refspec cannot set tracking with `push -u`; set it only after
    // the send succeeded, and report the partial outcome if Git cannot do so.
    let upstream_set = if set_upstream {
        let tracking = format!("{remote}/{}", &target["refs/heads/".len()..]);
        run_git(
            &repo_root,
            &["branch", "--set-upstream-to", &tracking, &expected_branch],
        )
        .map(|result| result.success)
        .unwrap_or(false)
    } else {
        true
    };
    Ok(PushOnlyOutcome {
        pushed: true,
        upstream_set,
        message: (!upstream_set).then(|| coded("push-tracking-not-set", "")),
        guidance: None,
    })
}

fn single_git_config(repo_root: &Path, key: &str) -> Result<String, String> {
    let out = run_git(repo_root, &["config", "--get-all", key])?;
    let mut lines = out.stdout.lines();
    let value = lines.next().filter(|line| !line.is_empty());
    if !out.success || value.is_none() || lines.next().is_some() {
        return Err(coded("push-state-changed", ""));
    }
    Ok(value.unwrap().to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshotResult {
    committed: bool,
    /// "no-changes" or null (committed).
    reason: Option<String>,
    commit_hash: Option<String>,
    subject: Option<String>,
    summary: Option<String>,
    counts: SnapshotCounts,
    files: Vec<ChangeEntry>,
    staged_outside_vault: Vec<String>,
    /// Only when push was requested.
    push: Option<PushOutcome>,
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
