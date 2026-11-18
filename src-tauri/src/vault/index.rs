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
use vault_index::{Check, Progress, Searcher};

const MAX_HITS: usize = 50;
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
    searcher: Mutex<Option<Searcher>>,
    failure: Mutex<Option<String>>,
}

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

/// Once per launch: indexes of folders that are gone and unused for sixty days are deleted.
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
    Paused,
    Unavailable,
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

fn granted_root(root_path: &str) -> Result<PathBuf, String> {
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
    } else if entry.progress.is_building() || entry.running.load(Ordering::Relaxed) {
        IndexState::Building
    } else if entry.paused.load(Ordering::Relaxed) {
        IndexState::Paused
    } else if lock(&entry.failure).is_some() {
        IndexState::Unavailable
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
fn request_pass(root: PathBuf, entry: Arc<VaultEntry>) {
    if entry.running.swap(true, Ordering::AcqRel) {
        entry.again.store(true, Ordering::Release);
        return;
    }
    let spawned = std::thread::Builder::new()
        .name("vault-index".into())
        .spawn(move || loop {
            entry.again.store(false, Ordering::Release);
            run_pass(&root, &entry);
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

fn markdown_files(root: &Path) -> Result<Vec<String>, String> {
    let walked = vault_fingerprint(root.to_string_lossy().into_owned())?;
    Ok(walked
        .entries
        .into_iter()
        .map(|stamp| stamp.relative_path)
        .filter(|path| path.ends_with(".md"))
        .collect())
}

fn run_pass(root: &Path, entry: &VaultEntry) {
    let files = match markdown_files(root) {
        Ok(files) => files,
        Err(error) => {
            log::warn!("vault index walk failed: {error}");
            return;
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
        }
        Err(vault_index::Error::Cancelled) => {}
        Err(error) => {
            // The error names no vault content: SQLite and I/O messages carry codes and paths
            // inside the cache folder only.
            log::warn!("vault index unavailable: {error}");
            *lock(&entry.failure) = Some(error.to_string());
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
            request_pass(root.clone(), entry);
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
                    request_pass(root.clone(), entry.clone());
                }
                found.hits
            }
            Ok(None) => {
                if !entry.paused.load(Ordering::Acquire) {
                    request_pass(root.clone(), entry.clone());
                }
                Vec::new()
            }
            Err(error) if error.is_damage() => {
                *lock(&entry.searcher) = None;
                if vault_index::set_aside_damaged(&root).is_ok() {
                    request_pass(root.clone(), entry.clone());
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
    let entries = all_entries();
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
    vault_index::delete(None).map_err(|error| error.to_string())
}

/// Settings' Delete: every vault's index, at once. Each stays deleted until its folder is opened
/// again.
#[tauri::command]
pub(crate) async fn vault_index_clear(
    root_path: Option<String>,
    enabled: bool,
) -> Result<VaultIndexStatus, String> {
    run_blocking(move || {
        let root = root_path.as_deref().map(granted_root).transpose()?;
        delete_every_index()?;
        Ok(status_of(root.as_deref(), enabled))
    })
    .await
}
