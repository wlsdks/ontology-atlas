//! Decides where an imported file may land and which names the destination folder already holds.

use std::fs;
use std::path::Path;

use super::discovery_rules::lower_extension;
use super::file_hashing::hash_path;

/// Same value as TS `VAULT_SOURCES_DIR`.
pub(super) const SOURCES_DIR: &str = "sources";
/// Same value as TS `PLANNING_HOME_FOLDER`.
const PLANNING_DIR: &str = "planning";

/// The only folders an import may land in. The page names one; it never sends a path,
/// and any other value fails argument parsing before the command runs.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImportDestination {
    #[default]
    Sources,
    Planning,
}

impl ImportDestination {
    pub(super) fn folder(self) -> &'static str {
        match self {
            Self::Sources => SOURCES_DIR,
            Self::Planning => PLANNING_DIR,
        }
    }
}

pub(super) fn safe_source_file_name(name: &str) -> Option<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return None;
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains('\0') {
        return None;
    }
    // A leading dot would hide the imported file from the vault walk.
    Some(trimmed.trim_start_matches('.').to_string()).filter(|value| !value.is_empty())
}

pub(super) fn split_stem_and_extension(name: &str) -> (String, String) {
    match name.rsplit_once('.') {
        Some((stem, extension)) if !stem.is_empty() => (stem.to_string(), format!(".{extension}")),
        _ => (name.to_string(), String::new()),
    }
}

/// Indexed by content hash so the same bytes under another name are recognised.
pub(super) fn existing_file_hashes(
    root: &Path,
    folder: &str,
) -> Result<Vec<(String, String)>, String> {
    let destination = root.join(folder);
    if !destination.is_dir() {
        return Ok(Vec::new());
    }
    let mut existing = Vec::new();
    let mut stack = vec![(destination, String::from(folder))];
    while let Some((directory, prefix)) = stack.pop() {
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            let relative = format!("{prefix}/{name}");
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_dir() {
                stack.push((entry.path(), relative));
            } else if file_type.is_file() {
                if let Ok(hash) = hash_path(&entry.path()) {
                    existing.push((hash, relative));
                }
            }
        }
    }
    Ok(existing)
}

/// An offer's recorded path, split into folders and a file name that each pass the
/// single-name rule, so no segment can be `..`, absolute, or carry a separator.
pub(super) fn split_destination(relative: &str) -> Option<(Vec<String>, String)> {
    let mut segments = Vec::new();
    for segment in relative.split('/') {
        if cfg!(windows) && segment.contains(':') {
            return None;
        }
        segments.push(safe_source_file_name(segment)?);
    }
    let name = segments.pop()?;
    Some((segments, name))
}

/// The home scan's rule: its file types, and secret-looking words refused for images only.
pub(super) fn planning_lists_name(name: &str) -> bool {
    let name_os = std::ffi::OsStr::new(name);
    crate::planning::supported_file(name_os)
        && (lower_extension(name) == "md" || crate::planning::allowed_component(name_os))
}

/// The planning folder is read and indexed by path, so a link there would lead both outside.
pub(super) fn refuse_linked_folder(target: &Path) -> Result<(), String> {
    match fs::symlink_metadata(target) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            Err("import-destination-not-a-folder".into())
        }
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error.to_string()),
        _ => Ok(()),
    }
}

/// Planning names compare ignoring letter case, as new documents do; `sources` keeps
/// asking the file system alone. Every entry counts, so a dangling link's name stays taken.
pub(super) fn lowercased_planning_names(
    destination: ImportDestination,
    target: &Path,
) -> Option<std::collections::HashSet<String>> {
    if destination != ImportDestination::Planning {
        return None;
    }
    let entries = fs::read_dir(target).ok()?;
    Some(
        entries
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().to_lowercase())
            .collect(),
    )
}

pub(super) fn name_taken(
    target: &Path,
    lowercased_names: Option<&std::collections::HashSet<String>>,
    candidate: &str,
) -> bool {
    // A dangling link still holds its name.
    fs::symlink_metadata(target.join(candidate)).is_ok()
        || lowercased_names.is_some_and(|names| names.contains(&candidate.to_lowercase()))
}

#[cfg(test)]
mod tests;
