use serde::Serialize;

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
}

/// One `git log --name-only` walk matched in memory, not one process per concept.
const MAX_EVIDENCE_PATHS: usize = 512;
const EVIDENCE_WALK_COMMITS: &str = "--max-count=3000";

/// `repo_paths` are repository-relative; `vault_paths` resolve through the vault
/// pathspec. Anything that could climb, be absolute or look like an option is
/// dropped, since every value reaches a `git log` argument.
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

    // (key as the caller wrote it, repository-relative path)
    let mut wanted: Vec<(String, String)> = Vec::new();
    let mut push = |key: &str, resolved: String| {
        if wanted.len() >= MAX_EVIDENCE_PATHS {
            return;
        }
        if wanted.iter().any(|(k, _)| k == key) {
            return;
        }
        wanted.push((key.to_string(), resolved));
    };
    // Documents first: the cap is shared, and implementation paths must not starve
    // concept documents.
    for raw in &vault_paths {
        if let Some(clean) = safe_relative_path(raw) {
            push(raw, format!("{prefix}{clean}"));
        }
    }
    for raw in &repo_paths {
        if let Some(clean) = safe_relative_path(raw) {
            push(raw, clean);
        }
    }
    if wanted.is_empty() {
        return Ok(Vec::new());
    }

    const REC: char = '\x1e';
    let format = format!("--pretty=format:{REC}%cI");
    let mut args: Vec<&str> = vec![
        // Otherwise git C-quotes non-ASCII paths and Korean names never match.
        "-c",
        "core.quotepath=false",
        "log",
        EVIDENCE_WALK_COMMITS,
        &format,
        "--name-only",
        "--no-renames",
        "--",
    ];
    for (_, resolved) in &wanted {
        args.push(resolved.as_str());
    }
    let out = run_git(&repo_root, &args)?;

    let mut last: std::collections::HashMap<usize, String> = std::collections::HashMap::new();
    if out.success {
        let mut current_time: Option<String> = None;
        for line in out.stdout.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if let Some(rest) = line.strip_prefix(REC) {
                current_time = Some(rest.trim().to_string());
                continue;
            }
            let Some(time) = current_time.as_ref() else {
                continue;
            };
            for (index, (_, resolved)) in wanted.iter().enumerate() {
                if last.contains_key(&index) {
                    continue;
                }
                let under = line.len() > resolved.len()
                    && line.starts_with(resolved.as_str())
                    && line.as_bytes().get(resolved.len()) == Some(&b'/');
                if line == resolved || under {
                    last.insert(index, time.clone());
                }
            }
        }
    }

    Ok(wanted
        .iter()
        .enumerate()
        .map(|(index, (key, resolved))| {
            let on_disk = repo_root.join(resolved);
            PathLastChange {
                path: key.clone(),
                exists: on_disk.exists(),
                is_dir: on_disk.is_dir(),
                last_changed_at: last.get(&index).cloned(),
            }
        })
        .collect())
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
