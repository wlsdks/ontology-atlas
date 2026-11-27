//! How a scanning tool is allowed to look at a source root: which names are addressable, what a
//! refusal says, and the questions a scan asks of a tree. [`crate::SnapshotSource`] answers them
//! from a census the app supplied; [`crate::DiskSource`] answers them from the disk.

use std::path::{Component, Path, PathBuf};

use crate::confined_root::resolve_path;
use crate::private_names::{is_credential_name, is_hidden_name};

/// What a path is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EntryKind {
    File,
    Directory,
    Symlink,
    Other,
}

impl EntryKind {
    pub fn is_file(self) -> bool {
        self == Self::File
    }

    pub fn is_directory(self) -> bool {
        self == Self::Directory
    }

    pub fn is_symlink(self) -> bool {
        self == Self::Symlink
    }

    /// The word the read boundary records: `missing` for no entry.
    pub fn state_name(kind: Option<Self>) -> &'static str {
        match kind {
            None => "missing",
            Some(Self::File) => "file",
            Some(Self::Directory) => "directory",
            Some(Self::Symlink) => "symlink",
            Some(Self::Other) => "other",
        }
    }
}

/// One name in a listed directory.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DirectoryEntry {
    pub name: String,
    pub kind: EntryKind,
}

/// Why a read was not answered.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SourceReadError {
    /// The path is outside what a read may touch. The first refusal of a run also fails the run
    /// as a whole, even if a caller swallows this error (see [`crate::SnapshotSource::finish`]).
    Refused(String),
    /// Nothing is there (or, from a snapshot, the complete census lists nothing there).
    Absent,
}

impl std::fmt::Display for SourceReadError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Refused(reason) => write!(formatter, "Confined source read refused: {reason}"),
            Self::Absent => formatter.write_str("Input absent from the complete snapshot"),
        }
    }
}

impl std::error::Error for SourceReadError {}

impl SourceReadError {
    /// The error code a caller sees: `EACCES` for a refusal, `ENOENT` for an absence.
    pub fn code(&self) -> &'static str {
        match self {
            Self::Refused(_) => "EACCES",
            Self::Absent => "ENOENT",
        }
    }
}

/// The questions a scan asks of a source tree. Paths are absolute, below the tree's root.
pub trait SourceFiles {
    /// The folder every path is below.
    fn root(&self) -> &Path;

    /// The kind of what the path names, through links; `None` when nothing is there.
    fn kind(&self, path: &Path) -> Result<Option<EntryKind>, SourceReadError>;

    /// The kind of the path itself, a link being a link.
    fn link_kind(&self, path: &Path) -> Result<Option<EntryKind>, SourceReadError>;

    /// The text of a regular file. A link is refused, whatever it points at.
    fn read_text(&self, path: &Path) -> Result<String, SourceReadError>;

    /// The names in a directory, in byte order of the name.
    fn list_directory(&self, path: &Path) -> Result<Vec<DirectoryEntry>, SourceReadError>;
}

/// `path` as the `/`-separated name below `root` (`.` for the root itself), or the refusal that
/// names why it may not be touched: not a valid path, outside the root, hidden or named like a
/// credential, or deliberately excluded. A relative path is taken as below `root`.
pub(crate) fn address(
    root: &Path,
    excluded: &[String],
    path: &Path,
) -> Result<String, SourceReadError> {
    let refuse = |reason: &str| Err(SourceReadError::Refused(reason.to_string()));
    if path.to_string_lossy().contains('\0') {
        return refuse("invalid path");
    }
    let resolved = resolve_path(root, path);
    let Some(parts) = below(root, &resolved) else {
        return refuse("outside approved root");
    };
    if parts
        .iter()
        .any(|part| is_hidden_name(part) || is_credential_name(part))
    {
        return refuse("private or hidden path");
    }
    let normalized = if parts.is_empty() {
        ".".to_string()
    } else {
        parts.join("/")
    };
    if excluded
        .iter()
        .any(|prefix| normalized == *prefix || normalized.starts_with(&format!("{prefix}/")))
    {
        return refuse("input deliberately excluded");
    }
    Ok(normalized)
}

/// The parts of `path` below `root`, when it is `root` or below it.
fn below(root: &Path, path: &Path) -> Option<Vec<String>> {
    let relative = path.strip_prefix(root).ok()?;
    Some(
        relative
            .components()
            .filter_map(|part| match part {
                Component::Normal(name) => Some(name.to_string_lossy().into_owned()),
                _ => None,
            })
            .collect(),
    )
}

/// The absolute path of a `/`-separated name below `root`.
pub(crate) fn absolute(root: &Path, name: &str) -> PathBuf {
    if name == "." {
        root.to_path_buf()
    } else {
        name.split('/')
            .fold(root.to_path_buf(), |path, part| path.join(part))
    }
}

#[cfg(test)]
#[cfg(unix)]
mod tests {
    use super::*;

    fn refused(path: &str) -> String {
        match address(Path::new("/repo"), &[], Path::new(path)) {
            Err(SourceReadError::Refused(reason)) => reason,
            other => panic!("{path}: {other:?}"),
        }
    }

    #[test]
    fn a_path_below_the_root_is_named_with_slashes() {
        assert_eq!(
            address(Path::new("/repo"), &[], Path::new("/repo/src/a.ts")).as_deref(),
            Ok("src/a.ts")
        );
        assert_eq!(
            address(Path::new("/repo"), &[], Path::new("/repo/src/../lib/b.ts")).as_deref(),
            Ok("lib/b.ts")
        );
        assert_eq!(
            address(Path::new("/repo"), &[], Path::new("/repo")).as_deref(),
            Ok(".")
        );
        assert_eq!(
            address(Path::new("/repo"), &[], Path::new("src/a.ts")).as_deref(),
            Ok("src/a.ts")
        );
    }

    #[test]
    fn every_way_out_of_the_root_has_its_own_refusal_text() {
        assert_eq!(refused("/repo/../outside/x.ts"), "outside approved root");
        assert_eq!(refused("/etc/passwd"), "outside approved root");
        assert_eq!(refused("/repository/a.ts"), "outside approved root");
        assert_eq!(refused("/repo/a\0b"), "invalid path");
        assert_eq!(refused("/repo/.env"), "private or hidden path");
        assert_eq!(refused("/repo/src/.git/config"), "private or hidden path");
        assert_eq!(refused("/repo/keys/server.pem"), "private or hidden path");
        assert_eq!(refused("/repo/secrets/a.ts"), "private or hidden path");
    }

    #[test]
    fn an_excluded_folder_and_everything_below_it_is_refused_but_not_a_sibling() {
        let excluded = vec!["vendor".to_string()];
        let root = Path::new("/repo");
        for path in ["/repo/vendor", "/repo/vendor/lib/a.ts"] {
            assert_eq!(
                address(root, &excluded, Path::new(path)),
                Err(SourceReadError::Refused(
                    "input deliberately excluded".to_string()
                )),
                "{path}"
            );
        }
        assert!(address(root, &excluded, Path::new("/repo/vendors/a.ts")).is_ok());
    }

    #[test]
    fn the_refusal_reads_as_the_javascript_error_does() {
        let error = SourceReadError::Refused("symlink".to_string());
        assert_eq!(error.to_string(), "Confined source read refused: symlink");
        assert_eq!(error.code(), "EACCES");
        assert_eq!(SourceReadError::Absent.code(), "ENOENT");
    }
}
