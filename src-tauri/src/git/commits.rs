use serde::Serialize;
use std::path::Path;

use super::changes::{
    build_change_summary, get_porcelain_status, path_based_slug, read_kind_slug, ChangeEntry,
    KindSlug,
};
use super::document::vault_document_path;
use super::repo::{require_repo_root, vault_pathspec};
use super::runner::{run_git, validate_vault_dir};

#[cfg(test)]
mod tests;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitInfo {
    short_hash: String,
    hash: String,
    subject: String,
    relative_time: String,
    iso_time: String,
    /// Carries `kind`/`slug` so history reads at the concept level.
    files: Vec<ChangeEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResult {
    count: usize,
    files: Vec<ChangeEntry>,
    /// New files appear only in the list.
    diff: String,
    too_large: bool,
}

/// The largest of this repository's 1,500 vault commits is 565 KB.
const MAX_TREE_DIFF_BYTES: usize = 2 * 1024 * 1024;

fn diff_result(files: Vec<ChangeEntry>, diff: String) -> GitDiffResult {
    let too_large = diff.len() > MAX_TREE_DIFF_BYTES;
    GitDiffResult {
        count: files.len(),
        files,
        diff: if too_large { String::new() } else { diff },
        too_large,
    }
}

/// Empty list when there are no commits.
#[tauri::command(async)]
pub fn git_history(
    vault_path: String,
    limit: Option<u32>,
    path: Option<String>,
) -> Result<Vec<GitCommitInfo>, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let vault_spec = vault_pathspec(&repo_root, &vault_dir);
    // The single-document path must lie inside the vault (`vault_document_path`).
    let pathspec = match path.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        Some(document) => vault_document_path(document, &vault_spec)?,
        None => vault_spec,
    };
    let max_count = limit.unwrap_or(10).max(1).to_string();
    const SEP: char = '\x1f';
    // The separator leads each record; at the tail, `--name-status` lines would attach
    // to the next commit.
    const REC: char = '\x1e';
    let format = format!("--pretty=format:{REC}%h{SEP}%H{SEP}%s{SEP}%cr{SEP}%cI");

    let out = run_git(
        &repo_root,
        &[
            "log",
            &format!("--max-count={max_count}"),
            &format,
            "--name-status",
            "--no-renames",
            "--",
            &pathspec,
        ],
    )?;
    if !out.success {
        // Zero commits and the like degrade to an empty list.
        return Ok(Vec::new());
    }
    let trimmed = out.stdout.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let mut kinds = std::collections::HashMap::new();
    let commits = trimmed
        .split(REC)
        .filter(|block| !block.trim().is_empty())
        .filter_map(|block| {
            let mut lines = block.trim_matches('\n').lines();
            let mut fields = lines.next()?.split(SEP);
            let info = (
                fields.next()?.to_string(),
                fields.next()?.to_string(),
                fields.next().unwrap_or("").to_string(),
                fields.next().unwrap_or("").to_string(),
                fields.next().unwrap_or("").to_string(),
            );
            let files = lines
                .filter_map(|line| history_change_entry(line, &repo_root, &vault_dir, &mut kinds))
                .collect();
            Some(GitCommitInfo {
                short_hash: info.0,
                hash: info.1,
                subject: info.2,
                relative_time: info.3,
                iso_time: info.4,
                files,
            })
        })
        .collect();
    Ok(commits)
}

/// One `M\tpath` line. `kind` comes from the file on disk now, not the blob at that
/// commit, to avoid a `git show` per commit; deleted files get only a path slug.
fn history_change_entry(
    line: &str,
    repo_root: &Path,
    vault_dir: &Path,
    kinds: &mut std::collections::HashMap<String, KindSlug>,
) -> Option<ChangeEntry> {
    let mut cols = line.split('\t');
    let code = cols.next()?.trim();
    let path = cols.next()?.trim();
    if code.is_empty() || path.is_empty() {
        return None;
    }
    let status = match code.chars().next()? {
        'A' => "added",
        'D' => "deleted",
        'R' => "renamed",
        _ => "modified",
    };
    let abs_path = repo_root.join(path);
    let mut kind = None;
    let mut slug = path_based_slug(vault_dir, &abs_path);
    if path.ends_with(".md") && status != "deleted" {
        let (k, s) = kinds
            .entry(path.to_string())
            .or_insert_with(|| read_kind_slug(&abs_path))
            .clone();
        if k.is_some() {
            kind = k;
        }
        if let Some(s) = s {
            slug = s;
        }
    }
    Some(ChangeEntry {
        path: path.to_string(),
        status: status.to_string(),
        kind,
        slug,
        renamed_from: None,
    })
}

#[tauri::command(async)]
pub fn git_diff(vault_path: String, include_patch: Option<bool>) -> Result<GitDiffResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let pathspec = vault_pathspec(&repo_root, &vault_dir);

    let rows = get_porcelain_status(&repo_root, &pathspec)?;
    let changes = build_change_summary(&rows, &repo_root, &vault_dir);

    let diff = if include_patch == Some(false) {
        String::new()
    } else {
        // Falls back to the index when there is no HEAD.
        match run_git(&repo_root, &["diff", "HEAD", "--", &pathspec]) {
            Ok(out) if out.success => out.stdout,
            _ => match run_git(&repo_root, &["diff", "--", &pathspec]) {
                Ok(out) if out.success => out.stdout,
                _ => String::new(),
            },
        }
    };

    Ok(diff_result(changes, diff))
}

/// One commit's vault-scope patch; separate from `git_diff`, which reads the
/// uncommitted tree, so each signature says what it asks.
#[tauri::command(async)]
pub fn git_commit_diff(vault_path: String, hash: String) -> Result<GitDiffResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let pathspec = vault_pathspec(&repo_root, &vault_dir);

    // Arrives as an argument, so strings that look like options (`--upload-pack=…`) are refused.
    let rev = hash.trim();
    if rev.is_empty() || !rev.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("commit hash must be hexadecimal".to_string());
    }

    let out = run_git(
        &repo_root,
        &[
            "show",
            "--format=",
            "--no-color",
            "--patch",
            rev,
            "--",
            &pathspec,
        ],
    )?;
    let diff = if out.success {
        out.stdout
    } else {
        String::new()
    };

    Ok(diff_result(Vec::new(), diff))
}
