//! The app's door to `vault-index`: one background build per vault, the app's own folder walk
//! passed in, and a search that never creates an index. The WebView holds the on/off choice and
//! sends it with every command; off means no index files exist.

use super::scope::resolve_existing_inside;
use super::walk::vault_fingerprint;
use crate::blocking::run_blocking;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, Once, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use vault_index::{Check, Progress, Searcher};

const MAX_HITS: usize = 5000;
/// Delete waits this long for a running build to reach its next commit and stop.
const STOP_WAIT: Duration = Duration::from_secs(10);

#[derive(Default)]
struct VaultEntry {
    progress: Progress,
    running: AtomicBool,
    /// A pass was asked for while one ran; one more follows, however many requests arrived.
    again: AtomicBool,
    /// The first build of each launch runs SQLite's integrity check.
    checked: AtomicBool,
    /// Deleted from Settings: nothing rebuilds it until the folder is opened again.
    paused: AtomicBool,
    /// The last walk stopped at the app's file or depth limit, so the index covers part of the folder.
    truncated: AtomicBool,
    searcher: Mutex<Option<Searcher>>,
    failure: Mutex<Option<Failure>>,
}

/// Why the last pass failed; the message itself goes to the log.
#[derive(Clone, Copy, Debug)]
enum Failure {
    /// The folder could not be listed.
    Walk,
    /// The index could not be opened or written.
    Index,
}

/// Emitted after a pass that indexed, removed or rebuilt rows.
const INDEX_UPDATED_EVENT: &str = "vault-index-updated";

fn entries() -> &'static Mutex<HashMap<PathBuf, Arc<VaultEntry>>> {
    static ENTRIES: OnceLock<Mutex<HashMap<PathBuf, Arc<VaultEntry>>>> = OnceLock::new();
    ENTRIES.get_or_init(Default::default)
}

fn entry(root: &Path) -> Arc<VaultEntry> {
    let mut entries = entries()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    entries.entry(root.to_path_buf()).or_default().clone()
}

fn all_entries() -> Vec<Arc<VaultEntry>> {
    let entries = entries()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    entries.values().cloned().collect()
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Once per launch: indexes of folders that are gone or not opened for two weeks are deleted.
fn sweep_orphans_once() {
    static SWEEP: Once = Once::new();
    SWEEP.call_once(|| match vault_index::sweep_orphans() {
        Ok(0) => {}
        Ok(removed) => log::info!("removed {removed} unused vault index folder(s)"),
        Err(error) => log::warn!("vault index sweep failed: {error}"),
    });
}

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
enum IndexState {
    Off,
    Absent,
    Building,
    Ready,
    /// Ready over the part of the folder the walk reached before its limit.
    Partial,
    Paused,
    /// The index could not be opened or written.
    Unavailable,
    /// The folder could not be listed, so nothing could be indexed.
    Unreadable,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VaultIndexStatus {
    state: IndexState,
    indexed: u64,
    total: u64,
    /// This vault's index files, WAL files included.
    size_bytes: u64,
    /// Every vault's index on this computer.
    all_bytes: u64,
    vaults: usize,
}

pub(super) fn granted_root(root_path: &str) -> Result<PathBuf, String> {
    resolve_existing_inside(root_path, "")
}

fn status_of(root: Option<&Path>, enabled: bool) -> VaultIndexStatus {
    let all_bytes = vault_index::stored_bytes(None).unwrap_or(0);
    let vaults = vault_index::stored_vaults().unwrap_or(0);
    let Some(root) = root else {
        let state = if enabled {
            IndexState::Absent
        } else {
            IndexState::Off
        };
        return VaultIndexStatus {
            state,
            indexed: 0,
            total: 0,
            size_bytes: 0,
            all_bytes,
            vaults,
        };
    };
    let entry = entry(root);
    let size_bytes = vault_index::stored_bytes(Some(root)).unwrap_or(0);
    let state = if !enabled {
        IndexState::Off
    } else if (entry.progress.is_building() || entry.running.load(Ordering::Relaxed))
        && (size_bytes == 0 || entry.progress.indexed() < entry.progress.total())
    {
        // A stamp pass over an index that is already complete stays quiet; only files still
        // waiting to be indexed make the palette say it is indexing.
        IndexState::Building
    } else if entry.paused.load(Ordering::Relaxed) {
        IndexState::Paused
    } else if let Some(failure) = lock(&entry.failure).as_ref() {
        match failure {
            Failure::Walk => IndexState::Unreadable,
            Failure::Index => IndexState::Unavailable,
        }
    } else if size_bytes > 0 && entry.truncated.load(Ordering::Relaxed) {
        IndexState::Partial
    } else if size_bytes > 0 {
        IndexState::Ready
    } else {
        IndexState::Absent
    };
    VaultIndexStatus {
        state,
        indexed: entry.progress.indexed(),
        total: entry.progress.total(),
        size_bytes,
        all_bytes,
        vaults,
    }
}

/// Starts a pass unless one is running, in which case exactly one more follows it.
fn request_pass(app: AppHandle, root: PathBuf, entry: Arc<VaultEntry>) {
    if entry.running.swap(true, Ordering::AcqRel) {
        entry.again.store(true, Ordering::Release);
        return;
    }
    let spawned = std::thread::Builder::new()
        .name("vault-index".into())
        .spawn(move || loop {
            entry.again.store(false, Ordering::Release);
            if run_pass(&root, &entry) {
                // An open query asks again now rather than when the document list next reloads.
                let _ = app.emit(INDEX_UPDATED_EVENT, ());
                super::vectors::after_index_pass(&root);
            }
            let paused = || entry.paused.load(Ordering::Acquire);
            if !paused() && entry.again.load(Ordering::Acquire) {
                continue;
            }
            entry.running.store(false, Ordering::Release);
            // A request that arrived between the check above and the store must not be lost.
            if paused()
                || !entry.again.load(Ordering::Acquire)
                || entry.running.swap(true, Ordering::AcqRel)
            {
                break;
            }
        });
    if let Err(error) = spawned {
        log::warn!("vault index thread did not start: {error}");
    }
}

/// The folder walk's Markdown files, and whether the walk stopped at its limit.
pub(super) struct Walked {
    pub(super) files: Vec<String>,
    truncated: bool,
}

/// The walk also lists sources (PDF, CSV and others); the index reads Markdown only.
fn markdown_only(paths: impl IntoIterator<Item = String>) -> Vec<String> {
    paths
        .into_iter()
        .filter(|path| path.ends_with(".md"))
        .collect()
}

pub(super) fn markdown_files(root: &Path) -> Result<Walked, String> {
    let walked = vault_fingerprint(root.to_string_lossy().into_owned())?;
    Ok(Walked {
        truncated: walked.truncated(),
        files: markdown_only(walked.entries.into_iter().map(|stamp| stamp.relative_path)),
    })
}

fn run_pass(root: &Path, entry: &VaultEntry) -> bool {
    run_pass_with(root, entry, markdown_files(root))
}

/// Whether the pass changed what a search can find. A walk that fails is reported, not waited on.
fn run_pass_with(root: &Path, entry: &VaultEntry, walked: Result<Walked, String>) -> bool {
    let files = match walked {
        Ok(walked) => {
            entry.truncated.store(walked.truncated, Ordering::Relaxed);
            walked.files
        }
        Err(error) => {
            log::warn!("vault index walk failed: {error}");
            *lock(&entry.failure) = Some(Failure::Walk);
            return false;
        }
    };
    let check = if entry.checked.swap(true, Ordering::AcqRel) {
        Check::IfInterrupted
    } else {
        Check::Always
    };
    let started = Instant::now();
    let mut outcome = vault_index::sync(root, &files, &entry.progress, check);
    if outcome.as_ref().is_err_and(vault_index::Error::is_damage) {
        *lock(&entry.searcher) = None;
        outcome = vault_index::set_aside_damaged(root)
            .and_then(|()| vault_index::sync(root, &files, &entry.progress, Check::IfInterrupted));
    }
    match outcome {
        Ok(report) => {
            *lock(&entry.failure) = None;
            if report.repair != vault_index::Repair::default() {
                *lock(&entry.searcher) = None;
                log::info!("vault index rebuilt: {:?}", report.repair);
            }
            if report.indexed + report.removed > 0 {
                log::info!(
                    "vault index: {} file(s) indexed, {} removed of {} in {:?}",
                    report.indexed,
                    report.removed,
                    report.files,
                    started.elapsed()
                );
            }
            report.indexed + report.removed > 0 || report.repair.created
        }
        Err(vault_index::Error::Cancelled) => false,
        Err(error) => {
            // The error names no vault content: SQLite and I/O messages carry codes and paths
            // inside the cache folder only.
            log::warn!("vault index unavailable: {error}");
            *lock(&entry.failure) = Some(Failure::Index);
            false
        }
    }
}

/// What the WebView shows: state, progress and size. Never creates an index.
#[tauri::command]
pub(crate) async fn vault_index_status(
    root_path: Option<String>,
    enabled: bool,
) -> Result<VaultIndexStatus, String> {
    run_blocking(move || {
        sweep_orphans_once();
        let root = root_path.as_deref().map(granted_root).transpose()?;
        Ok(status_of(root.as_deref(), enabled))
    })
    .await
}

/// A stamp pass on a background thread, from vault open, the watcher and the slow poll. With
/// `enabled` false every index is deleted instead. `opened` marks a fresh open of the folder,
/// which ends a pause left by Delete.
#[tauri::command]
pub(crate) async fn vault_index_sync(
    app: AppHandle,
    root_path: String,
    enabled: bool,
    opened: bool,
) -> Result<VaultIndexStatus, String> {
    run_blocking(move || {
        sweep_orphans_once();
        let root = granted_root(&root_path)?;
        if !enabled {
            delete_every_index()?;
            return Ok(status_of(Some(&root), false));
        }
        let entry = entry(&root);
        if opened {
            entry.paused.store(false, Ordering::Release);
        }
        if !entry.paused.load(Ordering::Acquire) {
            request_pass(app, root.clone(), entry);
        }
        Ok(status_of(Some(&root), true))
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VaultIndexHit {
    path: String,
    rank: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VaultIndexAnswer {
    hits: Vec<VaultIndexHit>,
    status: VaultIndexStatus,
}

/// Ranked paths for `query`, best first, from what is indexed so far. Each hit's file still
/// matches its row; the WebView reads the files to show the matching lines.
#[tauri::command]
pub(crate) async fn vault_index_search(
    app: AppHandle,
    root_path: String,
    query: String,
    limit: usize,
    enabled: bool,
) -> Result<VaultIndexAnswer, String> {
    run_blocking(move || {
        let root = granted_root(&root_path)?;
        if !enabled {
            return Ok(VaultIndexAnswer {
                hits: Vec::new(),
                status: status_of(Some(&root), false),
            });
        }
        let entry = entry(&root);
        let found = search_entry(&root, &entry, &query, limit.min(MAX_HITS));
        let hits = match found {
            Ok(Some(found)) => {
                if found.stale > 0 && !entry.paused.load(Ordering::Acquire) {
                    request_pass(app.clone(), root.clone(), entry.clone());
                }
                found.hits
            }
            Ok(None) => {
                if !entry.paused.load(Ordering::Acquire) {
                    request_pass(app.clone(), root.clone(), entry.clone());
                }
                Vec::new()
            }
            Err(error) if error.is_damage() => {
                *lock(&entry.searcher) = None;
                if vault_index::set_aside_damaged(&root).is_ok() {
                    request_pass(app.clone(), root.clone(), entry.clone());
                }
                Vec::new()
            }
            Err(error) => return Err(error.to_string()),
        };
        Ok(VaultIndexAnswer {
            hits: hits
                .into_iter()
                .map(|hit| VaultIndexHit {
                    path: hit.path,
                    rank: hit.rank,
                })
                .collect(),
            status: status_of(Some(&root), true),
        })
    })
    .await
}

fn search_entry(
    root: &Path,
    entry: &VaultEntry,
    query: &str,
    limit: usize,
) -> vault_index::Result<Option<vault_index::Found>> {
    let mut searcher = lock(&entry.searcher);
    if searcher.is_none() {
        *searcher = Searcher::open(root)?;
    }
    match searcher.as_ref() {
        Some(open) => open.search(query, limit).map(Some),
        None => Ok(None),
    }
}

/// Stops every build, closes every connection, then deletes every vault's index.
fn delete_every_index() -> Result<(), String> {
    delete_indexes(None)
}

/// Stops and deletes one vault's index, or every vault's when `root` is `None`. Each stays
/// deleted until its folder is opened again.
fn delete_indexes(root: Option<&Path>) -> Result<(), String> {
    let entries = match root {
        Some(root) => vec![entry(root)],
        None => all_entries(),
    };
    for entry in &entries {
        entry.paused.store(true, Ordering::Release);
        entry.progress.request_cancel();
    }
    let started = Instant::now();
    while entries
        .iter()
        .any(|entry| entry.running.load(Ordering::Acquire))
        && started.elapsed() < STOP_WAIT
    {
        std::thread::sleep(Duration::from_millis(20));
    }
    for entry in &entries {
        *lock(&entry.searcher) = None;
        *lock(&entry.failure) = None;
    }
    super::vectors::with_jobs_stopped(root, || vault_index::delete(root))
        .map_err(|error| error.to_string())
}

/// A folder taken off the app's folder list: its index is deleted at once. The folder may be gone
/// or no longer granted, so the path is not resolved through the grants; it only names which
/// index folder to delete, and the crate deletes nothing but its own index folders.
#[tauri::command]
pub(crate) async fn vault_index_forget(root_path: String) -> Result<(), String> {
    run_blocking(move || {
        let root = PathBuf::from(&root_path);
        if !root.is_absolute() {
            return Err("vault-index-forget-needs-an-absolute-path".into());
        }
        delete_indexes(Some(&root))
    })
    .await
}

/// Settings' Delete: the open folder's index, or every folder's when none is open. It stays
/// deleted until its folder is opened again.
#[tauri::command]
pub(crate) async fn vault_index_clear(
    root_path: Option<String>,
    enabled: bool,
) -> Result<VaultIndexStatus, String> {
    run_blocking(move || {
        let root = root_path.as_deref().map(granted_root).transpose()?;
        delete_indexes(root.as_deref())?;
        Ok(status_of(root.as_deref(), enabled))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::grants::EnforcedScope;

    fn temp_vault(label: &str) -> PathBuf {
        static INDEX_DIR: Once = Once::new();
        INDEX_DIR.call_once(|| {
            let dir =
                std::env::temp_dir().join(format!("atlas-index-bridge-{}", std::process::id()));
            std::env::set_var(vault_index::INDEX_DIR_OVERRIDE_ENV, dir);
        });
        let dir = std::env::temp_dir().join(format!("atlas-index-{label}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.md"), "quillwort").unwrap();
        std::fs::canonicalize(&dir).unwrap()
    }

    #[test]
    fn only_markdown_reaches_the_index() {
        let listed = [
            "a.md",
            "sources/report.pdf",
            "data.csv",
            "notes.MD.txt",
            "wiki/b.md",
        ];
        assert_eq!(
            markdown_only(listed.iter().map(|path| path.to_string())),
            vec!["a.md".to_string(), "wiki/b.md".to_string()]
        );
    }

    #[test]
    fn a_folder_the_person_did_not_choose_is_refused() {
        let granted = temp_vault("granted");
        let other = temp_vault("not-granted");
        let _scope = EnforcedScope::granting(std::slice::from_ref(&granted));
        assert_eq!(granted_root(&granted.to_string_lossy()).unwrap(), granted);
        assert!(granted_root(&other.to_string_lossy()).is_err());
        assert!(granted_root(&granted.join("../not-granted").to_string_lossy()).is_err());
    }

    #[test]
    fn a_walk_that_fails_says_so_instead_of_getting_ready_forever() {
        let root = temp_vault("walk-fails");
        let entry = entry(&root);
        assert!(!run_pass_with(
            &root,
            &entry,
            Err("permission denied".into())
        ));
        assert_eq!(status_of(Some(&root), true).state, IndexState::Unreadable);
        let _ = vault_index::delete(Some(&root));
    }

    #[test]
    fn an_index_over_part_of_the_folder_is_not_called_ready() {
        let root = temp_vault("truncated");
        let entry = entry(&root);
        let walked = |truncated| {
            Ok(Walked {
                files: vec!["a.md".into()],
                truncated,
            })
        };
        assert!(run_pass_with(&root, &entry, walked(true)));
        assert_eq!(status_of(Some(&root), true).state, IndexState::Partial);
        run_pass_with(&root, &entry, walked(false));
        assert_eq!(status_of(Some(&root), true).state, IndexState::Ready);
        let _ = vault_index::delete(Some(&root));
    }
}
