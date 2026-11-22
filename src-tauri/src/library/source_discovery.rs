//! Lists documents under granted roots as candidates to import, from file metadata alone.

use std::fs;
use std::path::Path;

use crate::canonical_source_root;

use super::discovery_rules::{
    discovery_accepts_directory, discovery_accepts_file, is_markdown_name, lower_extension,
    DISCOVERY_MAX_CANDIDATES, DISCOVERY_MAX_DEPTH, DISCOVERY_MIN_FILE_BYTES,
    DISCOVERY_VAULT_OWNED_DIRS,
};
use super::source_offer::{remember_source_offer, SourceOffer};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDiscoveryRoot {
    pub root_path: String,
    pub label: String,
    /// The open folder passes `sources` so imported files are not proposed again.
    #[serde(default)]
    pub skip_relative: Vec<String>,
    /// The open folder, the only root whose Markdown is offered; a bound code root's
    /// Markdown is developer documentation.
    #[serde(default)]
    pub open_folder: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceCandidate {
    pub root_path: String,
    pub root_label: String,
    pub relative_path: String,
    pub name: String,
    pub extension: String,
    pub size: u64,
    pub mtime: u128,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDiscoveryReport {
    pub candidates: Vec<SourceCandidate>,
    /// Silent truncation would read as the complete list.
    pub truncated: bool,
    pub unreadable_roots: Vec<String>,
}

fn walk_candidates(
    directory: &Path,
    root: &SourceDiscoveryRoot,
    prefix: &str,
    depth: usize,
    report: &mut SourceDiscoveryReport,
) {
    if depth > DISCOVERY_MAX_DEPTH || report.truncated {
        return;
    }
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        if report.candidates.len() >= DISCOVERY_MAX_CANDIDATES {
            report.truncated = true;
            return;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let relative = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        if root
            .skip_relative
            .iter()
            .any(|skip| relative == *skip || relative.starts_with(&format!("{skip}/")))
            || (root.open_folder
                && depth == 0
                && DISCOVERY_VAULT_OWNED_DIRS.contains(&name.to_ascii_lowercase().as_str()))
        {
            continue;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        // Symlinks are not followed, or a link could lead the walk outside granted roots.
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            if !discovery_accepts_directory(&relative) {
                continue;
            }
            walk_candidates(&entry.path(), root, &relative, depth + 1, report);
        } else if file_type.is_file()
            && discovery_accepts_file(&name)
            && (root.open_folder || !is_markdown_name(&name))
        {
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            if metadata.len() < DISCOVERY_MIN_FILE_BYTES {
                continue;
            }
            let mtime = metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|since| since.as_millis())
                .unwrap_or(0);
            report.candidates.push(SourceCandidate {
                root_path: root.root_path.clone(),
                root_label: root.label.clone(),
                relative_path: relative,
                name: name.clone(),
                extension: lower_extension(&name),
                size: metadata.len(),
                mtime,
            });
        }
    }
}

/// Metadata only: no file is opened and nothing is copied until the person chooses.
#[tauri::command(async)]
pub fn discover_source_candidates(
    roots: Vec<SourceDiscoveryRoot>,
) -> Result<SourceDiscoveryReport, String> {
    let mut report = SourceDiscoveryReport {
        candidates: Vec::new(),
        truncated: false,
        unreadable_roots: Vec::new(),
    };
    for root in &roots {
        // Only a granted vault or the repo a granted vault lives in; the renderer
        // supplies these from the vault root and its project-source bindings, so a
        // forged root cannot enumerate names/sizes/mtimes under an arbitrary directory.
        let Ok(canonical) = canonical_source_root(&root.root_path) else {
            report.unreadable_roots.push(root.label.clone());
            continue;
        };
        if crate::vault_root_rejection(&canonical).is_some() {
            report.unreadable_roots.push(root.label.clone());
            continue;
        }
        let start = report.candidates.len();
        walk_candidates(&canonical, root, "", 0, &mut report);
        for candidate in report.candidates.iter().skip(start) {
            if let Some(offer) = SourceOffer::of_file(
                canonical.join(&candidate.relative_path),
                candidate.relative_path.clone(),
            ) {
                remember_source_offer(
                    format!("{}/{}", candidate.root_path, candidate.relative_path),
                    offer,
                );
            }
        }
    }
    report
        .candidates
        .sort_by(|a, b| b.mtime.cmp(&a.mtime).then_with(|| a.name.cmp(&b.name)));
    Ok(report)
}

#[cfg(test)]
mod tests;
