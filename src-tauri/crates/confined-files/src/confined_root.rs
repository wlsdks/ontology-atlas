//! The vault or source root a file operation is confined to, and the one type that opens, reads and
//! writes under it. This first piece names a root and checks that it is a folder; the reading and
//! writing methods arrive with the safety family.

use std::path::{Component, Path, PathBuf};

/// Why a folder cannot be a vault root. The text is what the server prints, word for word.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VaultRootError {
    NotFound(PathBuf),
    NotADirectory(PathBuf),
}

impl std::fmt::Display for VaultRootError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound(path) => write!(formatter, "Vault root not found: {}", path.display()),
            Self::NotADirectory(path) => {
                write!(
                    formatter,
                    "Vault root is not a directory: {}",
                    path.display()
                )
            }
        }
    }
}

impl std::error::Error for VaultRootError {}

/// Requires an existing directory; a folder with no frontmatter is an empty vault. A symbolic
/// link is followed, as a person who linked their vault folder expects.
pub fn ensure_vault_root(root: &Path) -> Result<(), VaultRootError> {
    match std::fs::metadata(root) {
        Ok(metadata) if metadata.is_dir() => Ok(()),
        Ok(_) => Err(VaultRootError::NotADirectory(root.to_path_buf())),
        Err(_) => Err(VaultRootError::NotFound(root.to_path_buf())),
    }
}

/// `path` made absolute against `base` and normalised lexically: `.` and empty parts dropped,
/// `..` folded into its parent, no trailing separator. Nothing is read from the disk, so a symbolic
/// link is not resolved.
pub fn resolve_path(base: &Path, path: &Path) -> PathBuf {
    let joined = if path.is_absolute() {
        path.to_path_buf()
    } else {
        base.join(path)
    };
    let mut resolved = PathBuf::new();
    for component in joined.components() {
        match component {
            Component::Prefix(_) | Component::RootDir => resolved.push(component.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => {
                let at_root = matches!(
                    resolved.components().next_back(),
                    Some(Component::RootDir | Component::Prefix(_)) | None
                );
                if !at_root {
                    resolved.pop();
                }
            }
            Component::Normal(part) => resolved.push(part),
        }
    }
    resolved
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn a_relative_path_is_joined_to_the_base_and_folded() {
        let base = Path::new("/work/repo");
        assert_eq!(
            resolve_path(base, Path::new("samples/./store/../storefront/")),
            Path::new("/work/repo/samples/storefront")
        );
    }

    #[test]
    fn an_absolute_path_ignores_the_base_and_cannot_climb_above_the_root() {
        assert_eq!(
            resolve_path(Path::new("/work"), Path::new("/a/b/../../../..")),
            Path::new("/")
        );
        assert_eq!(
            resolve_path(Path::new("/work"), Path::new("/vault///notes/")),
            Path::new("/vault/notes")
        );
    }

    #[test]
    fn a_missing_folder_and_a_file_are_named_in_the_servers_own_words() {
        let missing = ensure_vault_root(Path::new("/definitely/not/here")).expect_err("missing");
        assert_eq!(
            missing.to_string(),
            "Vault root not found: /definitely/not/here"
        );
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
        let file = ensure_vault_root(&manifest).expect_err("a file");
        assert_eq!(
            file.to_string(),
            format!("Vault root is not a directory: {}", manifest.display())
        );
        assert!(ensure_vault_root(Path::new(env!("CARGO_MANIFEST_DIR"))).is_ok());
    }
}
