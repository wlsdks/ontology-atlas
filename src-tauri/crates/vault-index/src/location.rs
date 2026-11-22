//! Where a vault's index lives: one folder per canonical vault path, under the OS cache directory,
//! outside the vault and Git, never synced, and purgeable by the OS.

use sha2::{Digest, Sha256};
use std::io;
use std::path::{Path, PathBuf};

const APP_IDENTIFIER: &str = "dev.jinan.ontology-atlas";
const INDEXES_FOLDER: &str = "vault-index";
/// Replaces `<OS cache dir>/dev.jinan.ontology-atlas/vault-index` in debug builds (tests) and with
/// the `index-dir-override` feature (the benchmark). A release app ignores it, so no environment
/// can point its Delete at another folder.
pub const INDEX_DIR_OVERRIDE_ENV: &str = "OATLAS_INDEX_DIR";
pub(crate) const VAULT_KEY_HEX_CHARS: usize = 16;

pub const fn index_dir_override_honoured() -> bool {
    cfg!(any(debug_assertions, feature = "index-dir-override"))
}

pub fn indexes_root() -> io::Result<PathBuf> {
    if index_dir_override_honoured() {
        if let Some(dir) = std::env::var_os(INDEX_DIR_OVERRIDE_ENV).filter(|dir| !dir.is_empty()) {
            return Ok(PathBuf::from(dir));
        }
    }
    Ok(os_cache_dir()?.join(APP_IDENTIFIER).join(INDEXES_FOLDER))
}

#[cfg(target_os = "macos")]
fn os_cache_dir() -> io::Result<PathBuf> {
    home_dir().map(|home| home.join("Library").join("Caches"))
}

#[cfg(windows)]
fn os_cache_dir() -> io::Result<PathBuf> {
    absolute_env("LOCALAPPDATA").ok_or_else(|| missing("LOCALAPPDATA"))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn os_cache_dir() -> io::Result<PathBuf> {
    match absolute_env("XDG_CACHE_HOME") {
        Some(dir) => Ok(dir),
        None => home_dir().map(|home| home.join(".cache")),
    }
}

#[cfg(unix)]
fn home_dir() -> io::Result<PathBuf> {
    absolute_env("HOME").ok_or_else(|| missing("HOME"))
}

fn absolute_env(name: &str) -> Option<PathBuf> {
    std::env::var_os(name)
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
}

fn missing(name: &str) -> io::Error {
    io::Error::new(
        io::ErrorKind::NotFound,
        format!("{name} is not an absolute path"),
    )
}

/// The resolved path used for file access; on Windows it keeps the `\\?\` form, which lifts the
/// 260-character limit.
pub fn canonical_vault_root(path: &Path) -> io::Result<PathBuf> {
    std::fs::canonicalize(path)
}

/// One folder has one key however it was typed: Windows drops the verbatim prefix and case, since
/// its file names are case-insensitive.
pub fn vault_key(canonical_root: &Path) -> String {
    let digest = Sha256::digest(key_text(canonical_root).as_bytes());
    digest
        .iter()
        .take(VAULT_KEY_HEX_CHARS / 2)
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(windows)]
fn key_text(canonical_root: &Path) -> String {
    let text = canonical_root.to_string_lossy();
    let plain = match text.strip_prefix(r"\\?\UNC\") {
        Some(share) => format!(r"\\{share}"),
        None => text.strip_prefix(r"\\?\").unwrap_or(&text).to_string(),
    };
    plain.trim_end_matches('\\').to_lowercase()
}

#[cfg(not(windows))]
fn key_text(canonical_root: &Path) -> String {
    canonical_root.to_string_lossy().into_owned()
}

pub fn index_dir(canonical_root: &Path) -> io::Result<PathBuf> {
    Ok(indexes_root()?.join(vault_key(canonical_root)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_key_is_sixteen_hex_characters_and_stable() {
        let key = vault_key(Path::new("/Users/someone/vault"));
        assert_eq!(key.len(), VAULT_KEY_HEX_CHARS);
        assert!(key.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(key, vault_key(Path::new("/Users/someone/vault")));
        assert_ne!(key, vault_key(Path::new("/Users/someone/vault2")));
    }

    #[cfg(windows)]
    #[test]
    fn windows_spellings_of_one_folder_share_a_key() {
        let key = vault_key(Path::new(r"\\?\C:\Users\Someone\Vault"));
        assert_eq!(key, vault_key(Path::new(r"c:\users\someone\vault")));
        assert_eq!(key, vault_key(Path::new(r"C:\Users\Someone\Vault\")));
        assert_eq!(
            vault_key(Path::new(r"\\?\UNC\server\share\vault")),
            vault_key(Path::new(r"\\server\share\vault"))
        );
    }
}
