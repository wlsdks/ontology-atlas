//! A bounded window of one file inside the vault's one connected code folder, read for a person
//! checking what a concept's cited lines say. The page sends only a repository-relative path and a
//! line; every call re-derives the root from the vault's recorded binding and checks the request
//! and its link target.

mod refusal;
#[cfg(test)]
mod tests;
mod window;

use crate::harness_source::{is_missing, relative_text};
use refusal::path_refusal;
use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub(crate) const NOT_CONNECTED: &str = "code-reader-not-connected";
pub(crate) const ACCESS_LOST: &str = "code-reader-access-lost";
pub(crate) const OTHER_SYSTEM: &str = "code-reader-other-system";
pub(crate) const GONE: &str = "code-reader-gone";
pub(crate) const SECRET: &str = "code-reader-secret";
pub(crate) const OUTSIDE: &str = "code-reader-outside";
pub(crate) const HIDDEN: &str = "code-reader-hidden";
pub(crate) const TOO_LARGE: &str = "code-reader-too-large";
pub(crate) const NOT_TEXT: &str = "code-reader-not-text";

/// A file of exactly this size is still read by window; one byte more is refused.
const CODE_FILE_MAX_BYTES: u64 = 2 * 1024 * 1024;
const BINDINGS_FILE: &str = ".ontology-atlas/project-sources.json";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodeWindow {
    lines: Vec<String>,
    first_line: u32,
    total_lines: u32,
    /// The one line shown only up to the byte bound, when the window cut a line short.
    cut_line: Option<u32>,
    last_modified: u64,
    bytes: u64,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodeFileStamp {
    last_modified: u64,
    bytes: u64,
}

/// The project slug of the vault's only binding; none when there are zero or several.
fn only_bound_project(sidecar: &str) -> Option<String> {
    let data: serde_json::Value = serde_json::from_str(sidecar).ok()?;
    let bindings = data.get("bindings")?.as_array()?;
    let [binding] = bindings.as_slice() else {
        return None;
    };
    binding.get("projectSlug")?.as_str().map(str::to_string)
}

fn connected_code_root(vault_path: &str) -> Result<PathBuf, String> {
    let vault = crate::canonical_root(vault_path).map_err(|_| ACCESS_LOST.to_string())?;
    let sidecar = match crate::gray_area::scope::read_text(&vault, Path::new(BINDINGS_FILE)) {
        Ok(text) => text,
        Err(code) if code == "unsupported_platform" => return Err(OTHER_SYSTEM.into()),
        Err(_) => return Err(NOT_CONNECTED.into()),
    };
    let project = only_bound_project(&sidecar).ok_or(NOT_CONNECTED)?;
    crate::harness_source::authorized_source_root(vault_path, &project).map_err(|code| {
        match code.as_str() {
            "harness-unsupported-platform" => OTHER_SYSTEM,
            "harness-binding-invalid" | "harness-binding-ambiguous" => NOT_CONNECTED,
            "harness-source-root-hidden" => HIDDEN,
            _ => ACCESS_LOST,
        }
        .to_string()
    })
}

/// A missing path is gone unless a link on it points nowhere: an answer that differed by whether
/// a link's target exists would tell the page what lies outside the folder.
fn missing_answer(root: &Path, requested: &Path) -> &'static str {
    let mut at = root.to_path_buf();
    for part in requested.components() {
        at.push(part);
        match fs::symlink_metadata(&at) {
            Ok(metadata) if metadata.file_type().is_symlink() => return OUTSIDE,
            Ok(_) => {}
            Err(_) => return GONE,
        }
    }
    GONE
}

/// The canonical target's path inside `root`, refused by the same rule as the request so a link
/// cannot reach a name the request could not.
fn resolve_inside(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    if let Some(refusal) = path_refusal(relative_path) {
        return Err(refusal.into());
    }
    let requested = crate::vault::scope::normalize_relative_path(relative_path)
        .map_err(|_| OUTSIDE.to_string())?;
    let canonical = fs::canonicalize(root.join(&requested)).map_err(|error| {
        if is_missing(&error) {
            missing_answer(root, &requested)
        } else {
            OUTSIDE
        }
        .to_string()
    })?;
    let relative = canonical
        .strip_prefix(root)
        .map_err(|_| OUTSIDE.to_string())?
        .to_path_buf();
    let target = relative_text(&relative).ok_or(OUTSIDE)?;
    if let Some(refusal) = path_refusal(&target) {
        return Err(refusal.into());
    }
    Ok(relative)
}

fn open_checked(root: &Path, relative: &Path) -> Result<(fs::File, fs::Metadata), String> {
    if cfg!(not(unix)) {
        return Err(OTHER_SYSTEM.into());
    }
    let file = crate::harness_source::read::open_no_follow(root, relative).map_err(|code| {
        if code == "harness-path-changed" {
            GONE
        } else {
            OUTSIDE
        }
        .to_string()
    })?;
    let metadata = file.metadata().map_err(|_| OUTSIDE.to_string())?;
    if !metadata.is_file() {
        return Err(NOT_TEXT.into());
    }
    if metadata.len() > CODE_FILE_MAX_BYTES {
        return Err(TOO_LARGE.into());
    }
    Ok((file, metadata))
}

fn modified_ms(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |elapsed| {
            u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX)
        })
}

/// The error never carries file content.
fn read_window(
    root: &Path,
    relative_path: &str,
    first_line: u32,
    line_count: u32,
) -> Result<CodeWindow, String> {
    let relative = resolve_inside(root, relative_path)?;
    let (file, metadata) = open_checked(root, &relative)?;
    let mut bytes = Vec::new();
    file.take(CODE_FILE_MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| NOT_TEXT.to_string())?;
    if bytes.len() as u64 > CODE_FILE_MAX_BYTES {
        return Err(TOO_LARGE.into());
    }
    if bytes.contains(&0) {
        return Err(NOT_TEXT.into());
    }
    let text = String::from_utf8(bytes).map_err(|_| NOT_TEXT.to_string())?;
    let window = window::window_of(&text, first_line, line_count);
    Ok(CodeWindow {
        lines: window.lines,
        first_line: window.first_line,
        total_lines: window.total_lines,
        cut_line: window.cut_line,
        last_modified: modified_ms(&metadata),
        bytes: text.len() as u64,
    })
}

fn stamp(root: &Path, relative_path: &str) -> Result<CodeFileStamp, String> {
    let relative = resolve_inside(root, relative_path)?;
    let (_, metadata) = open_checked(root, &relative)?;
    Ok(CodeFileStamp {
        last_modified: modified_ms(&metadata),
        bytes: metadata.len(),
    })
}

#[tauri::command(async)]
pub(crate) fn read_code_window(
    vault_path: String,
    relative_path: String,
    first_line: u32,
    line_count: u32,
) -> Result<CodeWindow, String> {
    let root = connected_code_root(&vault_path)?;
    read_window(&root, &relative_path, first_line, line_count)
}

/// Size and time only, so a check while the reader is open reads no content.
#[tauri::command(async)]
pub(crate) fn code_file_stamp(
    vault_path: String,
    relative_path: String,
) -> Result<CodeFileStamp, String> {
    let root = connected_code_root(&vault_path)?;
    stamp(&root, &relative_path)
}
