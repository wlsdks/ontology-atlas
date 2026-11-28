//! One file of a repository, named by an agent part by part and read whole as one version.
//!
//! The caller has already refused the names a policy refuses (hidden, credential, ignored,
//! absolute, `..`); this read refuses what the disk can plant at an allowed name, the same way
//! [`crate::VaultRoot::read_raw_source`] does for a vault source: a link anywhere on the path, a
//! pipe, a folder, a file over the size the caller allows, a file that changes while it is read,
//! and (on Windows, where a junction looks like a folder) a path that resolves somewhere other
//! than where it is spelled.

use std::fs;
use std::io::Read;

use crate::os_error::OsErrorCode;
use crate::plain_file;
use crate::raw_source_read::spells_real_path;
use crate::scan_root::SourceRoot;
use crate::stable_read::FileStamp;

/// Why a repository file was not read.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum RepositoryFileRefusal {
    #[error("nothing is at that path")]
    NotFound,
    /// A part of the path is a link, or the path resolves somewhere other than where it is spelled.
    #[error("the path is or runs through a link")]
    ThroughLink,
    #[error("not a regular file")]
    NotRegular,
    #[error("larger than the allowed size")]
    TooLarge,
    #[error("the file changed while it was read")]
    Changed,
    /// The operating system refused to open or read it (a permission, a lock).
    #[error("the file could not be opened for reading")]
    Unreadable,
}

impl SourceRoot {
    /// The bytes of the regular file at `parts` below this root, of at most `max_bytes`, that no
    /// link leads to, read as one version.
    pub fn read_repository_file(
        &self,
        parts: &[&str],
        max_bytes: u64,
    ) -> Result<Vec<u8>, RepositoryFileRefusal> {
        let mut file_path = self.as_path().to_path_buf();
        for part in parts {
            file_path.push(part);
            match fs::symlink_metadata(&file_path) {
                Ok(metadata) if metadata.file_type().is_symlink() => {
                    return Err(RepositoryFileRefusal::ThroughLink)
                }
                Ok(_) => {}
                Err(error)
                    if matches!(
                        OsErrorCode::of(&error),
                        OsErrorCode::NotFound
                            | OsErrorCode::NotADirectory
                            | OsErrorCode::NameTooLong
                    ) =>
                {
                    return Err(RepositoryFileRefusal::NotFound)
                }
                Err(_) => return Err(RepositoryFileRefusal::Unreadable),
            }
        }
        let owned: Vec<String> = parts.iter().map(|part| (*part).to_string()).collect();
        let spells_the_real_path = || spells_real_path(self.as_path(), &file_path, &owned);
        let mut file = match plain_file::open_read(&file_path) {
            Ok(file) => file,
            Err(error) if plain_file::is_link_refusal(&error) => {
                return Err(RepositoryFileRefusal::ThroughLink)
            }
            Err(error) if OsErrorCode::of(&error) == OsErrorCode::NotFound => {
                return Err(RepositoryFileRefusal::NotFound)
            }
            Err(_) => return Err(RepositoryFileRefusal::Unreadable),
        };
        let before = plain_file::facts_of(&file).map_err(|_| RepositoryFileRefusal::Unreadable)?;
        if !before.regular {
            return Err(RepositoryFileRefusal::NotRegular);
        }
        if before.size > max_bytes {
            return Err(RepositoryFileRefusal::TooLarge);
        }
        if !spells_the_real_path() {
            return Err(RepositoryFileRefusal::ThroughLink);
        }
        let mut bytes = Vec::with_capacity(usize::try_from(before.size).unwrap_or(0));
        file.by_ref()
            .take(max_bytes.saturating_add(1))
            .read_to_end(&mut bytes)
            .map_err(|_| RepositoryFileRefusal::Unreadable)?;
        let after = plain_file::facts_of(&file).map_err(|_| RepositoryFileRefusal::Unreadable)?;
        if bytes.len() as u64 != before.size || FileStamp::of(before) != FileStamp::of(after) {
            return Err(RepositoryFileRefusal::Changed);
        }
        if !spells_the_real_path() {
            return Err(RepositoryFileRefusal::Changed);
        }
        Ok(bytes)
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::ScanRoots;

    fn root_of(folder: &std::path::Path) -> SourceRoot {
        ScanRoots::new(folder.to_path_buf(), folder.to_path_buf())
            .expect("roots")
            .allow(folder, "rootPath")
            .expect("allowed")
    }

    #[test]
    fn a_link_on_the_path_a_folder_and_a_file_over_the_limit_are_each_refused_by_name() {
        let base = tempfile::tempdir().expect("temp dir");
        let real = std::fs::canonicalize(base.path()).expect("real");
        std::fs::create_dir_all(real.join("src")).expect("src");
        std::fs::write(real.join("src/a.ts"), "export const a = 1;\n").expect("file");
        std::os::unix::fs::symlink(real.join("src"), real.join("linked")).expect("link");
        std::os::unix::fs::symlink(real.join("src/a.ts"), real.join("src/b.ts"))
            .expect("file link");
        let root = root_of(&real);
        assert_eq!(
            root.read_repository_file(&["src", "a.ts"], 1024).as_deref(),
            Ok(&b"export const a = 1;\n"[..])
        );
        assert_eq!(
            root.read_repository_file(&["linked", "a.ts"], 1024),
            Err(RepositoryFileRefusal::ThroughLink)
        );
        assert_eq!(
            root.read_repository_file(&["src", "b.ts"], 1024),
            Err(RepositoryFileRefusal::ThroughLink)
        );
        assert_eq!(
            root.read_repository_file(&["src"], 1024),
            Err(RepositoryFileRefusal::NotRegular)
        );
        assert_eq!(
            root.read_repository_file(&["src", "a.ts"], 4),
            Err(RepositoryFileRefusal::TooLarge)
        );
        assert_eq!(
            root.read_repository_file(&["src", "none.ts"], 1024),
            Err(RepositoryFileRefusal::NotFound)
        );
    }
}
