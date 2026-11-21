//! Files and folders a person drops on the window. Rust takes the paths from the native
//! window event and offers them as the picker does; the page never names a path. A dropped
//! folder is walked here alone, under the discovery rules, and keeps its structure.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

use super::{
    discovery_accepts_directory, discovery_skip_reason, forget_source_offers,
    remember_source_offer, SkipReason, SourceOffer, DISCOVERY_MAX_DEPTH, DISCOVERY_MIN_FILE_BYTES,
};

/// The page listens on this name; the Library stage is the only listener.
pub(crate) const SOURCE_DROP_EVENT: &str = "source-drop";

/// A folder drop lists at most this many files; past it the offer says it stopped.
const DROP_MAX_FILES: usize = 20_000;

/// Set while the Library's drop area is on screen, so a drop elsewhere walks nothing.
static ARMED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn arm_source_drop(armed: bool) {
    ARMED.store(armed, Ordering::Relaxed);
}

pub(crate) fn drop_armed() -> bool {
    ARMED.load(Ordering::Relaxed)
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

#[derive(Clone, Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DropOffer {
    pub files: Vec<DroppedFile>,
    pub skipped: Vec<SkippedFile>,
    pub total_bytes: u64,
    /// The folder walk stopped at `DROP_MAX_FILES`.
    pub truncated: bool,
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

/// Offers what was dropped and withdraws the previous drop's offers, so drops never pile up.
/// A dropped file is offered whatever its format: dropping it is the person's choice.
pub(crate) fn offer_dropped_paths(paths: &[PathBuf]) -> DropOffer {
    let mut offer = DropOffer::default();
    let mut offers: Vec<(String, SourceOffer)> = Vec::new();
    for path in paths {
        let Some(name) = path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
        else {
            continue;
        };
        match fs::symlink_metadata(path) {
            Ok(metadata) if metadata.is_dir() => {
                walk_dropped_folder(path, &name, &mut offer, &mut offers);
            }
            Ok(metadata) if metadata.file_type().is_symlink() && path.is_dir() => {
                offer.skipped.push(SkippedFile {
                    relative_path: name,
                    reason: SkipReason::NotDocument,
                });
            }
            _ => {
                let canonical = fs::canonicalize(path).unwrap_or_else(|_| path.clone());
                let size = fs::metadata(&canonical).map(|meta| meta.len()).unwrap_or(0);
                push_offer(path, canonical, name, size, &mut offer, &mut offers);
            }
        }
    }
    let keys: Vec<String> = offers.iter().map(|(key, _)| key.clone()).collect();
    let previous = std::mem::replace(
        &mut *last_drop_keys()
            .lock()
            .unwrap_or_else(|err| err.into_inner()),
        keys,
    );
    forget_source_offers(&previous);
    for (key, source_offer) in offers {
        remember_source_offer(key, source_offer);
    }
    offer
}

fn push_offer(
    path: &Path,
    canonical: PathBuf,
    relative: String,
    size: u64,
    offer: &mut DropOffer,
    offers: &mut Vec<(String, SourceOffer)>,
) {
    let key = path.to_string_lossy().into_owned();
    offer.total_bytes += size;
    offer.files.push(DroppedFile {
        path: key.clone(),
        relative_path: relative.clone(),
        size,
    });
    offers.push((
        key,
        SourceOffer {
            canonical,
            relative,
        },
    ));
}

fn walk_dropped_folder(
    root: &Path,
    name: &str,
    offer: &mut DropOffer,
    offers: &mut Vec<(String, SourceOffer)>,
) {
    let Ok(canonical) = fs::canonicalize(root) else {
        offer.skipped.push(SkippedFile {
            relative_path: name.to_string(),
            reason: SkipReason::NotDocument,
        });
        return;
    };
    walk(&canonical, name, "", 0, offer, offers);
}

/// `within` is the path below the dropped folder, which the folder rules judge; the copy
/// lands at `<dropped folder name>/<within>`. Links are never followed.
fn walk(
    dir: &Path,
    dropped_name: &str,
    within: &str,
    depth: usize,
    offer: &mut DropOffer,
    offers: &mut Vec<(String, SourceOffer)>,
) {
    if depth > DISCOVERY_MAX_DEPTH || offer.truncated {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
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
                walk(
                    &entry.path(),
                    dropped_name,
                    &below,
                    depth + 1,
                    offer,
                    offers,
                );
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
                offer.skipped.push(SkippedFile {
                    relative_path: landing,
                    reason: SkipReason::SecretName,
                });
            }
            continue;
        }
        if let Some(reason) = reason {
            offer.skipped.push(SkippedFile {
                relative_path: landing,
                reason,
            });
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if metadata.len() < DISCOVERY_MIN_FILE_BYTES {
            offer.skipped.push(SkippedFile {
                relative_path: landing,
                reason: SkipReason::NotDocument,
            });
            continue;
        }
        if offer.files.len() >= DROP_MAX_FILES {
            offer.truncated = true;
            return;
        }
        let path = entry.path();
        push_offer(&path, path.clone(), landing, metadata.len(), offer, offers);
    }
}
