//! Writes one imported file into the vault under the first free name, never replacing a file
//! and never leaving the destination folder.

#[cfg(not(unix))]
use std::fs;

#[cfg(unix)]
use crate::canonical_root;

use super::file_hashing::copy_hashing;

/// Writes the copy under the first of `names` still free in `folder_relative`, never replacing
/// a file: `(sha256, length, name used)`, or `None` when every name was taken.
#[cfg(unix)]
pub(super) fn copy_source_into(
    root_path: &str,
    folder_relative: &str,
    names: impl Iterator<Item = String>,
    source: &mut impl std::io::Read,
) -> Result<Option<(String, u64, String)>, String> {
    let root = canonical_root(root_path)?;
    let root_handle = crate::confined_files::open_absolute_directory_no_follow(&root)?;
    let (parent, _) =
        crate::confined_files::open_entry_parent(&root_handle, &format!("{folder_relative}/name"))
            .map_err(|_| "import-destination-not-a-folder".to_string())?;
    let names = names.filter_map(|name| std::ffi::CString::new(name).ok());
    let published =
        crate::confined_files::create_first_free_entry_with(&parent, names, 0o666, |file| {
            copy_hashing(source, file)
        })
        .map_err(|_| "import-destination-unwritable".to_string())?;
    Ok(published.map(|((hash, length), name)| (hash, length, name.to_string_lossy().into_owned())))
}

/// Windows lacks `openat`/`O_NOFOLLOW`, so `resolve_write_target_inside` checks the
/// path instead, the same rule `write_vault_text_file` uses, or bytes could escape.
/// `create_new` never replaces; a copy that fails removes only the file it created.
#[cfg(not(unix))]
pub(super) fn copy_source_into(
    root_path: &str,
    folder_relative: &str,
    names: impl Iterator<Item = String>,
    source: &mut impl std::io::Read,
) -> Result<Option<(String, u64, String)>, String> {
    for name in names {
        let target =
            crate::resolve_write_target_inside(root_path, &format!("{folder_relative}/{name}"))?;
        let mut file = match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
        {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("import-destination-unwritable".into()),
        };
        return match copy_hashing(source, &mut file) {
            Ok((hash, length)) => Ok(Some((hash, length, name))),
            Err(_) => {
                drop(file);
                let _ = fs::remove_file(&target);
                Err("import-destination-unwritable".into())
            }
        };
    }
    Ok(None)
}

#[cfg(test)]
mod tests;
