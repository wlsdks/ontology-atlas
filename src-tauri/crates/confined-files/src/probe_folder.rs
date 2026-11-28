//! One source folder as the project-source probe looks at it: the names in a folder, what a name is
//! without following a link, a link's target, and the first bytes of a regular file.
//!
//! The probe fingerprints a folder a person connected, so it may not follow a link out of it: a
//! listing reports a link as nothing, a file is opened by a handle that refuses a link, and a
//! link is described by its own target text. Nothing here opens a file the probe was not asked
//! about by name.

use std::io::{self, Read};
use std::path::{Path, PathBuf};

use crate::modified_time::ModifiedTime;
use crate::plain_file;
use crate::real_paths::real_path;
use crate::source_access::EntryKind;

/// One name in a listed folder: a file or a folder. A link, a device and a pipe are not listed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProbeEntry {
    pub name: String,
    pub is_directory: bool,
}

/// What a name is, as the file system says without following a link.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ProbeFacts {
    pub kind: EntryKind,
    pub size: u64,
    /// The modification time in whole milliseconds since the epoch, as Node's `Math.trunc(mtimeMs)`.
    pub modified_ms: i64,
}

/// A folder opened for probing: its real path, known to be a folder.
#[derive(Debug, Clone)]
pub struct ProbeFolder {
    root: PathBuf,
}

impl ProbeFolder {
    /// The folder `path` names with every link resolved; an error when it is not a folder.
    pub fn open(path: &Path) -> io::Result<Self> {
        let root = real_path(path)?;
        if !root.metadata()?.is_dir() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "project source root must be a directory",
            ));
        }
        Ok(Self { root })
    }

    pub fn path(&self) -> &Path {
        &self.root
    }

    fn at(&self, relative: &str) -> PathBuf {
        if relative.is_empty() {
            self.root.clone()
        } else {
            self.root.join(relative)
        }
    }

    /// The files and folders directly below `relative` (`""` is the root), in no order.
    pub fn list(&self, relative: &str) -> io::Result<Vec<ProbeEntry>> {
        let mut entries = Vec::new();
        for entry in std::fs::read_dir(self.at(relative))? {
            let entry = entry?;
            let kind = entry.file_type()?;
            if kind.is_dir() || kind.is_file() {
                entries.push(ProbeEntry {
                    name: entry.file_name().to_string_lossy().into_owned(),
                    is_directory: kind.is_dir(),
                });
            }
        }
        Ok(entries)
    }

    /// What `relative` is, a link being a link; `None` when nothing is there.
    pub fn facts(&self, relative: &str) -> io::Result<Option<ProbeFacts>> {
        let metadata = match std::fs::symlink_metadata(self.at(relative)) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error),
        };
        let kind = metadata.file_type();
        let kind = if kind.is_symlink() {
            EntryKind::Symlink
        } else if kind.is_file() {
            EntryKind::File
        } else if kind.is_dir() {
            EntryKind::Directory
        } else {
            EntryKind::Other
        };
        let modified_ms = ModifiedTime::of(&metadata)
            .map_or(0, |time| time.milliseconds().trunc() as i64);
        Ok(Some(ProbeFacts {
            kind,
            size: metadata.len(),
            modified_ms,
        }))
    }

    /// Whether a regular file is at `relative`, never through a link.
    pub fn has_file(&self, relative: &str) -> bool {
        matches!(self.facts(relative), Ok(Some(facts)) if facts.kind == EntryKind::File)
    }

    /// The text a link holds, not what it points to.
    pub fn link_target(&self, relative: &str) -> io::Result<Vec<u8>> {
        let target = std::fs::read_link(self.at(relative))?;
        Ok(target.to_string_lossy().into_owned().into_bytes())
    }

    /// At most `limit` bytes from the start of the regular file at `relative`; a link is refused.
    pub fn read_prefix(&self, relative: &str, limit: u64) -> io::Result<Vec<u8>> {
        let file = plain_file::open_read(&self.at(relative))?;
        let mut bytes = Vec::new();
        file.take(limit).read_to_end(&mut bytes)?;
        Ok(bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_listing_names_files_and_folders_and_leaves_out_a_link() {
        let folder = tempfile::tempdir().expect("temp dir");
        std::fs::create_dir(folder.path().join("src")).expect("folder");
        std::fs::write(folder.path().join("a.txt"), b"a").expect("file");
        #[cfg(unix)]
        std::os::unix::fs::symlink("a.txt", folder.path().join("link")).expect("link");
        let probe = ProbeFolder::open(folder.path()).expect("opens");
        let mut names: Vec<(String, bool)> = probe
            .list("")
            .expect("lists")
            .into_iter()
            .map(|entry| (entry.name, entry.is_directory))
            .collect();
        names.sort();
        assert_eq!(
            names,
            vec![("a.txt".to_string(), false), ("src".to_string(), true)]
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_link_is_described_by_its_target_text_and_never_read_through() {
        let folder = tempfile::tempdir().expect("temp dir");
        std::fs::write(folder.path().join("a.txt"), b"secret").expect("file");
        std::os::unix::fs::symlink("a.txt", folder.path().join("link")).expect("link");
        let probe = ProbeFolder::open(folder.path()).expect("opens");
        assert_eq!(probe.facts("link").expect("facts").expect("there").kind, EntryKind::Symlink);
        assert_eq!(probe.link_target("link").expect("target"), b"a.txt");
        assert!(probe.read_prefix("link", 100).is_err());
        assert_eq!(probe.read_prefix("a.txt", 3).expect("reads"), b"sec");
    }

    #[test]
    fn a_path_that_is_a_file_is_not_a_project_source_root() {
        let folder = tempfile::tempdir().expect("temp dir");
        let file = folder.path().join("a.txt");
        std::fs::write(&file, b"a").expect("file");
        let error = ProbeFolder::open(&file).expect_err("a file is no folder");
        assert_eq!(error.to_string(), "project source root must be a directory");
    }
}
