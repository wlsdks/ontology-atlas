//! How a scanning tool is allowed to look at a source root: what a refusal is, and the questions a
//! scan asks of a tree. [`crate::SnapshotSource`] answers them from a census the app supplied;
//! [`crate::DiskSource`] answers them from the disk.

use std::borrow::Cow;
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

/// Why a read or a census entry was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum Refusal {
    #[error("invalid path")]
    InvalidPath,
    #[error("outside approved root")]
    OutsideApprovedRoot,
    #[error("snapshot entries are named relative to the root")]
    AbsoluteSnapshotEntry,
    #[error("private or hidden path")]
    PrivateOrHiddenPath,
    #[error("input deliberately excluded")]
    DeliberatelyExcluded,
    #[error("symlink")]
    Symlink,
    #[error("file bytes unavailable in snapshot")]
    FileBytesUnavailable,
    #[error("directory unavailable in snapshot")]
    DirectoryUnavailable,
    #[error("incomplete directory")]
    IncompleteDirectory,
    #[error("invalid snapshot entry")]
    InvalidSnapshotEntry,
    #[error("ambiguous snapshot entry")]
    AmbiguousSnapshotEntry,
    #[error("snapshot byte limit")]
    SnapshotByteLimit,
    #[error("file over the size limit")]
    FileOverSizeLimit,
}

/// Why a read was not answered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum SourceReadError {
    /// The path is outside what a read may touch. The first refusal of a snapshot run also fails
    /// the run as a whole, even if a caller swallows this error (see
    /// [`crate::SnapshotSource::finish`]).
    #[error("source read refused: {0}")]
    Refused(Refusal),
    /// Nothing is there (or, from a snapshot, the complete census lists nothing there).
    #[error("nothing is at that path")]
    Absent,
}

impl SourceReadError {
    /// The error code a caller sees: `EACCES` for a refusal, `ENOENT` for an absence.
    pub fn code(&self) -> &'static str {
        match self {
            Self::Refused(_) => "EACCES",
            Self::Absent => "ENOENT",
        }
    }
}

/// The questions a scan asks of a source tree. A path may be absolute or relative; a relative one
/// is read below the tree's root, and any path that does not end up inside the root is refused.
pub trait SourceFiles {
    /// The folder every path is below.
    fn root(&self) -> &Path;

    /// The kind of what the path names, through links; `None` when nothing is there.
    fn kind(&self, path: &Path) -> Result<Option<EntryKind>, SourceReadError>;

    /// The kind of the path itself, a link being a link.
    fn link_kind(&self, path: &Path) -> Result<Option<EntryKind>, SourceReadError>;

    /// The text of a regular file, as Node's `readFileSync(path, 'utf8')` decodes it.
    fn read_text(&self, path: &Path) -> Result<Cow<'_, str>, SourceReadError>;

    /// The names in a directory, in byte order of the name.
    fn list_directory(&self, path: &Path) -> Result<Vec<DirectoryEntry>, SourceReadError>;
}

/// `path` folded lexically against `root` (a relative path is taken below it) and checked to be
/// `root` or below it: the parts of `path` below `root`. Refuses a path that holds a NUL or
/// leaves the root.
pub(crate) fn parts_below(root: &Path, path: &Path) -> Result<Vec<String>, Refusal> {
    if path.to_string_lossy().contains('\0') {
        return Err(Refusal::InvalidPath);
    }
    let resolved = resolve_path(root, path);
    let relative = resolved
        .strip_prefix(root)
        .map_err(|_| Refusal::OutsideApprovedRoot)?;
    Ok(relative
        .components()
        .filter_map(|part| match part {
            Component::Normal(name) => Some(name.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect())
}

/// `path` as the `/`-separated name below `root` (`.` for the root itself), or the refusal that
/// names why it may not be touched: not a valid path, outside the root, hidden or named like a
/// credential, or deliberately excluded.
pub(crate) fn address(root: &Path, excluded: &[String], path: &Path) -> Result<String, Refusal> {
    let parts = parts_below(root, path)?;
    if parts
        .iter()
        .any(|part| is_hidden_name(part) || is_credential_name(part))
    {
        return Err(Refusal::PrivateOrHiddenPath);
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
        return Err(Refusal::DeliberatelyExcluded);
    }
    Ok(normalized)
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

    fn refused(path: &str) -> Refusal {
        address(Path::new("/repo"), &[], Path::new(path)).expect_err(path)
    }

    #[test]
    fn a_path_below_the_root_is_named_with_slashes() {
        let root = Path::new("/repo");
        assert_eq!(
            address(root, &[], Path::new("/repo/src/a.ts")).as_deref(),
            Ok("src/a.ts")
        );
        assert_eq!(
            address(root, &[], Path::new("/repo/src/../lib/b.ts")).as_deref(),
            Ok("lib/b.ts")
        );
        assert_eq!(address(root, &[], Path::new("/repo")).as_deref(), Ok("."));
        assert_eq!(
            address(root, &[], Path::new("src/a.ts")).as_deref(),
            Ok("src/a.ts"),
            "a relative path is taken below the root"
        );
    }

    #[test]
    fn every_way_out_of_the_root_has_its_own_refusal() {
        assert_eq!(
            refused("/repo/../outside/x.ts"),
            Refusal::OutsideApprovedRoot
        );
        assert_eq!(refused("/etc/passwd"), Refusal::OutsideApprovedRoot);
        assert_eq!(refused("/repository/a.ts"), Refusal::OutsideApprovedRoot);
        assert_eq!(refused("../a.ts"), Refusal::OutsideApprovedRoot);
        assert_eq!(refused("/repo/a\0b"), Refusal::InvalidPath);
        assert_eq!(refused("/repo/.env"), Refusal::PrivateOrHiddenPath);
        assert_eq!(
            refused("/repo/src/.git/config"),
            Refusal::PrivateOrHiddenPath
        );
        assert_eq!(
            refused("/repo/keys/server.pem"),
            Refusal::PrivateOrHiddenPath
        );
        assert_eq!(refused("/repo/secrets/a.ts"), Refusal::PrivateOrHiddenPath);
    }

    #[test]
    fn an_excluded_folder_and_everything_below_it_is_refused_but_not_a_sibling() {
        let excluded = vec!["vendor".to_string()];
        let root = Path::new("/repo");
        for path in ["/repo/vendor", "/repo/vendor/lib/a.ts"] {
            assert_eq!(
                address(root, &excluded, Path::new(path)),
                Err(Refusal::DeliberatelyExcluded),
                "{path}"
            );
        }
        assert!(address(root, &excluded, Path::new("/repo/vendors/a.ts")).is_ok());
    }

    #[test]
    fn a_refusal_reads_as_a_sentence_with_its_reason() {
        let error = SourceReadError::Refused(Refusal::Symlink);
        assert_eq!(error.to_string(), "source read refused: symlink");
        assert_eq!(error.code(), "EACCES");
        assert_eq!(SourceReadError::Absent.code(), "ENOENT");
    }
}
