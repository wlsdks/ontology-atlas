use serde::Serialize;

use super::classify::{classified_error_string, classify_git_error, git_error_text};
use super::repo::{
    divergence_counts, get_current_branch, get_remote_url, get_upstream_ref, require_repo_root,
};
use super::runner::{run_git, run_network_git, validate_vault_dir};
use crate::errors::coded;

#[cfg(test)]
mod tests;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPullResult {
    ok: bool,
    upstream: String,
    summary: String,
}

/// Opt-in. Missing upstream, conflict and non-fast-forward return a clean `Err`.
#[tauri::command(async)]
pub fn git_pull(vault_path: String) -> Result<GitPullResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;

    let Some(upstream) = get_upstream_ref(&repo_root) else {
        let branch = get_current_branch(&repo_root).unwrap_or_else(|| "<branch>".into());
        return Err(coded("no-upstream", format!("git push -u origin {branch}")));
    };

    let out = run_network_git(&repo_root, &["pull"])?;
    if !out.success {
        let info = classify_git_error(&git_error_text(&out), "pull");
        return Err(classified_error_string(&info));
    }
    let summary = out
        .stdout
        .trim()
        .lines()
        .rfind(|l| !l.trim().is_empty())
        .unwrap_or("up to date")
        .to_string();

    Ok(GitPullResult {
        ok: true,
        upstream,
        summary,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFetchResult {
    ok: bool,
    /// Empty string with `ok:false` when absent.
    upstream: String,
    /// Re-measured after the fetch; the screen enables Pull/Push from it.
    ahead: Option<usize>,
    behind: Option<usize>,
    summary: String,
}

/// Receives only; the working tree is untouched. Runs only when the user presses it.
#[tauri::command(async)]
pub fn git_fetch(vault_path: String) -> Result<GitFetchResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let Some(upstream) = get_upstream_ref(&repo_root) else {
        return Ok(GitFetchResult {
            ok: false,
            upstream: String::new(),
            ahead: None,
            behind: None,
            // A code, not a sentence: `nativeErrors` holds the wording.
            summary: "remote-no-upstream".to_string(),
        });
    };
    let out = run_network_git(&repo_root, &["fetch", "--prune"])?;
    if !out.success {
        // Keep git's reason and the next step; a failure without them cannot be fixed.
        let info = classify_git_error(&out.stderr, "fetch");
        return Err(classified_error_string(&info));
    }
    let (ahead, behind) = divergence_counts(&repo_root);
    Ok(GitFetchResult {
        ok: true,
        upstream,
        ahead,
        behind,
        summary: match (ahead, behind) {
            (Some(0), Some(0)) => "remote-in-sync".to_string(),
            (_, _) => "remote-diverged".to_string(),
        },
    })
}

/// Argument arrays already prevent shell injection; this refuses empty,
/// whitespace-bearing and flag-like values.
fn validate_remote_url(url: &str) -> Result<String, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err(coded("remote-url-empty", ""));
    }
    if trimmed.starts_with('-') {
        return Err(coded("remote-url-leading-dash", ""));
    }
    if trimmed.chars().any(char::is_whitespace) {
        return Err(coded("remote-url-has-whitespace", ""));
    }
    // Only scp-like, https, ssh and file paths.
    let looks_scp = trimmed.contains('@') && trimmed.contains(':');
    let looks_url = trimmed.starts_with("https://")
        || trimmed.starts_with("http://")
        || trimmed.starts_with("ssh://")
        || trimmed.starts_with("git://");
    // A Windows drive path is a path too, or a first send to a local backup fails there.
    let bytes = trimmed.as_bytes();
    let looks_drive_path = bytes.len() > 2
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/');
    let looks_path = trimmed.starts_with('/') || trimmed.starts_with("file://") || looks_drive_path;
    if !(looks_scp || looks_url || looks_path) {
        return Err(coded("remote-url-unrecognized", ""));
    }
    Ok(trimmed.to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSetRemoteResult {
    ok: bool,
    /// Always "origin".
    remote: String,
    url: String,
    /// Tells the user what changed.
    replaced: Option<String>,
}

/// Only addresses the user entered; nothing is guessed. No push happens here.
#[tauri::command(async)]
pub fn git_set_remote(vault_path: String, url: String) -> Result<GitSetRemoteResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let clean = validate_remote_url(&url)?;

    let existing = get_remote_url(&repo_root, "origin");
    // `add` fails when origin exists.
    let subcommand = if existing.is_some() { "set-url" } else { "add" };
    let out = run_git(
        &repo_root,
        &["remote", subcommand, "origin", clean.as_str()],
    )?;
    if !out.success {
        let info = classify_git_error(&git_error_text(&out), "remote");
        return Err(classified_error_string(&info));
    }

    let replaced = existing.filter(|prev| prev != &clean);

    Ok(GitSetRemoteResult {
        ok: true,
        remote: "origin".into(),
        url: clean,
        replaced,
    })
}
