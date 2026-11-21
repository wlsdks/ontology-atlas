//! Offers the files a person picks in the native dialog.

use std::fs;
use std::path::PathBuf;

use super::source_offer::{remember_source_offer, SourceOffer};

/// A picked file lands flat, under its own name.
pub(super) fn remember_source_path(offer_key: String, canonical: PathBuf) {
    let relative = canonical
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    if let Some(offer) = SourceOffer::of_file(canonical, relative) {
        remember_source_offer(offer_key, offer);
    }
}

/// Not `async`: `NSOpenPanel` must run on the macOS main thread.
#[tauri::command]
pub fn pick_source_files(dialog_title: Option<String>) -> Result<Vec<String>, String> {
    let title = dialog_title.as_deref().unwrap_or("Add documents");
    let Some(picked) = rfd::FileDialog::new().set_title(title).pick_files() else {
        return Ok(Vec::new());
    };
    let offer_keys: Vec<String> = picked
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect();
    for (path, offer_key) in picked.iter().zip(offer_keys.iter()) {
        if let Ok(canonical) = fs::canonicalize(path) {
            remember_source_path(offer_key.clone(), canonical);
        }
    }
    Ok(offer_keys)
}
