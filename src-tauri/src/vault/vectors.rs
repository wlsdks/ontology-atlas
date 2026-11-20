//! The app's door to search by meaning (`vault_index::vectors`): one background job per folder,
//! one job using a model at a time in the whole app, and a search that never creates a store. The
//! WebView holds the person's choice of source and sends it with every command; the vectors on
//! disk are derived and rebuildable, and code names them by what they are.

pub(crate) mod commands;
mod job;
mod memory;
mod models;
mod report;
mod search;
mod types;

#[cfg(test)]
mod tests;

use job::{Entry, Turn};
use memory::Keeper;
use models::{AppSources, Sources};
use report::{Clock, MonotonicClock};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
use types::{StatusEvent, VectorStatus};

/// Sent on every phase change and, while a job runs, between four times a second and once every
/// two seconds.
const STATUS_EVENT: &str = "vault-vectors-status";

/// Where status events go: the WebView in the app, a list in tests.
pub(crate) trait Emit: Send + Sync {
    fn emit(&self, root_path: &str, status: &VectorStatus);
}

/// Every window hears every folder's events; each keeps the ones for the folder it shows.
#[derive(Default)]
struct AppEmitter {
    app: OnceLock<AppHandle>,
}

impl Emit for AppEmitter {
    fn emit(&self, root_path: &str, status: &VectorStatus) {
        if let Some(app) = self.app.get() {
            let _ = app.emit(STATUS_EVENT, StatusEvent { root_path, status });
        }
    }
}

/// Every folder's job, the one model turn, and the built-in model's release rule.
pub(crate) struct Vectors {
    sources: Arc<dyn Sources>,
    clock: Arc<dyn Clock>,
    emit: Arc<dyn Emit>,
    entries: Mutex<HashMap<PathBuf, Arc<Entry>>>,
    turn: Turn,
    keeper: Mutex<Keeper>,
    /// Starts the progress ticker and the release timer; tests drive both by hand.
    background: bool,
    housekeeping: OnceLock<()>,
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl Vectors {
    pub(crate) fn new(
        sources: Arc<dyn Sources>,
        clock: Arc<dyn Clock>,
        emit: Arc<dyn Emit>,
        background: bool,
    ) -> Self {
        Self {
            sources,
            clock,
            emit,
            entries: Mutex::default(),
            turn: Turn::default(),
            keeper: Mutex::default(),
            background,
            housekeeping: OnceLock::new(),
        }
    }

    /// The folder's entry. `shown_as` is the path the WebView used for it; `vault-index-updated`
    /// names no folder, so the first spelling a folder was opened with keys its events for the
    /// life of the app, whatever spelling a later command uses.
    fn entry(&self, root: &Path, shown_as: &str) -> Arc<Entry> {
        lock(&self.entries)
            .entry(root.to_path_buf())
            .or_insert_with(|| Arc::new(Entry::new(root, shown_as)))
            .clone()
    }

    fn known_entry(&self, root: &Path) -> Option<Arc<Entry>> {
        lock(&self.entries).get(root).cloned()
    }

    fn all_entries(&self) -> Vec<Arc<Entry>> {
        lock(&self.entries).values().cloned().collect()
    }

    /// Releases the built-in model, drops idle search copies and starts the quiet updates whose
    /// wait ended.
    pub(crate) fn tick(self: &Arc<Self>) {
        self.release_due();
        self.start_due_updates(self.clock.now());
    }

    /// Releases the built-in model and drops idle search copies when their time came.
    fn release_due(&self) {
        let now = self.clock.now();
        if lock(&self.keeper).due(now) {
            if let Some(builtin) = self.sources.builtin_if_made() {
                builtin.release();
            }
        }
        for entry in self.all_entries() {
            entry.drop_idle_searcher(now);
        }
    }

    /// One thread for the whole app wakes every few seconds to run `tick`.
    fn start_housekeeping(self: &Arc<Self>) {
        if !self.background || self.housekeeping.set(()).is_err() {
            return;
        }
        let vectors = Arc::downgrade(self);
        let spawned = std::thread::Builder::new()
            .name("vault-vectors-housekeeping".into())
            .spawn(move || loop {
                std::thread::park_timeout(std::time::Duration::from_secs(5));
                match vectors.upgrade() {
                    Some(vectors) => vectors.tick(),
                    None => return,
                }
            });
        if let Err(error) = spawned {
            log::warn!("search by meaning housekeeping did not start: {error}");
        }
    }
}

fn app_emitter() -> &'static Arc<AppEmitter> {
    static EMITTER: OnceLock<Arc<AppEmitter>> = OnceLock::new();
    EMITTER.get_or_init(Arc::default)
}

/// The app's one instance.
fn app() -> &'static Arc<Vectors> {
    static APP: OnceLock<Arc<Vectors>> = OnceLock::new();
    APP.get_or_init(|| {
        Arc::new(Vectors::new(
            Arc::new(AppSources::default()),
            Arc::new(MonotonicClock::new()),
            app_emitter().clone(),
            true,
        ))
    })
}

/// Lets events reach the WebView; every command passes its handle.
fn bind(app_handle: &AppHandle) {
    let _ = app_emitter().app.set(app_handle.clone());
}

/// After a search index pass that changed files: a folder whose vectors exist prepares the changed
/// passages quietly once its index passes go quiet (`job::UPDATE_QUIET`, `job::UPDATE_LATEST`).
/// Nothing happens for a folder nobody armed in this launch, for a held one, nor for one whose
/// store is gone, so no folder gets vectors it was not given.
pub(crate) fn after_index_pass(root: &Path) {
    let vectors = app();
    if let Some(entry) = vectors.known_entry(root) {
        vectors.note_change(&entry);
    }
}

/// Runs `delete` (the search index's own Delete or switch-off) with every matching job stopped and
/// held out of its next store write, so nothing is written after it; `None` means every folder.
pub(crate) fn with_jobs_stopped<T>(root: Option<&Path>, delete: impl FnOnce() -> T) -> T {
    app().forget(root, delete)
}

/// How long quitting waits for the jobs to end once they were told to stop.
const EXIT_WAIT: std::time::Duration = std::time::Duration::from_secs(2);

/// The app is quitting: every job is told to stop, and quitting waits up to `EXIT_WAIT` for them
/// to end. A runner job that ends in time writes its closing audit line; one still in a step that
/// outlasts the wait does not, and its log keeps a start line with no close (the built-in model
/// writes no line at all). The app quits either way.
pub(crate) fn stop_all_on_exit() {
    if !app().stop_all(EXIT_WAIT) {
        log::warn!("search by meaning job still running at quit");
    }
}
