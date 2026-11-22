//! Tracks the imports in flight: each one's stop flag, and the one-copy-per-folder claim.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

pub(super) fn running_imports() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static RUNNING: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    RUNNING.get_or_init(|| Mutex::new(HashMap::new()))
}

/// One copy into a folder at a time: two copies would race for the same free names.
pub(super) struct ImportingFolder(PathBuf);

impl ImportingFolder {
    /// The lock is released before a claim is built, since a refused claim's drop takes it again.
    pub(super) fn claim(root: PathBuf) -> Option<Self> {
        let claimed = importing_folders()
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .insert(root.clone());
        claimed.then(|| Self(root))
    }
}

impl Drop for ImportingFolder {
    fn drop(&mut self) {
        importing_folders()
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .remove(&self.0);
    }
}

fn importing_folders() -> &'static Mutex<std::collections::HashSet<PathBuf>> {
    static IMPORTING: OnceLock<Mutex<std::collections::HashSet<PathBuf>>> = OnceLock::new();
    IMPORTING.get_or_init(|| Mutex::new(std::collections::HashSet::new()))
}

/// Stops the named import after the file it is copying; what landed stays.
#[tauri::command]
pub fn stop_source_import(import_id: String) -> bool {
    let running = running_imports()
        .lock()
        .unwrap_or_else(|err| err.into_inner());
    match running.get(&import_id) {
        Some(stop) => {
            stop.store(true, Ordering::Relaxed);
            true
        }
        None => false,
    }
}

#[cfg(test)]
mod tests;
