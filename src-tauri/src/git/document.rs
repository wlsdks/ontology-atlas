use serde::Serialize;
use std::fs;

use super::changes::{classify_change, first_nonempty_line, get_porcelain_status, unquote};
use super::repo::{require_repo_root, vault_pathspec};
use super::runner::{run_git, validate_vault_dir};
use crate::errors::coded;

#[cfg(test)]
mod tests;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDocumentDiffResult {
    path: String,
    /// The whole document as context, so the reader can draw it and mark changes.
    diff: String,
    /// Git never saw it; every line reads as added.
    untracked: bool,
    /// `diff` is then empty.
    too_large: bool,
}

/// The reader draws one element per line without windowing; past this ceiling
/// nothing is sent and the screen keeps its hunks, which always hold the changes.
const MAX_DOCUMENT_DIFF_LINES: usize = 3_000;

/// A capped answer carries no diff, since a prefix would read as the whole document.
fn cap_document_diff(path: String, diff: String, untracked: bool) -> GitDocumentDiffResult {
    if diff.lines().count() > MAX_DOCUMENT_DIFF_LINES {
        return GitDocumentDiffResult {
            path,
            diff: String::new(),
            untracked,
            too_large: true,
        };
    }
    GitDocumentDiffResult {
        path,
        diff,
        untracked,
        too_large: false,
    }
}

#[tauri::command(async)]
pub fn git_document_diff(
    vault_path: String,
    relative_path: String,
    source: Option<String>,
    previous_path: Option<String>,
) -> Result<GitDocumentDiffResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let vault_spec = vault_pathspec(&repo_root, &vault_dir);
    let repo_rel = vault_document_path(&relative_path, &vault_spec)?;
    // Both names go into the pathspec so git pairs a rename; with only the new name
    // every line reads as added.
    let previous_rel = match previous_path
        .as_deref()
        .map(str::trim)
        .filter(|p| !p.is_empty())
    {
        Some(previous) => Some(vault_document_path(previous, &vault_spec)?),
        None => None,
    };
    const WHOLE: &str = "-U1000000";

    if let Some(hash) = source.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let src = validate_restore_source(hash)?;
        let out = run_git(
            &repo_root,
            &[
                "show",
                WHOLE,
                "--no-color",
                "--format=",
                &src,
                "--",
                &repo_rel,
            ],
        )?;
        if !out.success {
            return Err(coded("restore-source-missing", ""));
        }
        return Ok(cap_document_diff(repo_rel, out.stdout, false));
    }

    let rows = get_porcelain_status(&repo_root, &repo_rel)?;
    let untracked = rows
        .iter()
        .any(|r| r.path == repo_rel && r.index == '?' && r.worktree == '?');
    if untracked {
        let raw = fs::read_to_string(repo_root.join(&repo_rel)).unwrap_or_default();
        let mut diff = format!("diff --git a/{repo_rel} b/{repo_rel}\n--- /dev/null\n+++ b/{repo_rel}\n@@ -0,0 +1 @@\n");
        for line in raw.lines() {
            diff.push('+');
            diff.push_str(line);
            diff.push('\n');
        }
        return Ok(cap_document_diff(repo_rel, diff, true));
    }
    let mut args: Vec<&str> = vec!["diff", WHOLE, "--no-color", "HEAD", "--", &repo_rel];
    if let Some(previous) = previous_rel.as_deref() {
        args.push(previous);
    }
    let out = run_git(&repo_root, &args)?;
    let diff = if out.success {
        out.stdout
    } else {
        let mut staged: Vec<&str> = vec!["diff", WHOLE, "--no-color", "--", &repo_rel];
        if let Some(previous) = previous_rel.as_deref() {
            staged.push(previous);
        }
        run_git(&repo_root, &staged)
            .map(|o| o.stdout)
            .unwrap_or_default()
    };
    // A pure rename has no content lines, so the document itself is returned under a
    // header that already says the name changed.
    if previous_rel.is_some()
        && !diff
            .lines()
            .any(|line| line.starts_with('+') || line.starts_with('-'))
    {
        let raw = fs::read_to_string(repo_root.join(&repo_rel)).unwrap_or_default();
        let mut context = format!("diff --git a/{repo_rel} b/{repo_rel}\n@@ -1,1 +1,1 @@\n");
        for line in raw.lines() {
            context.push(' ');
            context.push_str(line);
            context.push('\n');
        }
        return Ok(cap_document_diff(repo_rel, context, false));
    }
    Ok(cap_document_diff(repo_rel, diff, false))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRestoreResult {
    restored: bool,
    path: String,
    /// `HEAD` or the source commit hash.
    source: String,
    /// `None` when clean.
    previous_status: Option<String>,
}

/// The identity fields owned by `mcp/src/schema.mjs`: immutable `uid`, linked `slug`,
/// and `merged_uids`.
#[derive(Debug, Default, PartialEq, Eq)]
struct DocumentIdentity {
    uid: Option<String>,
    slug: Option<String>,
    merged_uids: bool,
}

/// Best-effort: no frontmatter means no identity, and two such files compare equal.
fn read_identity(raw: &str) -> DocumentIdentity {
    let mut identity = DocumentIdentity::default();
    let mut lines = raw.lines();
    if lines.next().map(|l| l.trim_end()) != Some("---") {
        return identity;
    }
    for line in lines {
        let trimmed = line.trim_end();
        if trimmed == "---" {
            break;
        }
        if let Some(rest) = line.strip_prefix("uid:") {
            let value = unquote(rest.trim());
            if !value.is_empty() {
                identity.uid = Some(value);
            }
        } else if let Some(rest) = line.strip_prefix("slug:") {
            let value = unquote(rest.trim());
            if !value.is_empty() {
                identity.slug = Some(value);
            }
        } else if line.starts_with("merged_uids:") {
            identity.merged_uids = true;
        }
    }
    identity
}

fn identity_difference(current: &DocumentIdentity, source: &DocumentIdentity) -> Option<String> {
    if current.uid != source.uid {
        return Some(format!(
            "uid {} -> {}",
            current.uid.as_deref().unwrap_or("(none)"),
            source.uid.as_deref().unwrap_or("(none)")
        ));
    }
    if current.slug != source.slug {
        return Some(format!(
            "slug {} -> {}",
            current.slug.as_deref().unwrap_or("(none)"),
            source.slug.as_deref().unwrap_or("(none)")
        ));
    }
    if current.merged_uids && !source.merged_uids {
        return Some("merged_uids would be dropped".into());
    }
    None
}

/// Repository-relative as the screen holds it: forward slashes, no `..`, empty or
/// dot segments, and inside the vault pathspec. Anything else is refused.
pub(super) fn vault_document_path(relative_path: &str, vault_spec: &str) -> Result<String, String> {
    let trimmed = relative_path.trim();
    if trimmed.is_empty()
        || trimmed.starts_with('/')
        || trimmed.contains('\\')
        || trimmed.contains('\0')
    {
        return Err(coded("restore-path-invalid", ""));
    }
    let mut parts = Vec::new();
    for segment in trimmed.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return Err(coded("restore-path-invalid", ""));
        }
        parts.push(segment);
    }
    let normalized = parts.join("/");
    let inside = vault_spec == "." || normalized.starts_with(&format!("{vault_spec}/"));
    if !inside {
        return Err(coded("restore-path-invalid", ""));
    }
    Ok(normalized)
}

/// Refs, ranges and options never reach git.
fn validate_restore_source(source: &str) -> Result<String, String> {
    let trimmed = source.trim();
    if trimmed == "HEAD" {
        return Ok(trimmed.into());
    }
    let hex =
        trimmed.len() >= 7 && trimmed.len() <= 40 && trimmed.chars().all(|c| c.is_ascii_hexdigit());
    if hex {
        Ok(trimmed.to_ascii_lowercase())
    } else {
        Err(coded("restore-source-invalid", ""))
    }
}

/// Restores one document to `source`, uncommitted. Refuses an untracked path
/// (restoring would delete it), a missing source, a changed `uid`/`slug`/`merged_uids`
/// or an unreadable file, since `git restore` is identity-blind. Confirm-button only.
#[tauri::command(async)]
pub fn git_restore_file(
    vault_path: String,
    relative_path: String,
    source: String,
) -> Result<GitRestoreResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let vault_spec = vault_pathspec(&repo_root, &vault_dir);
    let repo_rel = vault_document_path(&relative_path, &vault_spec)?;
    let src = validate_restore_source(&source)?;

    let rows = get_porcelain_status(&repo_root, &repo_rel)?;
    let row = rows.iter().find(|r| r.path == repo_rel);
    let previous_status = row.map(|r| classify_change(r).to_string());
    if src == "HEAD" {
        if let Some(r) = row {
            if (r.index == '?' && r.worktree == '?') || r.index == 'A' {
                return Err(coded("restore-untracked", ""));
            }
        }
    }

    let show = run_git(&repo_root, &["show", &format!("{src}:{repo_rel}")])?;
    if !show.success {
        return Err(coded("restore-source-missing", ""));
    }
    match fs::read_to_string(repo_root.join(&repo_rel)) {
        Ok(current) => {
            if let Some(difference) =
                identity_difference(&read_identity(&current), &read_identity(&show.stdout))
            {
                return Err(coded("restore-identity-mismatch", difference));
            }
        }
        // A deleted document has no identity to disagree with.
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
        // Any other read failure means the identity guard did not run, so the write stops.
        Err(err) => return Err(coded("restore-identity-check-failed", err)),
    }

    let run = run_git(
        &repo_root,
        &[
            "restore",
            &format!("--source={src}"),
            "--worktree",
            "--staged",
            "--",
            &repo_rel,
        ],
    )?;
    if !run.success {
        return Err(coded(
            "git-restore-failed",
            first_nonempty_line(&run.stderr).unwrap_or_default(),
        ));
    }

    Ok(GitRestoreResult {
        restored: true,
        path: repo_rel,
        source: src,
        previous_status,
    })
}
