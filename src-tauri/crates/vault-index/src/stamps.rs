//! What identifies a file version without reading it, and when that is not enough.

use sha2::{Digest, Sha256};
use std::fs::{File, Metadata};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Modified time and size, plus change time, which also moves when a tool restores the modified
/// time after rewriting a file: Unix `ctime`, NTFS and ReFS `ChangeTime`. A stamp taken through a
/// `Volume` has `ctime_ns` 0 unless that volume vouches for the file: such a stamp never stands for
/// the file's content (no row; the search index compares the hash).
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

    /// The stamp of the regular file at `path`, never through a link: `None` for anything else.
    /// As the file system reports it, whether or not any volume would vouch for it.
    pub fn of_regular_file(path: &Path) -> Option<Stamp> {
        regular_file_stamp(path).map(|(stamp, _)| stamp)
    }

    /// Whether the stamp may stand for the file's content (see `Volume`).
    pub(crate) fn is_vouched(&self) -> bool {
        self.ctime_ns != 0
    }
}

/// The volume a vault root sits on: whether its file system keeps a change time worth the name
/// (`stamps_are_trusted`), and its device, so a file on another volume mounted inside the vault
/// (a USB drive under `vault/usb`) is not taken on the root's word.
#[derive(Clone, Copy, Debug)]
pub struct Volume {
    trusted: bool,
    device: Option<u64>,
}

impl Volume {
    pub fn of(root: &Path) -> Volume {
        let device = device_of_path(root);
        Volume {
            trusted: device.is_some() && stamps_are_trusted(root),
            device,
        }
    }

    /// `of_regular_file`, with the change time kept only when this volume vouches for the file.
    pub fn stamp(&self, path: &Path) -> Option<Stamp> {
        regular_file_stamp(path).map(|(stamp, device)| self.vouch(stamp, device))
    }

    /// The stamp of a file already open, from its own handle.
    pub fn stamp_open(&self, file: &File, metadata: &Metadata) -> Stamp {
        let (stamp, device) = open_stamp(file, metadata);
        self.vouch(stamp, device)
    }

    #[cfg(test)]
    pub(crate) fn untrusted() -> Volume {
        Volume {
            trusted: false,
            device: None,
        }
    }

    fn vouch(&self, stamp: Stamp, device: Option<u64>) -> Stamp {
        if self.trusted && device.is_some() && device == self.device {
            stamp
        } else {
            Stamp {
                ctime_ns: 0,
                ..stamp
            }
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

#[cfg(unix)]
fn device_of(metadata: &Metadata) -> Option<u64> {
    use std::os::unix::fs::MetadataExt;
    #[allow(clippy::unnecessary_cast)]
    Some(metadata.dev() as u64)
}

#[cfg(unix)]
fn device_of_path(path: &Path) -> Option<u64> {
    device_of(&std::fs::metadata(path).ok()?)
}

#[cfg(unix)]
fn open_stamp(_file: &File, metadata: &Metadata) -> (Stamp, Option<u64>) {
    (
        Stamp::with_change_time(metadata, change_time_ns(metadata)),
        device_of(metadata),
    )
}

#[cfg(unix)]
fn regular_file_stamp(path: &Path) -> Option<(Stamp, Option<u64>)> {
    let metadata = std::fs::symlink_metadata(path).ok()?;
    (metadata.is_file() && !metadata.file_type().is_symlink()).then(|| {
        (
            Stamp::with_change_time(&metadata, change_time_ns(&metadata)),
            device_of(&metadata),
        )
    })
}

#[cfg(windows)]
fn device_of_path(path: &Path) -> Option<u64> {
    windows::volume_serial(&windows::open_attributes(path)?)
}

#[cfg(windows)]
fn open_stamp(file: &File, metadata: &Metadata) -> (Stamp, Option<u64>) {
    (
        Stamp::with_change_time(metadata, windows::change_time(file)),
        windows::volume_serial(file),
    )
}

#[cfg(windows)]
fn regular_file_stamp(path: &Path) -> Option<(Stamp, Option<u64>)> {
    // One open, as `symlink_metadata` itself does on Windows, never following a reparse point.
    let file = windows::open_attributes(path)?;
    let metadata = file.metadata().ok()?;
    (metadata.is_file() && !metadata.file_type().is_symlink()).then(|| open_stamp(&file, &metadata))
}

/// Whether a file's stamp can stand for its content on the volume holding `root`: only on file
/// systems known to move the change time on every write. FAT and exFAT keep none (macOS reports
/// the modified time in its place, so putting the modified time back puts the "change time" back
/// too), and a network or unknown file system answers with whatever the server or driver keeps.
/// Everywhere else nothing may be skipped on its stamp alone.
pub(crate) fn stamps_are_trusted(root: &Path) -> bool {
    volume::trusted(root)
}

/// File systems named as macOS `statfs` (`f_fstypename`) and Windows `GetVolumeInformation` name
/// them, whose change time moves on every write.
#[cfg_attr(target_os = "linux", allow(dead_code))]
pub(crate) fn trusted_by_name(name: &str) -> bool {
    ["apfs", "hfs", "ntfs", "refs"]
        .iter()
        .any(|trusted| name.eq_ignore_ascii_case(trusted))
}

/// Linux `statfs` magic numbers (`f_type`) of file systems whose change time moves on every write:
/// ext2/3/4, btrfs, xfs, and tmpfs (kept by the kernel itself).
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub(crate) fn trusted_by_magic(magic: i64) -> bool {
    const EXT4: i64 = 0xEF53;
    const BTRFS: i64 = 0x9123_683E;
    const XFS: i64 = 0x5846_5342;
    const TMPFS: i64 = 0x0102_1994;
    matches!(magic, EXT4 | BTRFS | XFS | TMPFS)
}

#[cfg(target_os = "macos")]
mod volume {
    use std::os::unix::ffi::OsStrExt;
    use std::path::Path;

    pub(super) fn trusted(root: &Path) -> bool {
        let Ok(path) = std::ffi::CString::new(root.as_os_str().as_bytes()) else {
            return false;
        };
        // SAFETY: `statfs` is plain data, for which all zero bytes is a valid value.
        let mut info: libc::statfs = unsafe { std::mem::zeroed() };
        // SAFETY: `path` is NUL-terminated and outlives the call, and `info` is the statfs buffer
        // the call fills.
        if unsafe { libc::statfs(path.as_ptr(), &mut info) } != 0 {
            return false;
        }
        let name: Vec<u8> = info
            .f_fstypename
            .iter()
            .take_while(|&&unit| unit != 0)
            .map(|&unit| unit as u8)
            .collect();
        super::trusted_by_name(&String::from_utf8_lossy(&name))
    }
}

#[cfg(target_os = "linux")]
mod volume {
    use std::os::unix::ffi::OsStrExt;
    use std::path::Path;

    pub(super) fn trusted(root: &Path) -> bool {
        let Ok(path) = std::ffi::CString::new(root.as_os_str().as_bytes()) else {
            return false;
        };
        // SAFETY: `statfs` is plain data, for which all zero bytes is a valid value.
        let mut info: libc::statfs = unsafe { std::mem::zeroed() };
        // SAFETY: `path` is NUL-terminated and outlives the call, and `info` is the statfs buffer
        // the call fills.
        if unsafe { libc::statfs(path.as_ptr(), &mut info) } != 0 {
            return false;
        }
        // `f_type`'s width differs between targets.
        #[allow(clippy::unnecessary_cast)]
        let magic = info.f_type as i64;
        super::trusted_by_magic(magic)
    }
}

#[cfg(windows)]
mod volume {
    use std::path::Path;

    pub(super) fn trusted(root: &Path) -> bool {
        super::windows::file_system_name(root).is_some_and(|name| super::trusted_by_name(&name))
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
mod volume {
    pub(super) fn trusted(_root: &std::path::Path) -> bool {
        false
    }
}

#[cfg(windows)]
mod windows {
    use std::fs::{File, OpenOptions};
    use std::os::windows::fs::OpenOptionsExt;
    use std::os::windows::io::AsRawHandle;
    use std::path::Path;
    use windows_sys::Win32::Storage::FileSystem::{
        FileBasicInfo, GetFileInformationByHandle, GetFileInformationByHandleEx,
        GetVolumeInformationByHandleW, BY_HANDLE_FILE_INFORMATION, FILE_BASIC_INFO,
        FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_READ_ATTRIBUTES,
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

    /// The serial number of the volume holding the open file or folder.
    pub(super) fn volume_serial(file: &File) -> Option<u64> {
        let mut info = BY_HANDLE_FILE_INFORMATION::default();
        // SAFETY: the handle stays open for the call, and `info` is the structure it fills.
        let read = unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) };
        (read != 0).then_some(u64::from(info.dwVolumeSerialNumber))
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
    fn only_file_systems_that_move_the_change_time_on_every_write_are_trusted() {
        for name in ["apfs", "hfs", "NTFS", "ReFS"] {
            assert!(trusted_by_name(name), "{name}");
        }
        for name in [
            "msdos", "exfat", "FAT32", "FAT", "exFAT", "smbfs", "nfs", "webdav", "afpfs", "", "zfs",
        ] {
            assert!(!trusted_by_name(name), "{name}");
        }
        for magic in [0xEF53, 0x9123_683E, 0x5846_5342, 0x0102_1994] {
            assert!(trusted_by_magic(magic), "{magic:#x}");
        }
        // vfat, exfat, nfs, cifs, smb2, fuse, overlayfs.
        for magic in [
            0x4d44,
            0x2011_BAB0,
            0x6969,
            0xFF53_4D42,
            0xFE53_4D42,
            0x6573_5546,
            0x794C_7630,
        ] {
            assert!(!trusted_by_magic(magic), "{magic:#x}");
        }
    }

    #[test]
    fn the_test_folder_volume_is_trusted() {
        assert!(stamps_are_trusted(&std::env::temp_dir()));
    }

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
