//! What identifies a file version without reading it, and when that is not enough.

use sha2::{Digest, Sha256};
use std::fs::Metadata;
use std::time::{SystemTime, UNIX_EPOCH};

/// Modified time and size, plus change time on Unix, which also moves when a tool restores the
/// modified time after rewriting a file.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Stamp {
    pub mtime_ns: i64,
    pub size: i64,
    pub ctime_ns: i64,
}

impl Stamp {
    pub fn of(metadata: &Metadata) -> Stamp {
        Stamp {
            mtime_ns: metadata.modified().map(time_ns).unwrap_or(0),
            size: i64::try_from(metadata.len()).unwrap_or(i64::MAX),
            ctime_ns: change_time_ns(metadata),
        }
    }
}

#[cfg(unix)]
fn change_time_ns(metadata: &Metadata) -> i64 {
    use std::os::unix::fs::MetadataExt;
    metadata
        .ctime()
        .saturating_mul(1_000_000_000)
        .saturating_add(metadata.ctime_nsec())
}

#[cfg(not(unix))]
fn change_time_ns(_metadata: &Metadata) -> i64 {
    0
}

fn time_ns(time: SystemTime) -> i64 {
    match time.duration_since(UNIX_EPOCH) {
        Ok(after) => i64::try_from(after.as_nanos()).unwrap_or(i64::MAX),
        Err(before) => -i64::try_from(before.duration().as_nanos()).unwrap_or(i64::MAX),
    }
}

pub(crate) fn now_ns() -> i64 {
    time_ns(SystemTime::now())
}

/// Two seconds covers one FAT/exFAT timestamp tick and a same-size rewrite inside one tick.
const RACY_WINDOW_NS: i64 = 2_000_000_000;

/// A row whose file was modified within the window before the row was read from disk may describe
/// an older version with the same stamp, so its stamp alone is not trusted.
pub(crate) fn is_racy(file_mtime_ns: i64, row_read_at_ns: i64) -> bool {
    file_mtime_ns > row_read_at_ns.saturating_sub(RACY_WINDOW_NS)
}

pub(crate) type Sha = [u8; 32];

pub(crate) fn sha256(hasher: Sha256) -> Sha {
    hasher.finalize().into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_row_is_racy_until_two_seconds_separate_the_edit_from_the_read() {
        let read_at = 10_000_000_000;
        assert!(is_racy(read_at, read_at));
        assert!(is_racy(read_at - RACY_WINDOW_NS + 1, read_at));
        assert!(!is_racy(read_at - RACY_WINDOW_NS, read_at));
        assert!(
            is_racy(read_at + 5, read_at),
            "a modified time in the future is never trusted"
        );
    }
}
