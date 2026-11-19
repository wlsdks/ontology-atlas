//! What identifies a file version without reading it, and when that is not enough.

use sha2::{Digest, Sha256};
use std::fs::{File, Metadata};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Modified time and size, plus change time, which also moves when a tool restores the modified
/// time after rewriting a file: Unix `ctime`, NTFS and ReFS `ChangeTime`. `ctime_ns` is 0 where the
/// file system keeps no change time (FAT, exFAT); `change_time_is_kept` says so per vault.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Stamp {
    pub mtime_ns: i64,
    pub size: i64,
    pub ctime_ns: i64,
}

impl Stamp {
    fn with_change_time(metadata: &Metadata, ctime_ns: i64) -> Stamp {
        Stamp {
            mtime_ns: metadata.modified().map(time_ns).unwrap_or(0),
            size: i64::try_from(metadata.len()).unwrap_or(i64::MAX),
            ctime_ns,
        }
    }

    /// The stamp of a file already open, from its own handle.
    pub fn of_open(file: &File, metadata: &Metadata) -> Stamp {
        Stamp::with_change_time(metadata, change_time_of_open(file, metadata))
    }

    /// The stamp of the regular file at `path`, never through a link: `None` for anything else.
    pub fn of_regular_file(path: &Path) -> Option<Stamp> {
        regular_file_stamp(path)
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

#[cfg(unix)]
fn change_time_of_open(_file: &File, metadata: &Metadata) -> i64 {
    change_time_ns(metadata)
}

#[cfg(unix)]
fn regular_file_stamp(path: &Path) -> Option<Stamp> {
    let metadata = std::fs::symlink_metadata(path).ok()?;
    (metadata.is_file() && !metadata.file_type().is_symlink())
        .then(|| Stamp::with_change_time(&metadata, change_time_ns(&metadata)))
}

/// Whether every file under `root` carries a change time, without which a same-size rewrite whose
/// modified time was put back looks unchanged.
#[cfg(unix)]
pub(crate) fn change_time_is_kept(_root: &Path) -> bool {
    true
}

#[cfg(windows)]
fn change_time_of_open(file: &File, _metadata: &Metadata) -> i64 {
    windows::change_time(file)
}

#[cfg(windows)]
fn regular_file_stamp(path: &Path) -> Option<Stamp> {
    // One open, as `symlink_metadata` itself does on Windows, never following a reparse point.
    let file = windows::open_attributes(path)?;
    let metadata = file.metadata().ok()?;
    (metadata.is_file() && !metadata.file_type().is_symlink())
        .then(|| Stamp::with_change_time(&metadata, windows::change_time(&file)))
}

#[cfg(windows)]
pub(crate) fn change_time_is_kept(root: &Path) -> bool {
    windows::file_system_name(root)
        .is_some_and(|name| name.eq_ignore_ascii_case("NTFS") || name.eq_ignore_ascii_case("ReFS"))
}

#[cfg(windows)]
mod windows {
    use std::fs::{File, OpenOptions};
    use std::os::windows::fs::OpenOptionsExt;
    use std::os::windows::io::AsRawHandle;
    use std::path::Path;
    use windows_sys::Win32::Storage::FileSystem::{
        FileBasicInfo, GetFileInformationByHandleEx, GetVolumeInformationByHandleW,
        FILE_BASIC_INFO, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT,
        FILE_READ_ATTRIBUTES,
    };

    /// 100-nanosecond ticks from 1601-01-01 to 1970-01-01.
    const UNIX_EPOCH_TICKS: i64 = 116_444_736_000_000_000;

    /// Opened for its attributes only, never through a link; a folder opens too.
    pub(super) fn open_attributes(path: &Path) -> Option<File> {
        OpenOptions::new()
            .access_mode(FILE_READ_ATTRIBUTES)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS)
            .open(path)
            .ok()
    }

    /// `ChangeTime` in nanoseconds since the Unix epoch, or 0 when the volume keeps none.
    pub(super) fn change_time(file: &File) -> i64 {
        let mut info = FILE_BASIC_INFO::default();
        let size = u32::try_from(std::mem::size_of::<FILE_BASIC_INFO>()).unwrap_or(0);
        // SAFETY: the handle stays open for the call, and `info` is a FILE_BASIC_INFO of `size`
        // bytes, the buffer FileBasicInfo writes.
        let read = unsafe {
            GetFileInformationByHandleEx(
                file.as_raw_handle(),
                FileBasicInfo,
                (&mut info as *mut FILE_BASIC_INFO).cast(),
                size,
            )
        };
        if read == 0 || info.ChangeTime <= 0 {
            return 0;
        }
        info.ChangeTime
            .saturating_sub(UNIX_EPOCH_TICKS)
            .saturating_mul(100)
    }

    /// The name of the file system holding `path` ("NTFS", "ReFS", "exFAT", "FAT32"…).
    pub(super) fn file_system_name(path: &Path) -> Option<String> {
        let folder = open_attributes(path)?;
        let mut name = [0u16; 64];
        let length = u32::try_from(name.len()).unwrap_or(0);
        // SAFETY: the handle stays open for the call; only the file-system name is requested,
        // into `name` of `length` UTF-16 units, and every other out pointer is null.
        let read = unsafe {
            GetVolumeInformationByHandleW(
                folder.as_raw_handle(),
                std::ptr::null_mut(),
                0,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                name.as_mut_ptr(),
                length,
            )
        };
        if read == 0 {
            return None;
        }
        let end = name
            .iter()
            .position(|&unit| unit == 0)
            .unwrap_or(name.len());
        Some(String::from_utf16_lossy(name.get(..end)?))
    }
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
pub(crate) const RACY_WINDOW_NS: i64 = 2_000_000_000;

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
