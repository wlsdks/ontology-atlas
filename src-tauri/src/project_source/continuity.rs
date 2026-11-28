//! Meaning-transition continuity: one observation of a Git source that hashes whole file contents
//! of every visible file, so a transition archive can prove the code did not move between two
//! reads. It is a different question from the receipt's fingerprint (`project-source` crate), which
//! hashes only changed files, and keeps its own bounds.

use super::{run_source_git, source_digest, ProjectSourceInspection};
use crate::git;
use crate::lower_hex::lower_hex;
use crate::vault::scope::{canonical_root, canonical_source_root, normalize_relative_path};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::Path;

const CONTINUITY_MAX_FILES: usize = 16000;
const CONTINUITY_MAX_HASH_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ProjectSourceContinuityExclusions {
    pub(super) target: Option<String>,
    pub(super) archive_prefix: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectSourceContinuityInspection {
    #[serde(flatten)]
    pub(super) source: ProjectSourceInspection,
    scope: String,
    pub(super) exclusions: ProjectSourceContinuityExclusions,
}

struct ContinuityInventory {
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

fn hash_continuity_file(
    path: &Path,
    relative: &str,
    inventory: &mut ContinuityInventory,
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
        let remaining = CONTINUITY_MAX_HASH_BYTES.saturating_sub(inventory.hashed_bytes);
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

    let remaining = CONTINUITY_MAX_HASH_BYTES.saturating_sub(inventory.hashed_bytes);
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

/// The path of one porcelain status row: what follows the two status letters and the space.
fn status_path(row: &[u8]) -> Option<String> {
    row.get(3..)
        .filter(|path| !path.is_empty())
        .map(|path| String::from_utf8_lossy(path).replace('\\', "/"))
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
    let mut inventory = ContinuityInventory {
        hasher: Sha256::new(),
        files: Vec::new(),
        hashed_bytes: 0,
        truncated: paths.len() > CONTINUITY_MAX_FILES,
    };
    inventory.hasher.update(b"continuity-v1");
    inventory.hasher.update([0]);
    for relative in paths.iter().take(CONTINUITY_MAX_FILES) {
        hash_continuity_file(
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
