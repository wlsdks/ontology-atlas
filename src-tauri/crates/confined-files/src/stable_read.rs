//! A vault file read as one snapshot: its bytes, and the facts of the very file those bytes came
//! from.
//!
//! A call that opens a file, reads it, and then asks the path for its modification time can pair
//! bytes with a time that belongs to a later version, because an editor wrote in between. Here the
//! file is opened once and asked for its facts on the open handle before and after the read; the
//! facts must be equal, or the read starts again (at most [`MAX_ATTEMPTS`] times in all).
//!
//! The open never blocks (`O_NONBLOCK` on Unix), and what is not a regular file (a pipe, a device,
//! a folder) is reported as absent, so a pipe planted under a name ending in `.md` cannot hang a
//! read that lists the vault.

use std::io::{self, Read};
use std::path::Path;

use crate::modified_time::ModifiedTime;
use crate::os_error::OsErrorCode;
use crate::plain_file::{self, FileFacts};

/// How many times a file that changes while it is read is read again before the read gives up.
pub const MAX_ATTEMPTS: usize = 3;

/// The facts of a file that tell whether it is still the version that was read. Equal stamps of
/// one path mean the same device, inode, size and times; a file written and renamed in place
/// changes at least one of them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct FileStamp {
    size: u64,
    modified_ns: i128,
    changed_ns: i128,
    identity: (u64, u64),
}

impl FileStamp {
    fn of(facts: FileFacts) -> Self {
        Self {
            size: facts.size,
            modified_ns: facts.modified_ns,
            changed_ns: facts.changed_ns,
            identity: facts.identity,
        }
    }

    pub fn size(self) -> u64 {
        self.size
    }

    /// The modification time of this version, as Node reports `mtimeMs`.
    pub fn modified_time(self) -> ModifiedTime {
        ModifiedTime::from_nanoseconds(self.modified_ns)
    }

    /// Whether this stamp was taken less than `window_ns` before `now_ns` (nanoseconds since the
    /// epoch), by the file's own times: a file written that recently may be written again within
    /// the clock's grain without any stamp changing, so a cache does not trust it yet.
    pub fn is_recent(self, now_ns: i128, window_ns: i128) -> bool {
        let newest = self.modified_ns.max(self.changed_ns);
        now_ns.saturating_sub(newest) < window_ns
    }
}

/// The bytes of a file and the stamp of the version they belong to.
#[derive(Debug)]
pub struct FileSnapshot {
    pub bytes: Vec<u8>,
    pub stamp: FileStamp,
}

/// Why a file could not be read as a snapshot.
#[derive(Debug, thiserror::Error)]
pub enum StableReadError {
    /// The operating system refused: a link that loops, a permission, a locked file.
    #[error("{0}")]
    Io(#[from] io::Error),
    /// The file changed during each of the [`MAX_ATTEMPTS`] reads.
    #[error("the file kept changing while it was read")]
    Unstable,
}

/// The file the stamp of `path` now says, or `None` when nothing regular is there. This is the
/// cheap question a cache asks before it trusts what it kept.
pub(crate) fn stamp_of(path: &Path) -> Result<Option<FileStamp>, StableReadError> {
    match plain_file::facts_at(path) {
        Ok(facts) => Ok(facts.regular.then(|| FileStamp::of(facts))),
        Err(error) if OsErrorCode::of(&error) == OsErrorCode::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

/// [`stamp_of`] for each path, in order. Consecutive paths in one folder share one look at the
/// folder, which is what makes asking about every file of a large vault cheap.
pub(crate) fn stamps_of(paths: &[&Path]) -> Vec<Result<Option<FileStamp>, StableReadError>> {
    plain_file::facts_of_paths(paths)
        .into_iter()
        .map(|facts| match facts {
            Ok(facts) => Ok(facts.regular.then(|| FileStamp::of(facts))),
            Err(error) if OsErrorCode::of(&error) == OsErrorCode::NotFound => Ok(None),
            Err(error) => Err(error.into()),
        })
        .collect()
}

/// Reads `path` until two looks at the open file agree. `after_read` is called with the attempt
/// number between the read and the second look; a test parks a racing edit there.
pub(crate) fn read_stable(
    path: &Path,
    after_read: &dyn Fn(usize),
) -> Result<Option<FileSnapshot>, StableReadError> {
    for attempt in 0..MAX_ATTEMPTS {
        let mut file = match plain_file::open_following(path) {
            Ok(file) => file,
            Err(error) if OsErrorCode::of(&error) == OsErrorCode::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        let before = plain_file::facts_of(&file)?;
        if !before.regular {
            return Ok(None);
        }
        // A file that grows while it is read is read again; the hint is only a start.
        let hint = usize::try_from(before.size).map_or(0, |size| size.min(1 << 24));
        let mut bytes = Vec::with_capacity(hint);
        file.read_to_end(&mut bytes)?;
        after_read(attempt);
        let after = plain_file::facts_of(&file)?;
        if FileStamp::of(before) == FileStamp::of(after) && bytes.len() as u64 == after.size {
            return Ok(Some(FileSnapshot {
                bytes,
                stamp: FileStamp::of(after),
            }));
        }
    }
    Err(StableReadError::Unstable)
}
