//! Files and folders a person drops on the window. Rust takes the paths from the native
//! window event and offers them as the picker does; the page never names a path. A dropped
//! folder is walked here alone, under the discovery rules, and keeps its structure.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

use super::discovery_rules::{
    discovery_accepts_directory, discovery_skip_reason, SkipReason, DISCOVERY_MAX_DEPTH,
    DISCOVERY_MIN_FILE_BYTES,
};
use super::source_offer::{forget_source_offers, remember_source_offer, SourceOffer};

/// The page listens on this name; the Library stage is the only listener.
pub(crate) const SOURCE_DROP_EVENT: &str = "source-drop";

/// A folder drop lists at most this many files; past it the offer says it stopped.
const DROP_MAX_FILES: usize = 20_000;
/// A folder walk visits at most this many entries, so a dropped home folder still ends.
const DROP_MAX_VISITED: usize = 200_000;
/// The skipped list names at most this many files; its counts cover every one.
const DROP_SKIPPED_NAMES: usize = 1_000;

/// Set while the Library's drop area is on screen, so a drop elsewhere walks nothing.
static ARMED: AtomicBool = AtomicBool::new(false);
/// Numbers each armed drop; only the newest may remember offers or reach the page.
static LATEST_DROP: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
pub fn arm_source_drop(armed: bool) {
    ARMED.store(armed, Ordering::Relaxed);
}

/// A page that loads anew has no drop area on screen until it arms one again.
pub(crate) fn disarm_source_drop() {
    ARMED.store(false, Ordering::Relaxed);
}

pub(crate) fn drop_armed() -> bool {
    ARMED.load(Ordering::Relaxed)
}

/// The number of a drop about to be walked, or `None` while the drop area is off screen.
pub(crate) fn begin_armed_drop() -> Option<u64> {
    drop_armed().then(|| LATEST_DROP.fetch_add(1, Ordering::SeqCst) + 1)
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DroppedFile {
    /// The string the page sends back to import this file.
    pub path: String,
    /// Where the copy lands under `sources/`, `/`-joined on every platform.
    pub relative_path: String,
    pub size: u64,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedFile {
    pub relative_path: String,
    pub reason: SkipReason,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedCounts {
    pub secret_name: usize,
    pub licence: usize,
    pub not_document: usize,
}

#[derive(Clone, Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DropOffer {
    pub files: Vec<DroppedFile>,
    /// The first `DROP_SKIPPED_NAMES` skipped files; `skipped_counts` counts them all.
    pub skipped: Vec<SkippedFile>,
    pub skipped_counts: SkippedCounts,
    pub total_bytes: u64,
    /// The folder walk stopped at `DROP_MAX_FILES` files or `DROP_MAX_VISITED` entries.
    pub truncated: bool,
    /// Dropped folders refused whole because they are, or hold, an open folder.
    pub holds_open_folder: Vec<String>,
}

#[derive(Clone, serde::Serialize)]
#[serde(tag = "phase", rename_all = "camelCase")]
pub enum SourceDropEvent {
    Over,
    Leave,
    Reading,
    Offered { offer: DropOffer },
}

fn last_drop_keys() -> &'static Mutex<Vec<String>> {
    static LAST: OnceLock<Mutex<Vec<String>>> = OnceLock::new();
    LAST.get_or_init(|| Mutex::new(Vec::new()))
}

/// Walks what drop number `drop` carried, then, only if no later drop has begun, withdraws the
/// previous drop's offers, remembers these and hands the offer to `publish`, all under one lock:
/// an older walk that ends last can neither replace a newer drop's offers nor reach the page
/// after it.
pub(crate) fn offer_drop<R>(
    drop: u64,
    paths: &[PathBuf],
    publish: impl FnOnce(DropOffer) -> R,
) -> Option<R> {
    let walk = walk_drop(paths);
    let mut last = last_drop_keys()
        .lock()
        .unwrap_or_else(|err| err.into_inner());
    if LATEST_DROP.load(Ordering::SeqCst) != drop {
        return None;
    }
    let keys: Vec<String> = walk.offers.iter().map(|(key, _)| key.clone()).collect();
    forget_source_offers(&std::mem::replace(&mut *last, keys));
    for (key, source_offer) in walk.offers {
        remember_source_offer(key, source_offer);
    }
    Some(publish(walk.offer))
}

/// One drop, numbered as the newest, for tests that do not go through the window event.
#[cfg(test)]
pub(crate) fn offer_dropped_paths(paths: &[PathBuf]) -> DropOffer {
    let drop = LATEST_DROP.fetch_add(1, Ordering::SeqCst) + 1;
    offer_drop(drop, paths, |offer| offer).unwrap_or_default()
}

#[derive(Default)]
struct DropWalk {
    offer: DropOffer,
    offers: Vec<(String, SourceOffer)>,
    visited: usize,
}

impl DropWalk {
    fn skip(&mut self, relative_path: String, reason: SkipReason) {
        let counts = &mut self.offer.skipped_counts;
        match reason {
            SkipReason::SecretName => counts.secret_name += 1,
            SkipReason::Licence => counts.licence += 1,
            SkipReason::NotDocument => counts.not_document += 1,
        }
        if self.offer.skipped.len() < DROP_SKIPPED_NAMES {
            self.offer.skipped.push(SkippedFile {
                relative_path,
                reason,
            });
        }
    }

    fn offer_file(&mut self, path: &Path, canonical: PathBuf, relative: String) {
        let Some(source_offer) = SourceOffer::of_file(canonical, relative.clone()) else {
            self.skip(relative, SkipReason::NotDocument);
            return;
        };
        let key = path.to_string_lossy().into_owned();
        let size = source_offer.length();
        self.offer.total_bytes += size;
        self.offer.files.push(DroppedFile {
            path: key.clone(),
            relative_path: relative,
            size,
        });
        self.offers.push((key, source_offer));
    }
}

/// A dropped file is offered whatever its format, since dropping it is the person's choice,
/// unless its name reads as a secret: `sources/` is read by agents and may be pushed.
fn walk_drop(paths: &[PathBuf]) -> DropWalk {
    let mut walk = DropWalk::default();
    for path in paths {
        let Some(name) = path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
        else {
            continue;
        };
        match fs::symlink_metadata(path) {
            Ok(metadata) if metadata.is_dir() => walk_dropped_folder(path, &name, &mut walk),
            Ok(metadata) if metadata.file_type().is_symlink() && path.is_dir() => {
                walk.skip(name, SkipReason::NotDocument);
            }
            Ok(_) if discovery_skip_reason(&name) == Some(SkipReason::SecretName) => {
                walk.skip(name, SkipReason::SecretName);
            }
            Ok(_) => match fs::canonicalize(path) {
                Ok(canonical) => walk.offer_file(path, canonical, name),
                Err(_) => walk.skip(name, SkipReason::NotDocument),
            },
            Err(_) => walk.skip(name, SkipReason::NotDocument),
        }
    }
    walk
}

fn walk_dropped_folder(root: &Path, name: &str, walk: &mut DropWalk) {
    let Ok(canonical) = fs::canonicalize(root) else {
        walk.skip(name.to_string(), SkipReason::NotDocument);
        return;
    };
    if crate::vault_grants::holds_a_vault_root(&canonical) {
        walk.offer.holds_open_folder.push(name.to_string());
        return;
    }
    walk_folder(&canonical, name, "", 0, walk);
}

/// `within` is the path below the dropped folder, which the folder rules judge; the copy
/// lands at `<dropped folder name>/<within>`. Links are never followed.
fn walk_folder(
    directory: &Path,
    dropped_name: &str,
    within: &str,
    depth: usize,
    walk: &mut DropWalk,
) {
    if depth > DISCOVERY_MAX_DEPTH || walk.offer.truncated {
        return;
    }
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        walk.visited += 1;
        if walk.visited > DROP_MAX_VISITED {
            walk.offer.truncated = true;
            return;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let below = if within.is_empty() {
            name.clone()
        } else {
            format!("{within}/{name}")
        };
        let landing = format!("{dropped_name}/{below}");
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            if discovery_accepts_directory(&below) {
                walk_folder(&entry.path(), dropped_name, &below, depth + 1, walk);
                if walk.offer.truncated {
                    return;
                }
            }
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        // A dot file is system furniture (`.DS_Store`) unless its name reads as a secret.
        let reason = discovery_skip_reason(&name);
        if name.starts_with('.') {
            if reason == Some(SkipReason::SecretName) {
                walk.skip(landing, SkipReason::SecretName);
            }
            continue;
        }
        if let Some(reason) = reason {
            walk.skip(landing, reason);
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if metadata.len() < DISCOVERY_MIN_FILE_BYTES {
            walk.skip(landing, SkipReason::NotDocument);
            continue;
        }
        if walk.offer.files.len() >= DROP_MAX_FILES {
            walk.offer.truncated = true;
            return;
        }
        let path = entry.path();
        walk.offer_file(&path, path.clone(), landing);
    }
}

#[cfg(test)]
mod tests;
