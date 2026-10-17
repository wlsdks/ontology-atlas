//! Read-only harness files of a vault project's one bound folder. The page never sends a source
//! path; every call re-derives the root and checks the request and its link target.

mod projection;
mod read;
mod scope;
#[cfg(test)]
mod tests;

use crate::gray_area_scope::resolve_binding_metadata;
use crate::vault::scope::normalize_relative_path;
use scope::{is_denied_name, list_class, read_class, ListClass, ReadClass};
use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};

const LISTING_MAX_ENTRIES: usize = 20_000;
const PROJECT_SLUG_MAX_BYTES: usize = 256;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HarnessSourceEntry {
    name: String,
    kind: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HarnessSourceText {
    text: String,
    last_modified: u64,
    bytes: u64,
}

fn authorized_source_root(vault_path: &str, project_slug: &str) -> Result<PathBuf, String> {
    let vault = crate::canonical_root(vault_path)?;
    if project_slug.is_empty()
        || project_slug.len() > PROJECT_SLUG_MAX_BYTES
        || project_slug.contains('\0')
    {
        return Err("harness-binding-invalid".into());
    }
    let binding =
        resolve_binding_metadata(&vault, project_slug).map_err(|code| match code.as_str() {
            "binding_invalid" | "unsafe_path" => "harness-binding-invalid",
            "binding_ambiguous" => "harness-binding-ambiguous",
            "binding_identity_changed" => "harness-binding-changed",
            "source_unavailable" => "harness-source-missing",
            "unsupported_platform" => "harness-unsupported-platform",
            _ => "harness-binding-unreadable",
        })?;
    if let Some(reason) = crate::vault_root_rejection(&binding.root) {
        return Err(format!("source-root-rejected: {reason}"));
    }
    crate::canonical_source_root(&binding.root.to_string_lossy())
}

/// `class` is the link target's class, not the request's.
struct Resolved {
    canonical: PathBuf,
    relative: PathBuf,
    class: ReadClass,
}

enum Want {
    Read,
    List,
}

fn relative_text(relative: &Path) -> Option<String> {
    let mut parts = Vec::new();
    for component in relative.components() {
        let Component::Normal(part) = component else {
            return None;
        };
        parts.push(part.to_str()?);
    }
    Some(parts.join("/"))
}

fn refusal_for(read: ReadClass) -> &'static str {
    match read {
        ReadClass::Invalid => "harness-path-invalid",
        ReadClass::Denied => "harness-path-denied",
        _ => "harness-path-not-allowed",
    }
}

fn list_refusal(class: ListClass) -> &'static str {
    match class {
        ListClass::Invalid => "harness-path-invalid",
        ListClass::Denied => "harness-path-denied",
        _ => "harness-path-not-allowed",
    }
}

fn check_class(want: &Want, path: &str) -> Result<ReadClass, String> {
    let class = read_class(path);
    match want {
        Want::Read => match class {
            ReadClass::Invalid | ReadClass::Denied | ReadClass::NotAllowed => {
                Err(refusal_for(class).into())
            }
            _ => Ok(class),
        },
        Want::List => match list_class(path) {
            ListClass::Listable => Ok(class),
            other => Err(list_refusal(other).into()),
        },
    }
}

fn is_missing(error: &std::io::Error) -> bool {
    error.kind() == std::io::ErrorKind::NotFound
        || error.raw_os_error() == Some(if cfg!(windows) { 267 } else { 20 })
}

fn resolve_inside(root: &Path, relative_path: &str, want: Want) -> Result<Resolved, String> {
    check_class(&want, relative_path)?;
    let requested =
        normalize_relative_path(relative_path).map_err(|_| "harness-path-invalid".to_string())?;
    let canonical = fs::canonicalize(root.join(&requested)).map_err(|error| {
        if is_missing(&error) {
            "harness-path-missing".to_string()
        } else {
            format!("harness-read-failed: {relative_path}: {error}")
        }
    })?;
    let relative = canonical
        .strip_prefix(root)
        .map_err(|_| "harness-path-missing".to_string())?
        .to_path_buf();
    // The canonical target also catches case folding that the request check cannot see.
    let target = relative_text(&relative).ok_or("harness-path-invalid")?;
    let class = check_class(&want, &target)?;
    Ok(Resolved {
        canonical,
        relative,
        class,
    })
}

fn list_directory(root: &Path, relative_path: &str) -> Result<Vec<HarnessSourceEntry>, String> {
    let target = resolve_inside(root, relative_path, Want::List)?;
    if !target.canonical.is_dir() {
        return Err("harness-not-a-directory".into());
    }
    let mut entries = Vec::new();
    let reader = fs::read_dir(&target.canonical)
        .map_err(|error| format!("harness-read-failed: {relative_path}: {error}"))?;
    for entry in reader {
        let entry =
            entry.map_err(|error| format!("harness-read-failed: {relative_path}: {error}"))?;
        if entries.len() >= LISTING_MAX_ENTRIES {
            return Err("harness-listing-too-large".into());
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let kind = if file_type.is_file() {
            "file"
        } else if file_type.is_dir() {
            "directory"
        } else {
            continue;
        };
        let Some(name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        if is_denied_name(&name) {
            continue;
        }
        entries.push(HarnessSourceEntry { name, kind });
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

fn read_text(root: &Path, relative_path: &str) -> Result<HarnessSourceText, String> {
    let target = resolve_inside(root, relative_path, Want::Read)?;
    let file = read::read_bounded_text(root, &target.relative)?;
    Ok(HarnessSourceText {
        text: projection::project(target.class, &file.text),
        last_modified: file.last_modified,
        bytes: file.bytes,
    })
}

fn path_exists(root: &Path, relative_path: &str) -> Result<bool, String> {
    match read_class(relative_path) {
        ReadClass::Invalid => return Err("harness-path-invalid".into()),
        ReadClass::Denied => return Ok(false),
        _ => {}
    }
    let requested =
        normalize_relative_path(relative_path).map_err(|_| "harness-path-invalid".to_string())?;
    let Ok(canonical) = fs::canonicalize(root.join(requested)) else {
        return Ok(false);
    };
    let Ok(relative) = canonical.strip_prefix(root) else {
        return Ok(false);
    };
    Ok(relative_text(relative).is_some_and(|target| read_class(&target) != ReadClass::Denied))
}

#[tauri::command(async)]
pub(crate) fn list_harness_source_directory(
    vault_path: String,
    project_slug: String,
    relative_path: String,
) -> Result<Vec<HarnessSourceEntry>, String> {
    let root = authorized_source_root(&vault_path, &project_slug)?;
    list_directory(&root, &relative_path)
}

#[tauri::command(async)]
pub(crate) fn read_harness_source_text(
    vault_path: String,
    project_slug: String,
    relative_path: String,
) -> Result<HarnessSourceText, String> {
    let root = authorized_source_root(&vault_path, &project_slug)?;
    read_text(&root, &relative_path)
}

#[tauri::command(async)]
pub(crate) fn harness_source_path_exists(
    vault_path: String,
    project_slug: String,
    relative_path: String,
) -> Result<bool, String> {
    let root = authorized_source_root(&vault_path, &project_slug)?;
    path_exists(&root, &relative_path)
}
