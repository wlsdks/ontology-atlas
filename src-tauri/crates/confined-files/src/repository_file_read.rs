//! One file of a repository, named by an agent part by part and read whole as one version.
//!
//! The caller has already refused the names a policy refuses (hidden, credential, ignored); the
//! parts arrive as [`PlainParts`], so none is empty, `.`, `..`, absolute or a Windows device name.
//! The read itself is [`crate::confined_file_read`], shared with the vault's raw sources.

use crate::confined_file_read::{read_confined_file, ConfinedRefusal};
use crate::plain_parts::PlainParts;
use crate::scan_root::SourceRoot;
use crate::stable_read::FileStamp;

/// A repository file as one version: its bytes and the stamp of the file they were read from, which
/// a later `stat` compares to learn whether the version is still the file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepositoryFile {
    pub bytes: Vec<u8>,
    pub stamp: FileStamp,
}

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

impl From<ConfinedRefusal> for RepositoryFileRefusal {
    fn from(refusal: ConfinedRefusal) -> Self {
        match refusal {
            ConfinedRefusal::NotFound => Self::NotFound,
            ConfinedRefusal::ThroughLink => Self::ThroughLink,
            ConfinedRefusal::NotRegular => Self::NotRegular,
            ConfinedRefusal::HiddenOrCredential => Self::HiddenOrCredential,
            ConfinedRefusal::TooLarge => Self::TooLarge,
            ConfinedRefusal::Changed => Self::Changed,
            ConfinedRefusal::Unreadable => Self::Unreadable,
        }
    }
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
        parts: &PlainParts,
        max_bytes: u64,
    ) -> Result<RepositoryFile, RepositoryFileRefusal> {
        let read = read_confined_file(self.as_path(), parts, max_bytes)?;
        Ok(RepositoryFile {
            bytes: read.bytes,
            stamp: read.stamp,
        })
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

    fn read(
        root: &SourceRoot,
        parts: &[&str],
        max_bytes: u64,
    ) -> Result<RepositoryFile, RepositoryFileRefusal> {
        root.read_repository_file(&PlainParts::new(parts).expect("plain parts"), max_bytes)
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
            read(&root, &["src", "a.ts"], 1024).map(|file| file.bytes),
            Ok(b"export const a = 1;\n".to_vec())
        );
        assert_eq!(
            read(&root, &["linked", "a.ts"], 1024),
            Err(RepositoryFileRefusal::ThroughLink)
        );
        #[cfg(unix)]
        assert_eq!(
            read(&root, &["src", "b.ts"], 1024),
            Err(RepositoryFileRefusal::ThroughLink)
        );
        // A folder is refused by its kind where the open lets a handle be made on it.
        #[cfg(unix)]
        assert_eq!(
            read(&root, &["src"], 1024),
            Err(RepositoryFileRefusal::NotRegular)
        );
        // Microsoft, "CreateFileW": "To open a directory using CreateFile, specify the
        // FILE_FLAG_BACKUP_SEMANTICS flag as part of dwFlagsAndAttributes." The read does not, so
        // on Windows the open of a folder fails and the refusal is the open's, not the kind's.
        #[cfg(windows)]
        assert!(read(&root, &["src"], 1024).is_err());
        assert_eq!(
            read(&root, &["src", "a.ts"], 4),
            Err(RepositoryFileRefusal::TooLarge)
        );
        assert_eq!(
            read(&root, &["src", "none.ts"], 1024),
            Err(RepositoryFileRefusal::NotFound)
        );
    }

    /// Plants `src/<real>` and names it as `src/<lookalike>`. A case-insensitive disk (APFS, NTFS)
    /// opens the lookalike as the real file; a case-sensitive one does not find it. Either way the
    /// bytes of the credential are not returned.
    fn lookalike_answer(
        real: &str,
        lookalike: &str,
    ) -> Result<RepositoryFile, RepositoryFileRefusal> {
        let base = tempfile::tempdir().expect("temp dir");
        let folder = std::fs::canonicalize(base.path()).expect("real");
        std::fs::create_dir_all(folder.join("src")).expect("src");
        std::fs::write(folder.join("src").join(real), "KEY = 1\n").expect("credential");
        // The real name itself is refused on every disk: the file is a credential as spelled.
        assert_eq!(
            read(&root_of(&folder), &["src", real], 1024),
            Err(RepositoryFileRefusal::HiddenOrCredential),
            "{real}"
        );
        let disk_folds = folder.join("src").join(lookalike).exists();
        let answer = read(&root_of(&folder), &["src", lookalike], 1024);
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
