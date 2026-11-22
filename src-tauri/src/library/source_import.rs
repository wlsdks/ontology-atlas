//! Copies offered files into the vault's `sources/` or `planning/` folder and reports each result.

use std::collections::HashMap;
use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::canonical_root;

use super::import_destination::{
    existing_file_hashes, lowercased_planning_names, refuse_linked_folder, ImportDestination,
};
use super::import_run::ImportRun;
use super::running_imports::{running_imports, ImportingFolder};
use super::source_offer::{take_source_offer, SourceOffer};

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceImportResult {
    pub picked_name: String,
    /// `added` · `duplicate` · `renamed` · `failed`.
    pub status: String,
    /// For `duplicate`, the file that already held these bytes.
    pub relative_path: Option<String>,
    pub sha256: Option<String>,
    pub size: Option<u64>,
    pub reason: Option<String>,
}

/// How one import reports and stops. Each call owns its flag, so a page's Stop reaches
/// only the copy it started; the flag is read between files, so a file is never cut.
#[derive(Default)]
pub(crate) struct ImportControl<'a> {
    pub(crate) stop: Option<&'a AtomicBool>,
    pub(crate) progress: Option<&'a dyn Fn(usize, usize)>,
}

/// Never overwrites and refuses a second copy of the same bytes. Nothing is written
/// beside the copy, since a sidecar index would be a second canonical store
/// (`.claude/rules/forbidden.md`).
#[tauri::command(async)]
pub fn import_source_files(
    root_path: String,
    source_paths: Vec<String>,
    destination: Option<ImportDestination>,
) -> Result<Vec<SourceImportResult>, String> {
    import_sources(
        &root_path,
        source_paths,
        destination.unwrap_or_default(),
        &ImportControl::default(),
    )
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceImportProgress {
    pub done: usize,
    pub total: usize,
}

/// A 2,000-file copy sends about this many updates a second, not one per file.
const PROGRESS_INTERVAL: std::time::Duration = std::time::Duration::from_millis(100);

/// Copies offered paths into `sources/`, each under the folders Rust recorded when it
/// offered the path, and streams how many are done. Off the main thread, so input stays live.
#[tauri::command(async)]
pub fn import_offered_sources(
    root_path: String,
    source_paths: Vec<String>,
    import_id: String,
    progress: tauri::ipc::Channel<SourceImportProgress>,
) -> Result<Vec<SourceImportResult>, String> {
    let Some(_folder) = ImportingFolder::claim(canonical_root(&root_path)?) else {
        return Err("import-already-running".into());
    };
    let stop = Arc::new(AtomicBool::new(false));
    running_imports()
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .insert(import_id.clone(), stop.clone());
    let last_sent = std::cell::Cell::new(None::<std::time::Instant>);
    let report = |done: usize, total: usize| {
        let now = std::time::Instant::now();
        let recent = last_sent
            .get()
            .is_some_and(|at| now.duration_since(at) < PROGRESS_INTERVAL);
        if done < total && recent {
            return;
        }
        last_sent.set(Some(now));
        let _ = progress.send(SourceImportProgress { done, total });
    };
    let outcome = import_sources(
        &root_path,
        source_paths,
        ImportDestination::Sources,
        &ImportControl {
            stop: Some(&stop),
            progress: Some(&report),
        },
    );
    running_imports()
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .remove(&import_id);
    outcome
}

pub(crate) fn import_sources(
    root_path: &str,
    source_paths: Vec<String>,
    destination: ImportDestination,
    control: &ImportControl,
) -> Result<Vec<SourceImportResult>, String> {
    let folder = destination.folder();
    // Every offer is spent before any refusal, so a refused pick never stays importable.
    let mut resolved: HashMap<String, SourceOffer> = HashMap::new();
    for source_path in &source_paths {
        if !resolved.contains_key(source_path) {
            if let Some(offer) = take_source_offer(source_path) {
                resolved.insert(source_path.clone(), offer);
            }
        }
    }
    let root = canonical_root(root_path)?;
    let target = root.join(folder);
    refuse_linked_folder(&target)?;
    fs::create_dir_all(&target).map_err(|err| err.to_string())?;
    let mut run = ImportRun {
        root_path,
        folder,
        destination,
        existing: existing_file_hashes(&root, folder)?,
        taken: lowercased_planning_names(destination, &target),
        target,
        landed: HashMap::new(),
        folder_names: HashMap::new(),
    };
    let total = source_paths.len();
    let mut results = Vec::with_capacity(total);
    for (index, source_path) in source_paths.iter().enumerate() {
        if control
            .stop
            .is_some_and(|stop| stop.load(Ordering::Relaxed))
        {
            break;
        }
        results.push(run.copy_one(source_path, resolved.get(source_path)));
        if let Some(progress) = control.progress {
            progress(index + 1, total);
        }
    }
    Ok(results)
}

#[cfg(test)]
mod tests;
