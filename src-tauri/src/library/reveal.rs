//! Selects a vault file or the `sources/` folder in the system file manager without opening it.

use std::fs;
use std::path::Path;

use crate::{canonical_root, resolve_existing_inside};

use super::import_destination::{refuse_linked_folder, SOURCES_DIR};

/// Creates `sources/` when missing and selects it in the file manager; a linked
/// `sources/` is refused, as an import into it would be.
#[tauri::command]
pub async fn reveal_sources_folder(root_path: String) -> Result<(), String> {
    crate::blocking::run_blocking(move || reveal_sources_folder_blocking(&root_path)).await
}

pub(crate) fn reveal_sources_folder_blocking(root_path: &str) -> Result<(), String> {
    let target = canonical_root(root_path)?.join(SOURCES_DIR);
    refuse_linked_folder(&target)?;
    fs::create_dir_all(&target).map_err(|err| err.to_string())?;
    reveal_path(&target)
}

#[cfg(target_os = "macos")]
fn reveal_path(path: &Path) -> Result<(), String> {
    let status = std::process::Command::new("open")
        .arg("-R")
        .arg(path)
        .status()
        .map_err(|err| err.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("open exited with status {status}"))
    }
}

#[cfg(not(target_os = "macos"))]
fn reveal_path(path: &Path) -> Result<(), String> {
    crate::app_shell::reveal_in_file_manager(path)
}

/// Reveal, not open: the app never launches a program on the person's behalf.
#[tauri::command]
pub async fn reveal_vault_file(root_path: String, relative_path: String) -> Result<(), String> {
    crate::blocking::run_blocking(move || reveal_vault_file_blocking(root_path, relative_path))
        .await
}

pub(crate) fn reveal_vault_file_blocking(
    root_path: String,
    relative_path: String,
) -> Result<(), String> {
    let path = resolve_existing_inside(&root_path, &relative_path)?;
    if !path.is_file() {
        return Err("reveal target must be a file".into());
    }
    reveal_path(&path)
}

#[cfg(test)]
mod tests;
