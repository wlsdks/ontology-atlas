//! The vault or source root a file operation is confined to. This first piece names a root and
//! checks that it is a folder, and resolves a path against it as Node does; the reading and writing
//! methods arrive with the safety family.

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

/// `path` made absolute against `base` and normalised lexically as Node's `path.resolve` does:
/// `.` and empty parts dropped, `..` folded into its parent (inside a `\\?\` path too), no
/// trailing separator, and on Windows a drive-relative `D:notes` taken from that drive's current
/// folder. Nothing is read from the disk, so a symbolic link is not resolved.
pub fn resolve_path(base: &Path, path: &Path) -> PathBuf {
    let joined = join_against(base, path);
    let mut resolved = PathBuf::new();
    for component in joined.components() {
        match component {
            Component::Prefix(_) | Component::RootDir => resolved.push(component.as_os_str()),
            Component::CurDir => {}
            // A verbatim path lists its dots as ordinary parts; Node folds them all the same.
            Component::Normal(part) if part == "." => {}
            Component::ParentDir => climb(&mut resolved),
            Component::Normal(part) if part == ".." => climb(&mut resolved),
            Component::Normal(part) => resolved.push(part),
        }
    }
    resolved
}

fn climb(resolved: &mut PathBuf) {
    let at_root = matches!(
        resolved.components().next_back(),
        Some(Component::RootDir | Component::Prefix(_)) | None
    );
    if !at_root {
        resolved.pop();
    }
}

fn join_against(base: &Path, path: &Path) -> PathBuf {
    #[cfg(windows)]
    if let Some(anchored) = anchor_drive_relative(base, path) {
        return anchored;
    }
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        base.join(path)
    }
}

/// The folder Node resolves a drive-relative path (`D:notes`) against: the drive's own current
/// folder from the `=D:` variable the shell keeps, else the process folder, and the drive's root
/// when that folder is on another drive. `device` is the drive as written, like `D:`.
#[cfg_attr(
    not(windows),
    allow(
        dead_code,
        reason = "only Windows has drive-relative paths, but the rule is tested everywhere"
    )
)]
fn drive_directory(device: &str, drive_variable: Option<&str>, process_folder: &str) -> String {
    let candidate = drive_variable
        .filter(|value| !value.is_empty())
        .unwrap_or(process_folder);
    let on_the_drive = candidate
        .get(..2)
        .is_some_and(|head| head.eq_ignore_ascii_case(device));
    if !on_the_drive && candidate.as_bytes().get(2) == Some(&b'\\') {
        format!("{device}\\")
    } else {
        candidate.to_string()
    }
}

/// `D:notes` made absolute the way Node does, or `None` for any other path. A base on the same
/// drive wins over the drive's current folder.
#[cfg(windows)]
fn anchor_drive_relative(base: &Path, path: &Path) -> Option<PathBuf> {
    use std::path::Prefix;

    let mut parts = path.components();
    let Some(Component::Prefix(prefix)) = parts.next() else {
        return None;
    };
    let Prefix::Disk(letter) = prefix.kind() else {
        return None;
    };
    if path.has_root() {
        return None;
    }
    let device = format!("{}:", char::from(letter));
    let rest: PathBuf = parts.collect();
    let same_drive_base = base.has_root()
        && match base.components().next() {
            Some(Component::Prefix(found)) => match found.kind() {
                Prefix::Disk(other) | Prefix::VerbatimDisk(other) => {
                    other.eq_ignore_ascii_case(&letter)
                }
                _ => false,
            },
            _ => false,
        };
    if same_drive_base {
        return Some(base.join(rest));
    }
    let variable_name = format!("={device}");
    let drive_variable = std::env::vars_os()
        .find(|(name, _)| name.to_string_lossy().eq_ignore_ascii_case(&variable_name))
        .map(|(_, value)| value.to_string_lossy().into_owned());
    let process_folder = std::env::current_dir()
        .map(|folder| folder.to_string_lossy().into_owned())
        .unwrap_or_default();
    let folder = drive_directory(&device, drive_variable.as_deref(), &process_folder);
    Some(PathBuf::from(folder).join(rest))
}

#[cfg(test)]
mod drive_rules {
    use super::drive_directory;

    #[test]
    fn a_drives_own_folder_from_the_shell_wins_over_the_process_folder() {
        assert_eq!(
            drive_directory("D:", Some("D:\\work"), "C:\\elsewhere"),
            "D:\\work"
        );
    }

    #[test]
    fn the_process_folder_serves_when_it_is_on_the_drive_in_any_case() {
        assert_eq!(drive_directory("D:", None, "D:\\here"), "D:\\here");
        assert_eq!(drive_directory("d:", None, "D:\\here"), "D:\\here");
        assert_eq!(drive_directory("D:", Some(""), "d:\\here"), "d:\\here");
    }

    #[test]
    fn a_folder_on_another_drive_gives_the_drives_root() {
        assert_eq!(drive_directory("D:", None, "C:\\x"), "D:\\");
        assert_eq!(drive_directory("D:", Some("C:\\y"), "D:\\here"), "D:\\");
    }
}

/// Drive letters, UNC and verbatim paths exist only on Windows, so these run on the Windows jobs.
#[cfg(all(test, windows))]
mod windows_paths {
    use super::*;

    #[test]
    fn dots_fold_inside_a_verbatim_path_as_node_folds_them() {
        assert_eq!(
            resolve_path(
                Path::new("C:\\base"),
                Path::new("\\\\?\\C:\\vault\\notes\\..\\other\\.\\deep\\")
            ),
            Path::new("\\\\?\\C:\\vault\\other\\deep")
        );
        assert_eq!(
            resolve_path(Path::new("C:\\base"), Path::new("\\\\?\\C:\\a\\..\\..\\..")),
            Path::new("\\\\?\\C:\\")
        );
    }

    #[test]
    fn a_drive_relative_path_on_the_bases_drive_is_taken_from_the_base() {
        assert_eq!(
            resolve_path(Path::new("D:\\vault"), Path::new("D:notes\\..\\inbox")),
            Path::new("D:\\vault\\inbox")
        );
        assert_eq!(
            resolve_path(Path::new("d:\\vault"), Path::new("D:notes")),
            Path::new("d:\\vault\\notes")
        );
    }

    #[test]
    fn a_drive_relative_path_on_another_drive_is_absolute_not_joined_to_the_base() {
        let resolved = resolve_path(Path::new("C:\\vault"), Path::new("D:notes"));
        assert!(resolved.is_absolute(), "{}", resolved.display());
        assert!(resolved.starts_with("D:\\"), "{}", resolved.display());
        assert!(resolved.ends_with("notes"));
        assert!(!resolved.starts_with("C:\\vault"));
    }

    #[test]
    fn a_unc_share_cannot_be_climbed_out_of() {
        assert_eq!(
            resolve_path(
                Path::new("C:\\base"),
                Path::new("\\\\server\\share\\a\\..\\..\\..\\b")
            ),
            Path::new("\\\\server\\share\\b")
        );
    }

    #[test]
    fn forward_slashes_resolve_on_the_base_with_backslashes() {
        assert_eq!(
            resolve_path(Path::new("C:\\vault"), Path::new("notes/./a/../b")),
            Path::new("C:\\vault\\notes\\b")
        );
    }
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
