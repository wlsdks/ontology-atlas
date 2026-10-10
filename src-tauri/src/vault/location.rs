use super::scope::{canonical_root, vault_root_rejection};
#[cfg(target_os = "macos")]
use crate::app_shell::reveal_in_finder_command;
use crate::vault_grants;
use std::fs;
use std::path::PathBuf;

/// Not `async`: `NSOpenPanel` must run on the macOS main thread with its own modal
/// loop, so moving it to a worker would break it.
#[tauri::command]
pub(crate) fn pick_vault_directory(dialog_title: Option<String>) -> Result<Option<String>, String> {
    let title = dialog_title.as_deref().unwrap_or("Open ontology vault");
    let Some(picked) = rfd::FileDialog::new().set_title(title).pick_folder() else {
        return Ok(None);
    };
    // Judge the real location after symlinks (`/tmp` vs `/private/tmp`); fall back to
    // the picked path when canonicalize fails.
    let resolved = fs::canonicalize(&picked).unwrap_or_else(|_| picked.clone());
    if let Some(reason) = vault_root_rejection(&resolved) {
        // A stable code, so translation stays on the screen.
        return Err(format!("vault-root-rejected:{reason}"));
    }
    // The native picker is a genuine user choice, so this is where a vault becomes a
    // granted root; the redirect into `<project>/atlas` stays inside it.
    vault_grants::grant_vault_root(&resolved);
    Ok(Some(picked.to_string_lossy().to_string()))
}

#[tauri::command]
pub(crate) fn open_vault_in_finder(root_path: String) -> Result<(), String> {
    // Only reveal a folder the user granted; an XSS must not open Finder anywhere.
    let root = canonical_root(&root_path)?;
    // A `.app` passes `is_dir()` and `open` would launch it; the same gate as the vault
    // root, so the looser copy cannot win.
    if let Some(reason) = vault_root_rejection(&root) {
        return Err(format!("refusing to open this path: {reason}"));
    }

    #[cfg(target_os = "macos")]
    {
        // `-a Finder` also stops a bundle launching; both guards stay in case one comes loose.
        let status = reveal_in_finder_command(&root)
            .status()
            .map_err(|err| err.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("open exited with status {status}"))
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = root;
        Err("Finder reveal is only available on macOS".into())
    }
}

/// The "just start" container under `$HOME`, not Documents, which TCC protects with a
/// permission dialog. Pure for testing. Project vaults go to `<project>/atlas`
/// (`src/shared/lib/project-vault-dir.ts`).
pub(crate) fn default_vault_parent_dir(home: &str) -> PathBuf {
    PathBuf::from(home).join("Ontology Atlas")
}

#[tauri::command]
pub(crate) fn ensure_default_vault_parent_dir() -> Result<String, String> {
    let home =
        std::env::var("HOME").map_err(|_| "HOME environment variable is not set".to_string())?;
    let parent = default_vault_parent_dir(&home);
    fs::create_dir_all(&parent).map_err(|err| err.to_string())?;
    let canonical = fs::canonicalize(&parent).map_err(|err| err.to_string())?;
    // The app's own "just start" container: creating a vault under it is a granted
    // operation, so the create/list/write commands that follow are allowed.
    vault_grants::grant_vault_root(&canonical);
    Ok(canonical.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_vault_in_finder_rejects_non_directory_root() {
        let error = open_vault_in_finder("/path/that/does/not/exist".into()).unwrap_err();
        assert!(!error.is_empty());
    }

    /// The container stays outside TCC-protected folders.
    #[test]
    fn just_start_container_sits_outside_the_protected_folders() {
        assert_eq!(
            default_vault_parent_dir("/Users/me"),
            PathBuf::from("/Users/me/Ontology Atlas")
        );
        let path = default_vault_parent_dir("/Users/me");
        for protected in ["Documents", "Desktop", "Downloads"] {
            assert!(
                !path.iter().any(|part| part == protected),
                "just start would open a TCC prompt before the person has anything to consent about"
            );
        }
    }
}
