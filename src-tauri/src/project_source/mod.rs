pub(crate) mod access;
pub(crate) mod local_construction;

use crate::git;
use crate::lower_hex::lower_hex;
use crate::vault::scope::{canonical_root, canonical_source_root, normalize_relative_path};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::Path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectSourceInspection {
    root_path: String,
    source_id: String,
    kind: String,
    revision: String,
    fingerprint: String,
    dirty: Option<bool>,
    truncated: bool,
    files: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSourceContinuityExclusions {
    target: Option<String>,
    archive_prefix: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectSourceContinuityInspection {
    #[serde(flatten)]
    source: ProjectSourceInspection,
    scope: String,
    exclusions: ProjectSourceContinuityExclusions,
}

struct SourceInventory {
    hasher: Sha256,
    files: Vec<String>,
    hashed_bytes: u64,
    truncated: bool,
}

/// `std::io::copy` needs a writer; digest 0.11 hashers do not implement `io::Write`.
struct HashingWriter<'a>(&'a mut Sha256);

impl std::io::Write for HashingWriter<'_> {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0.update(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

// Byte-for-byte aligned with mcp/src/project-source/project-source-inspection.mjs so a fresh MCP
// process reproduces the receipt; tests/contract/vault-format/source-inventory-bound.contract.test.ts
// fails on drift.
const SOURCE_INVENTORY_VERSION: &str = "inventory-v2";
const SOURCE_INVENTORY_MAX_DEPTH: usize = 20;
const SOURCE_INVENTORY_MAX_FILES: usize = 8000;
const SOURCE_INVENTORY_MAX_HASH_BYTES: u64 = 32 * 1024 * 1024;
const SOURCE_PRUNE_DIR_NAMES: &[&str] = &[
    ".git",
    ".next",
    ".turbo",
    ".cache",
    "node_modules",
    "target",
    "dist",
    "build",
    "coverage",
];

pub(crate) fn source_digest(parts: &[&[u8]]) -> String {
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update(part);
        hasher.update([0]);
    }
    format!("sha256:{}", lower_hex(&hasher.finalize()))
}

fn hash_source_file(
    path: &Path,
    relative: &str,
    inventory: &mut SourceInventory,
    hash_content: bool,
) -> Result<(), String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(err) => return Err(err.to_string()),
    };
    let file_type = metadata.file_type();
    if !file_type.is_file() && !file_type.is_symlink() {
        return Ok(());
    }

    inventory.files.push(relative.to_string());
    inventory.hasher.update(relative.as_bytes());
    inventory.hasher.update([0]);
    inventory.hasher.update(metadata.len().to_le_bytes());

    if !hash_content {
        return Ok(());
    }

    if file_type.is_symlink() {
        // A tracked symlink is evidence, not permission to read outside the root.
        let target = fs::read_link(path).map_err(|err| err.to_string())?;
        let target = target.to_string_lossy();
        let bytes = target.as_bytes();
        let remaining = SOURCE_INVENTORY_MAX_HASH_BYTES.saturating_sub(inventory.hashed_bytes);
        let copied = remaining.min(bytes.len() as u64) as usize;
        inventory
            .hasher
            .update(bytes.get(..copied).unwrap_or_default());
        inventory.hashed_bytes += copied as u64;
        if copied < bytes.len() {
            inventory.truncated = true;
        }
        return Ok(());
    }

    let remaining = SOURCE_INVENTORY_MAX_HASH_BYTES.saturating_sub(inventory.hashed_bytes);
    if remaining == 0 {
        inventory.truncated = true;
        return Ok(());
    }
    let file = fs::File::open(path).map_err(|err| err.to_string())?;
    let mut limited = Read::take(file, remaining);
    let copied = std::io::copy(&mut limited, &mut HashingWriter(&mut inventory.hasher))
        .map_err(|err| err.to_string())?;
    inventory.hashed_bytes += copied;
    if copied < metadata.len() {
        inventory.truncated = true;
    }
    Ok(())
}

fn walk_source_inventory(
    dir: &Path,
    prefix: &str,
    depth: usize,
    inventory: &mut SourceInventory,
    excluded: Option<&str>,
) -> Result<(), String> {
    if inventory.files.len() >= SOURCE_INVENTORY_MAX_FILES {
        inventory.truncated = true;
        return Ok(());
    }
    if depth > SOURCE_INVENTORY_MAX_DEPTH {
        inventory.truncated = true;
        return Ok(());
    }

    let mut children = Vec::new();
    for entry in fs::read_dir(dir).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let file_type = entry.file_type().map_err(|err| err.to_string())?;
        if file_type.is_dir() || file_type.is_file() {
            children.push((
                entry.file_name().to_string_lossy().to_string(),
                file_type.is_dir(),
            ));
        }
    }
    children.sort_by(|left, right| left.0.cmp(&right.0));

    for (name, is_dir) in children {
        if inventory.files.len() >= SOURCE_INVENTORY_MAX_FILES {
            inventory.truncated = true;
            break;
        }
        let relative = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        if is_vault_path(&relative, excluded) {
            continue;
        }
        let path = dir.join(&name);
        if is_dir {
            if SOURCE_PRUNE_DIR_NAMES.contains(&name.as_str()) {
                continue;
            }
            walk_source_inventory(&path, &relative, depth + 1, inventory, excluded)?;
            continue;
        }

        hash_source_file(&path, &relative, inventory, true)?;
    }
    Ok(())
}

fn inspect_source_inventory(
    root: &Path,
    excluded: Option<&str>,
) -> Result<(String, bool, Vec<String>), String> {
    let mut inventory = SourceInventory {
        hasher: Sha256::new(),
        files: Vec::new(),
        hashed_bytes: 0,
        truncated: false,
    };
    inventory.hasher.update(SOURCE_INVENTORY_VERSION.as_bytes());
    inventory.hasher.update([0]);
    walk_source_inventory(root, "", 0, &mut inventory, excluded)?;
    let fingerprint = format!("sha256:{}", lower_hex(&inventory.hasher.finalize()));
    Ok((fingerprint, inventory.truncated, inventory.files))
}

pub(crate) fn run_source_git(root: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    // A connected project source is untrusted repo content; the base hardening
    // refuses an embedded bare repo and disables fsmonitor/hooks before git reads
    // the source's own config. These reads (ls-files/diff --name-only/status/
    // rev-parse) run no content filter, so name discovery is not needed here.
    let output = git::hardened_base_command()
        .args(args)
        .current_dir(root)
        .output()
        .map_err(|err| format!("git source inspection failed: {err}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr)
            .lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("unknown git error")
            .trim()
            .to_string();
        return Err(format!("git source inspection failed: {detail}"));
    }
    Ok(output.stdout)
}

fn inspect_git_source_inventory(
    root: &Path,
    excluded: Option<&str>,
) -> Result<(String, bool, Vec<String>), String> {
    let listing = run_source_git(
        root,
        &[
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ],
    )?;
    let mut paths: Vec<String> = listing
        .split(|byte| *byte == 0)
        .filter(|path| !path.is_empty())
        .map(|path| String::from_utf8_lossy(path).replace('\\', "/"))
        .filter(|path| !is_vault_path(path, excluded))
        .collect();
    paths.sort();
    paths.dedup();

    let mut dirty_paths: std::collections::HashSet<String> = run_source_git(
        root,
        &["diff", "--name-only", "--no-renames", "-z", "HEAD", "--"],
    )?
    .split(|byte| *byte == 0)
    .filter(|path| !path.is_empty())
    .map(|path| String::from_utf8_lossy(path).replace('\\', "/"))
    .filter(|path| !is_vault_path(path, excluded))
    .collect();
    dirty_paths.extend(
        run_source_git(root, &["ls-files", "--others", "--exclude-standard", "-z"])?
            .split(|byte| *byte == 0)
            .filter(|path| !path.is_empty())
            .map(|path| String::from_utf8_lossy(path).replace('\\', "/"))
            .filter(|path| !is_vault_path(path, excluded)),
    );

    let mut inventory = SourceInventory {
        hasher: Sha256::new(),
        files: Vec::new(),
        hashed_bytes: 0,
        truncated: paths.len() > SOURCE_INVENTORY_MAX_FILES,
    };
    inventory.hasher.update(SOURCE_INVENTORY_VERSION.as_bytes());
    inventory.hasher.update([0]);
    for relative in paths.iter().take(SOURCE_INVENTORY_MAX_FILES) {
        hash_source_file(
            &root.join(relative),
            relative,
            &mut inventory,
            dirty_paths.remove(relative),
        )?;
    }
    // Deleted paths still perturb the worktree fingerprint.
    let mut deleted: Vec<String> = dirty_paths.into_iter().collect();
    deleted.sort();
    for relative in deleted {
        inventory.hasher.update(b"deleted");
        inventory.hasher.update([0]);
        inventory.hasher.update(relative.as_bytes());
        inventory.hasher.update([0]);
    }
    let fingerprint = format!("sha256:{}", lower_hex(&inventory.hasher.finalize()));
    Ok((fingerprint, inventory.truncated, inventory.files))
}

fn is_vault_path(relative: &str, excluded: Option<&str>) -> bool {
    excluded.is_some_and(|folder| {
        relative == folder
            || relative
                .strip_prefix(folder)
                .is_some_and(|rest| rest.starts_with('/'))
    })
}

/// The path of one porcelain status row: what follows the two status letters and the space.
fn status_path(row: &[u8]) -> Option<String> {
    row.get(3..)
        .filter(|path| !path.is_empty())
        .map(|path| String::from_utf8_lossy(path).replace('\\', "/"))
}

/// One absolute path as forward-slash text: the `\\?\` verbatim prefix dropped, the
/// drive letter lower-cased, no trailing separator, so a Windows path and its
/// canonical form compare equal.
fn comparable_path(path: &str) -> String {
    let unified = path.replace('\\', "/");
    let unverbatim = unified
        .strip_prefix("//?/UNC/")
        .map(|rest| format!("//{rest}"))
        .or_else(|| unified.strip_prefix("//?/").map(str::to_string))
        .unwrap_or(unified);
    let mut chars: Vec<char> = unverbatim.chars().collect();
    if let [drive, ':', ..] = chars.as_mut_slice() {
        if drive.is_ascii_alphabetic() {
            *drive = drive.to_ascii_lowercase();
        }
    }
    let mut out: String = chars.into_iter().collect();
    while out.len() > 1 && out.ends_with('/') && !out.ends_with(":/") {
        out.pop();
    }
    out
}

/// The vault's folder relative to the source root when it lies strictly inside it,
/// else None. Its files are the ontology, not the code it describes, so writing the
/// vault must not make its own source binding stale. The MCP probe applies the same
/// rule (`mcp/src/project-source/project-source-inspection.mjs`), and both sides run
/// `mcp/src/project-source/vault-exclusion-cases.json`.
pub(crate) fn vault_folder_inside(source_root: &str, vault_root: &str) -> Option<String> {
    let base = comparable_path(source_root);
    let vault = comparable_path(vault_root);
    let rest = vault.strip_prefix(&base)?;
    let inside = if base.ends_with('/') {
        rest
    } else {
        rest.strip_prefix('/')?
    };
    if inside.is_empty()
        || inside
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return None;
    }
    Some(inside.to_string())
}

/// Drops porcelain v1 `-z` entries under the vault folder; a rename or copy entry
/// carries its source path as the next token.
pub(crate) fn filter_vault_status(status: &[u8], excluded: Option<&str>) -> Vec<u8> {
    let Some(folder) = excluded else {
        return status.to_vec();
    };
    if status.is_empty() {
        return Vec::new();
    }
    let text = String::from_utf8_lossy(status);
    let mut tokens: Vec<&str> = text.split('\0').collect();
    if tokens.last() == Some(&"") {
        tokens.pop();
    }
    let mut kept: Vec<&str> = Vec::new();
    let mut index = 0;
    while index < tokens.len() {
        let Some(&entry) = tokens.get(index) else {
            break;
        };
        let renamed = entry.starts_with('R') || entry.starts_with('C');
        let source = if renamed {
            tokens.get(index + 1).copied()
        } else {
            None
        };
        index += if renamed { 2 } else { 1 };
        let path = entry.get(3..).unwrap_or("");
        let inside = is_vault_path(path, Some(folder))
            && source.is_none_or(|from| is_vault_path(from, Some(folder)));
        if inside {
            continue;
        }
        kept.push(entry);
        if let Some(from) = source {
            kept.push(from);
        }
    }
    if kept.is_empty() {
        return Vec::new();
    }
    let mut out = kept.join("\0").into_bytes();
    out.push(0);
    out
}

fn continuity_excluded(relative: &str, target: Option<&str>, archive_prefix: Option<&str>) -> bool {
    target == Some(relative) || archive_prefix.is_some_and(|prefix| relative.starts_with(prefix))
}

fn git_continuity_observation(
    repo_root: &Path,
    target: Option<&str>,
    archive_prefix: Option<&str>,
) -> Result<(String, bool, Vec<String>), String> {
    let listing = run_source_git(
        repo_root,
        &[
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ],
    )?;
    let mut paths: Vec<String> = listing
        .split(|byte| *byte == 0)
        .filter(|path| !path.is_empty())
        .map(|path| String::from_utf8_lossy(path).replace('\\', "/"))
        .filter(|path| !continuity_excluded(path, target, archive_prefix))
        .collect();
    paths.sort();
    paths.dedup();

    let status = run_source_git(
        repo_root,
        &[
            "status",
            "--porcelain=v1",
            "--no-renames",
            "-z",
            "--untracked-files=all",
        ],
    )?;
    let mut visible_status: Vec<Vec<u8>> = status
        .split(|byte| *byte == 0)
        .filter(|row| !row.is_empty())
        .filter(|row| {
            let relative = status_path(row).unwrap_or_default();
            !continuity_excluded(&relative, target, archive_prefix)
        })
        .map(|row| row.to_vec())
        .collect();
    visible_status.sort();

    let dirty_paths: std::collections::HashSet<String> = visible_status
        .iter()
        .filter_map(|row| status_path(row))
        .collect();
    let mut inventory = SourceInventory {
        hasher: Sha256::new(),
        files: Vec::new(),
        hashed_bytes: 0,
        truncated: paths.len() > SOURCE_INVENTORY_MAX_FILES,
    };
    inventory.hasher.update(b"continuity-v1");
    inventory.hasher.update([0]);
    for relative in paths.iter().take(SOURCE_INVENTORY_MAX_FILES) {
        hash_source_file(
            &repo_root.join(relative),
            relative,
            &mut inventory,
            dirty_paths.contains(relative),
        )?;
    }
    for row in visible_status {
        inventory.hasher.update(&row);
        inventory.hasher.update([0]);
    }
    Ok((
        format!("sha256:{}", lower_hex(&inventory.hasher.finalize())),
        inventory.truncated,
        inventory.files,
    ))
}

#[tauri::command(async)]
pub(crate) fn inspect_project_source_continuity(
    source_root: String,
    vault_root: String,
    target_slug: String,
) -> Result<ProjectSourceContinuityInspection, String> {
    let selected_source = canonical_source_root(&source_root)?;
    let vault = canonical_root(&vault_root)?;
    let slug = normalize_relative_path(&target_slug)?;
    if slug.extension().is_some() || slug.as_os_str().is_empty() {
        return Err("continuity target must be a vault slug without an extension".into());
    }
    let target_path = vault.join(&slug).with_extension("md");
    let target_metadata = fs::symlink_metadata(&target_path).map_err(|err| err.to_string())?;
    if !target_metadata.file_type().is_file() || target_metadata.file_type().is_symlink() {
        return Err("continuity target must be an existing regular vault file".into());
    }
    let canonical_target = fs::canonicalize(&target_path).map_err(|err| err.to_string())?;
    if !canonical_target.starts_with(&vault) {
        return Err("continuity target must stay inside the selected vault".into());
    }
    let repo_root = git::find_repo_root(&selected_source)?
        .ok_or_else(|| "meaning transition continuity requires a Git source".to_string())?;
    let relative_target = canonical_target
        .strip_prefix(&repo_root)
        .ok()
        .map(|path| path.to_string_lossy().replace('\\', "/"));
    let archive = vault.join(".ontology-atlas/meaning-transitions");
    let relative_archive = archive.strip_prefix(&repo_root).ok().map(|path| {
        let mut value = path.to_string_lossy().replace('\\', "/");
        if !value.ends_with('/') {
            value.push('/');
        }
        value
    });
    let (fingerprint, truncated, files) = git_continuity_observation(
        &repo_root,
        relative_target.as_deref(),
        relative_archive.as_deref(),
    )?;
    if truncated {
        return Err("meaning transition continuity inventory is truncated".into());
    }
    let head = run_source_git(&repo_root, &["rev-parse", "HEAD"])?;
    let revision = String::from_utf8_lossy(&head).trim().to_string();
    let status = run_source_git(
        &repo_root,
        &[
            "status",
            "--porcelain=v1",
            "--no-renames",
            "-z",
            "--untracked-files=all",
        ],
    )?;
    let visible_dirty = status
        .split(|byte| *byte == 0)
        .filter(|row| !row.is_empty())
        .any(|row| {
            let relative = status_path(row).unwrap_or_default();
            !continuity_excluded(
                &relative,
                relative_target.as_deref(),
                relative_archive.as_deref(),
            )
        });
    let canonical = repo_root.to_string_lossy().to_string();
    Ok(ProjectSourceContinuityInspection {
        source: ProjectSourceInspection {
            root_path: canonical.clone(),
            source_id: source_digest(&[b"git", canonical.as_bytes()]),
            kind: "git".into(),
            revision,
            fingerprint,
            dirty: Some(visible_dirty),
            truncated: false,
            files,
        },
        scope: "meaning-transition-continuity-v1".into(),
        exclusions: ProjectSourceContinuityExclusions {
            target: relative_target,
            archive_prefix: relative_archive,
        },
    })
}

/// `vault_root`, when given and inside the source, is left out of the probe; without it
/// the probe is unchanged, so every existing receipt keeps its fingerprint.
#[tauri::command(async)]
pub(crate) fn inspect_project_source(
    root_path: String,
    vault_root: Option<String>,
) -> Result<ProjectSourceInspection, String> {
    let selected_root = canonical_source_root(&root_path)?;
    let canonical_vault = vault_root
        .as_deref()
        .and_then(|path| fs::canonicalize(path).ok())
        .map(|path| path.to_string_lossy().to_string());
    match git::find_repo_root(&selected_root)? {
        Some(repo_root) => {
            let canonical = repo_root.to_string_lossy().to_string();
            let excluded = canonical_vault
                .as_deref()
                .and_then(|vault| vault_folder_inside(&canonical, vault));
            // Git's tracked plus unignored set keeps caches and ignored artifacts out of the budget.
            let (inventory_fingerprint, truncated, files) =
                inspect_git_source_inventory(&repo_root, excluded.as_deref())?;
            let head = run_source_git(&repo_root, &["rev-parse", "HEAD"])?;
            let revision = String::from_utf8_lossy(&head).trim().to_string();
            let status = filter_vault_status(
                &run_source_git(
                    &repo_root,
                    &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
                )?,
                excluded.as_deref(),
            );
            Ok(ProjectSourceInspection {
                root_path: canonical.clone(),
                source_id: source_digest(&[b"git", canonical.as_bytes()]),
                kind: "git".into(),
                revision: revision.clone(),
                fingerprint: source_digest(&[
                    b"git-state-v1",
                    revision.as_bytes(),
                    inventory_fingerprint.as_bytes(),
                    &status,
                ]),
                dirty: Some(!status.is_empty()),
                truncated,
                files,
            })
        }
        None => {
            let canonical = selected_root.to_string_lossy().to_string();
            let excluded = canonical_vault
                .as_deref()
                .and_then(|vault| vault_folder_inside(&canonical, vault));
            let (fingerprint, truncated, files) =
                inspect_source_inventory(&selected_root, excluded.as_deref())?;
            Ok(ProjectSourceInspection {
                root_path: canonical.clone(),
                source_id: source_digest(&[b"folder", canonical.as_bytes()]),
                kind: "folder".into(),
                revision: fingerprint.clone(),
                fingerprint,
                dirty: None,
                truncated,
                files,
            })
        }
    }
}

#[cfg(test)]
mod tests;
