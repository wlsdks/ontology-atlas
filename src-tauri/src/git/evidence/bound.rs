use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;

use super::super::repo::{require_repo_root, vault_pathspec};
use super::super::runner::{run_git_read as run_git, validate_vault_dir};
use crate::gray_area_scope::{resolve_binding_metadata, verify_identity};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoundPathChange {
    path: String,
    exists: bool,
    is_dir: bool,
    last_changed_at: Option<String>,
    dirty: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoundEvidenceDates {
    status: String,
    vault_changes: Vec<BoundPathChange>,
    source_changes: Vec<BoundPathChange>,
    omitted_vault_paths: Vec<String>,
    omitted_source_paths: Vec<String>,
}
impl BoundEvidenceDates {
    fn unavailable(reason: &str) -> Self {
        Self {
            status: reason.into(),
            vault_changes: vec![],
            source_changes: vec![],
            omitted_vault_paths: vec![],
            omitted_source_paths: vec![],
        }
    }
}

#[derive(PartialEq, Eq)]
struct Identity {
    vault: PathBuf,
    source: PathBuf,
    vault_repo: PathBuf,
    binding: String,
    source_id: String,
    vault_head: String,
    source_head: String,
    vault_object: (u64, u64),
    source_object: (u64, u64),
}
fn root_object(path: &Path) -> Result<(u64, u64), String> {
    let metadata = fs::metadata(path).map_err(|_| "unreadable")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        Ok((metadata.dev(), metadata.ino()))
    }
    #[cfg(not(unix))]
    {
        let _ = metadata;
        Ok((0, 0))
    }
}
fn head(root: &Path) -> Result<String, String> {
    let result = run_git(root, &["rev-parse", "--verify", "HEAD"]).map_err(|_| "unreadable")?;
    if !result.success || result.stdout.trim().is_empty() {
        return Err("no-history".into());
    }
    Ok(result.stdout.trim().into())
}
fn identity(vault_path: &str, project: &str) -> Result<Identity, String> {
    let vault = validate_vault_dir(vault_path).map_err(|_| "unreadable")?;
    let binding =
        resolve_binding_metadata(&vault, project).map_err(|reason| match reason.as_str() {
            "binding_ambiguous" => "ambiguous-source",
            "binding_identity_changed" => "binding-changed",
            _ => "unreadable",
        })?;
    crate::canonical_source_root(&binding.root.to_string_lossy()).map_err(|reason| {
        if reason == "source-root-not-granted" {
            "ungranted"
        } else {
            "unreadable"
        }
    })?;
    verify_identity(&binding).map_err(|_| "binding-changed")?;
    if binding.kind != "git" {
        return Err("no-history".into());
    }
    let vault_repo = require_repo_root(&vault).map_err(|_| "no-history")?;
    Ok(Identity {
        vault_object: root_object(&vault)?,
        source_object: root_object(&binding.root)?,
        vault_head: head(&vault_repo)?,
        source_head: head(&binding.root)?,
        vault,
        source: binding.root,
        vault_repo,
        binding: binding.binding_digest,
        source_id: binding.source_id,
    })
}

/// Symlink and permission failures are unknown, not missing paths.
fn path_kind(root: &Path, raw: &str) -> Option<(bool, bool)> {
    if raw.is_empty()
        || raw.contains(['\\', '\0', '\n', '\r'])
        || raw.starts_with('-')
        || !Path::new(raw)
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
    {
        return None;
    }
    let mut path = root.to_path_buf();
    let mut missing = false;
    for part in Path::new(raw).components() {
        path.push(part);
        if missing {
            continue;
        }
        match fs::symlink_metadata(&path) {
            Ok(meta) if meta.file_type().is_symlink() => return None,
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => missing = true,
            Err(_) => return None,
        }
    }
    if missing {
        Some((false, false))
    } else {
        fs::metadata(path).ok().map(|meta| (true, meta.is_dir()))
    }
}

struct Wanted {
    key: String,
    resolved: String,
    exists: bool,
    is_dir: bool,
}
fn wanted(
    root: &Path,
    repo: &Path,
    paths: &[String],
    remaining: &mut usize,
    omitted: &mut Vec<String>,
) -> Vec<Wanted> {
    wanted_with(root, repo, paths, remaining, omitted, path_kind)
}
fn wanted_with(
    root: &Path,
    repo: &Path,
    paths: &[String],
    remaining: &mut usize,
    omitted: &mut Vec<String>,
    mut inspect: impl FnMut(&Path, &str) -> Option<(bool, bool)>,
) -> Vec<Wanted> {
    let prefix = vault_pathspec(repo, root);
    let mut seen = HashSet::new();
    paths
        .iter()
        .filter_map(|raw| {
            if !seen.insert(raw) {
                return None;
            }
            if *remaining == 0 {
                omitted.push(raw.clone());
                return None;
            }
            *remaining -= 1;
            let Some((exists, is_dir)) = inspect(root, raw) else {
                omitted.push(raw.clone());
                return None;
            };
            Some(Wanted {
                key: raw.clone(),
                resolved: if prefix == "." {
                    raw.clone()
                } else {
                    format!("{prefix}/{raw}")
                },
                exists,
                is_dir,
            })
        })
        .collect()
}
fn dirty_paths(root: &Path, paths: &[Wanted]) -> Result<HashSet<String>, String> {
    if paths.is_empty() {
        return Ok(HashSet::new());
    }
    let literals: Vec<String> = paths
        .iter()
        .filter(|path| !path.is_dir)
        .map(|p| format!(":(literal){}", p.resolved))
        .collect();
    if literals.is_empty() {
        return Ok(HashSet::new());
    }
    let mut args = vec![
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
        "--",
    ];
    args.extend(literals.iter().map(String::as_str));
    let output = run_git(root, &args).map_err(|_| "unreadable")?;
    if !output.success {
        return Err("unreadable".into());
    }
    let mut records = output.stdout.split('\0');
    let mut dirty = HashSet::new();
    while let Some(record) = records.next() {
        if record.len() < 4 {
            continue;
        }
        dirty.insert(record[3..].to_string());
        if record.as_bytes()[..2]
            .iter()
            .any(|c| matches!(c, b'R' | b'C'))
        {
            if let Some(previous) = records.next() {
                dirty.insert(previous.into());
            }
        }
    }
    Ok(dirty)
}
fn matches_path(path: &str, candidate: &str) -> bool {
    candidate == path
        || candidate
            .strip_prefix(path)
            .is_some_and(|suffix| suffix.starts_with('/'))
}
fn walk(root: &Path, paths: &[Wanted]) -> Result<Vec<BoundPathChange>, String> {
    if paths.is_empty() {
        return Ok(vec![]);
    }
    let before = dirty_paths(root, paths)?;
    let literals: Vec<String> = paths
        .iter()
        .filter(|path| !path.is_dir)
        .map(|p| format!(":(literal){}", p.resolved))
        .collect();
    let mut args = vec![
        "-c",
        "core.quotepath=false",
        "log",
        super::EVIDENCE_WALK_COMMITS,
        "--format=%x1e%cI",
        "--name-only",
        "--no-renames",
        "--",
    ];
    args.extend(literals.iter().map(String::as_str));
    let history = if literals.is_empty() {
        String::new()
    } else {
        let output = run_git(root, &args).map_err(|_| "unreadable")?;
        if !output.success {
            return Err("unreadable".into());
        }
        output.stdout
    };
    let after = dirty_paths(root, paths)?;
    let mut dates = vec![None; paths.len()];
    let mut time = None;
    for line in history.lines() {
        if let Some(value) = line.strip_prefix('\x1e') {
            time = chrono::DateTime::parse_from_rfc3339(value)
                .ok()
                .map(|_| value.to_string());
        } else if !line.is_empty() {
            for (i, path) in paths.iter().enumerate() {
                if dates[i].is_none() && matches_path(&path.resolved, line) {
                    dates[i] = time.clone();
                }
            }
        }
    }
    Ok(paths
        .iter()
        .enumerate()
        .map(|(i, path)| {
            let dirty = before
                .iter()
                .chain(after.iter())
                .any(|candidate| matches_path(&path.resolved, candidate));
            BoundPathChange {
                path: path.key.clone(),
                exists: path.exists,
                is_dir: path.is_dir,
                last_changed_at: if !path.exists || dirty || path.is_dir {
                    None
                } else {
                    dates[i].clone()
                },
                dirty,
            }
        })
        .collect())
}

/// Dates use only the recorded, granted source.
#[tauri::command(async)]
pub fn git_bound_evidence_dates(
    vault_path: String,
    project_slug: String,
    vault_paths: Vec<String>,
    source_paths: Vec<String>,
    selected_source_path: Option<String>,
) -> Result<BoundEvidenceDates, String> {
    Ok(measure(
        &vault_path,
        &project_slug,
        &vault_paths,
        &source_paths,
        selected_source_path.as_deref(),
        || {},
    ))
}
fn measure(
    vault_path: &str,
    project: &str,
    vault_paths: &[String],
    source_paths: &[String],
    selected: Option<&str>,
    after_walk: impl FnOnce(),
) -> BoundEvidenceDates {
    if let Some(selected) = selected {
        let binding = validate_vault_dir(vault_path)
            .ok()
            .and_then(|vault| resolve_binding_metadata(&vault, project).ok());
        if binding
            .as_ref()
            .is_some_and(|b| fs::canonicalize(selected).ok().as_ref() != Some(&b.root))
        {
            return BoundEvidenceDates::unavailable("wrong-folder");
        }
    }
    let before = match identity(vault_path, project) {
        Ok(value) => value,
        Err(reason) => return BoundEvidenceDates::unavailable(&reason),
    };
    let mut result = BoundEvidenceDates::unavailable("measured");
    let mut remaining = super::MAX_EVIDENCE_PATHS;
    let vault_wanted = wanted(
        &before.vault,
        &before.vault_repo,
        vault_paths,
        &mut remaining,
        &mut result.omitted_vault_paths,
    );
    let source_wanted = wanted(
        &before.source,
        &before.source,
        source_paths,
        &mut remaining,
        &mut result.omitted_source_paths,
    );
    result.vault_changes = match walk(&before.vault_repo, &vault_wanted) {
        Ok(rows) => rows,
        Err(reason) => return BoundEvidenceDates::unavailable(&reason),
    };
    result.source_changes = match walk(&before.source, &source_wanted) {
        Ok(rows) => rows,
        Err(reason) => return BoundEvidenceDates::unavailable(&reason),
    };
    after_walk();
    // Existence and safety can change without a commit. Discard this observation.
    if vault_wanted
        .iter()
        .any(|p| path_kind(&before.vault, &p.key) != Some((p.exists, p.is_dir)))
        || source_wanted
            .iter()
            .any(|p| path_kind(&before.source, &p.key) != Some((p.exists, p.is_dir)))
    {
        return BoundEvidenceDates::unavailable("binding-changed");
    }
    for (repo, wanted, rows) in [
        (&before.vault_repo, &vault_wanted, &mut result.vault_changes),
        (&before.source, &source_wanted, &mut result.source_changes),
    ] {
        let dirty = match dirty_paths(repo, wanted) {
            Ok(value) => value,
            Err(reason) => return BoundEvidenceDates::unavailable(&reason),
        };
        for (path, row) in wanted.iter().zip(rows.iter_mut()) {
            if dirty
                .iter()
                .any(|candidate| matches_path(&path.resolved, candidate))
            {
                row.dirty = true;
                row.last_changed_at = None;
            }
        }
    }
    if identity(vault_path, project).ok().as_ref() != Some(&before) {
        return BoundEvidenceDates::unavailable("binding-changed");
    }
    if result.vault_changes.iter().any(|path| !path.exists)
        || !result.omitted_vault_paths.is_empty()
        || !result.omitted_source_paths.is_empty()
        || result
            .vault_changes
            .iter()
            .chain(result.source_changes.iter())
            .any(|p| p.dirty || (p.exists && (p.is_dir || p.last_changed_at.is_none())))
    {
        result.status = "partial".into();
    }
    result
}

#[cfg(test)]
mod tests;
