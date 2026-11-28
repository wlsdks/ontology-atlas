//! One file of a repository, named by an agent part by part and read whole as one version.
//!
//! The caller has already refused the names a policy refuses (hidden, credential, ignored,
//! absolute, `..`); this read refuses what the disk can plant at an allowed name, the same way
//! [`crate::VaultRoot::read_raw_source`] does for a vault source: a link anywhere on the path, a
//! pipe, a folder, a file over the size the caller allows, a file that changes while it is read,
//! a path that resolves somewhere other than where it is spelled (on Windows a junction looks like
//! a folder), and a path whose real spelling is hidden or a credential name (a Kelvin sign opens
//! `private_key.txt` on a case-insensitive disk).

use std::fs;
use std::io::Read;

use crate::os_error::OsErrorCode;
use crate::plain_file;
use crate::raw_source_read::{real_spelling, RealSpelling};
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
    /// The file the path opens is spelled by the disk as a hidden or credential name (a lookalike
    /// letter on a case-insensitive disk opens `private_key.txt`).
    #[error("the file is hidden or named like a credential")]
    HiddenOrCredential,
    #[error("larger than the allowed size")]
    TooLarge,
    #[error("the file changed while it was read")]
    Changed,
    /// The operating system refused to open or read it (a permission, a lock).
    #[error("the file could not be opened for reading")]
    Unreadable,
}

impl SourceRoot {
    /// The stamp of the regular file at `parts` below this root, or `None` when nothing regular is
    /// there. One `stat` and no open: the cheap question a cache asks before it trusts the text it
    /// kept. It does not judge links or names; only a read does.
    pub fn repository_file_stamp(&self, parts: &[&str]) -> Option<FileStamp> {
        let file_path = parts
            .iter()
            .fold(self.as_path().to_path_buf(), |joined, part| {
                joined.join(part)
            });
        crate::stable_read::stamp_of(&file_path).ok().flatten()
    }

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
        let spelling = || real_spelling(self.as_path(), &file_path, &owned);
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
        match spelling() {
            RealSpelling::AsNamed => {}
            RealSpelling::Elsewhere => return Err(RepositoryFileRefusal::ThroughLink),
            RealSpelling::Private => return Err(RepositoryFileRefusal::HiddenOrCredential),
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
        if spelling() != RealSpelling::AsNamed {
            return Err(RepositoryFileRefusal::Changed);
        }
        Ok(bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ScanRoots;

    fn root_of(folder: &std::path::Path) -> SourceRoot {
        ScanRoots::new(folder.to_path_buf(), folder.to_path_buf())
            .expect("roots")
            .allow(folder, "rootPath")
            .expect("allowed")
    }

    /// A repository with `src/a.ts`, and the links this platform can make to it without a
    /// privilege: symbolic links on Unix, and on Windows a directory junction made by `mklink /J`
    /// (Microsoft, "mklink", which needs no administrator right for a junction). A junction looks
    /// like a folder to `symlink_metadata`, so this is the case the real-path check exists for.
    fn repository_with_links(real: &std::path::Path) {
        std::fs::create_dir_all(real.join("src")).expect("src");
        std::fs::write(real.join("src/a.ts"), "export const a = 1;\n").expect("file");
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(real.join("src"), real.join("linked")).expect("link");
            std::os::unix::fs::symlink(real.join("src/a.ts"), real.join("src/b.ts"))
                .expect("file link");
        }
        #[cfg(windows)]
        {
            let made = std::process::Command::new("cmd")
                .args(["/C", "mklink", "/J"])
                .arg(real.join("linked"))
                .arg(real.join("src"))
                .output()
                .expect("cmd runs");
            assert!(made.status.success(), "mklink /J: {made:?}");
        }
    }

    #[test]
    fn a_link_on_the_path_a_folder_and_a_file_over_the_limit_are_each_refused_by_name() {
        let base = tempfile::tempdir().expect("temp dir");
        let real = std::fs::canonicalize(base.path()).expect("real");
        repository_with_links(&real);
        let root = root_of(&real);
        assert_eq!(
            root.read_repository_file(&["src", "a.ts"], 1024).as_deref(),
            Ok(&b"export const a = 1;\n"[..])
        );
        assert_eq!(
            root.read_repository_file(&["linked", "a.ts"], 1024),
            Err(RepositoryFileRefusal::ThroughLink)
        );
        #[cfg(unix)]
        assert_eq!(
            root.read_repository_file(&["src", "b.ts"], 1024),
            Err(RepositoryFileRefusal::ThroughLink)
        );
        // Windows cannot open a folder as a file, so there the refusal is the open's, not the kind's.
        #[cfg(unix)]
        assert_eq!(
            root.read_repository_file(&["src"], 1024),
            Err(RepositoryFileRefusal::NotRegular)
        );
        #[cfg(windows)]
        assert!(root.read_repository_file(&["src"], 1024).is_err());
        assert_eq!(
            root.read_repository_file(&["src", "a.ts"], 4),
            Err(RepositoryFileRefusal::TooLarge)
        );
        assert_eq!(
            root.read_repository_file(&["src", "none.ts"], 1024),
            Err(RepositoryFileRefusal::NotFound)
        );
    }

    /// Plants `src/<real>` and names it as `src/<lookalike>`. A case-insensitive disk (APFS, NTFS)
    /// opens the lookalike as the real file; a case-sensitive one does not find it. Either way the
    /// bytes of the credential are not returned.
    fn lookalike_answer(real: &str, lookalike: &str) -> Result<Vec<u8>, RepositoryFileRefusal> {
        let base = tempfile::tempdir().expect("temp dir");
        let folder = std::fs::canonicalize(base.path()).expect("real");
        std::fs::create_dir_all(folder.join("src")).expect("src");
        std::fs::write(folder.join("src").join(real), "KEY = 1\n").expect("credential");
        // The real name itself is refused on every disk: the file is a credential as spelled.
        assert_eq!(
            root_of(&folder).read_repository_file(&["src", real], 1024),
            Err(RepositoryFileRefusal::HiddenOrCredential),
            "{real}"
        );
        let disk_folds = folder.join("src").join(lookalike).exists();
        let answer = root_of(&folder).read_repository_file(&["src", lookalike], 1024);
        let expected = if disk_folds {
            RepositoryFileRefusal::HiddenOrCredential
        } else {
            RepositoryFileRefusal::NotFound
        };
        assert_eq!(answer, Err(expected), "{lookalike}");
        answer
    }

    #[test]
    fn a_lookalike_name_that_the_disk_opens_as_a_credential_is_not_read() {
        // A Kelvin sign is the letter K after Unicode normalization and lower-casing; a long s
        // (U+017F) is the letter s to the disk's case folding and to nothing the name rule folds,
        // so only the real spelling of the opened file shows it.
        lookalike_answer("private_key.txt", "private_\u{212a}ey.txt").unwrap_err();
        lookalike_answer("secret.ts", "\u{17f}ecret.ts").unwrap_err();
        lookalike_answer("tls.key", "tls.KEY").unwrap_err();
    }
}
