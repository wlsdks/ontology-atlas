//! Opening a file that must be a plain file: opened without following a link, and judged by the facts
//! of the handle that was opened, not by what the name said a moment before.
//!
//! "Plain" is a regular file with one name that is not a link. A vault comes from Git or a sync
//! client, so a stranger may have committed `activity.jsonl -> ~/.ssh/authorized_keys`.
//!
//! - macOS and Linux: `open(2)` with `O_NOFOLLOW` fails with `ELOOP` on a link, and `O_NONBLOCK` keeps
//!   a FIFO planted at the name from hanging the open. `fstat` on the descriptor then gives the file
//!   type, the link count, and the identity (device and inode).
//! - Windows: `FILE_FLAG_OPEN_REPARSE_POINT` opens a link as the link itself, and
//!   `GetFileInformationByHandle` gives the attributes, the number of links, and the identity (volume
//!   serial number and file index). A reparse point whose tag is a name surrogate (a symbolic link
//!   or a junction) is refused. Other reparse points, such as a OneDrive or Dropbox placeholder, are
//!   plain files that are not promised to keep their size, times or file index while the sync client
//!   fills them: their identity is unknown, so a replace that compares revisions may refuse
//!   (safe), and an append is unaffected.

use std::fs::{File, Metadata};
use std::io;
use std::path::Path;

/// What an open handle says about its file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct FileFacts {
    /// A regular file with one name that is not a link.
    pub plain: bool,
    pub size: u64,
    pub modified_ns: i128,
    /// The inode change time on Unix (`ctime`) and the NTFS change time (`ChangeTime`) on Windows.
    /// Zero on a Windows volume that keeps none (FAT, exFAT).
    pub changed_ns: i128,
    /// Device and inode on Unix; volume serial number and file index on Windows.
    pub identity: (u64, u64),
}

#[cfg(unix)]
mod platform {
    use std::os::fd::OwnedFd;
    use std::os::unix::fs::MetadataExt;

    use rustix::fs::{Mode, OFlags};

    use super::*;

    fn open(path: &Path, flags: OFlags, mode: Mode) -> io::Result<File> {
        let descriptor: OwnedFd =
            rustix::fs::open(path, flags | OFlags::NOFOLLOW | OFlags::CLOEXEC, mode)
                .map_err(io::Error::from)?;
        Ok(File::from(descriptor))
    }

    pub(super) fn open_read(path: &Path) -> io::Result<File> {
        open(path, OFlags::RDONLY | OFlags::NONBLOCK, Mode::empty())
    }

    pub(super) fn open_append(path: &Path) -> io::Result<File> {
        open(
            path,
            OFlags::RDWR | OFlags::APPEND | OFlags::NONBLOCK,
            Mode::empty(),
        )
    }

    /// `O_CREAT | O_EXCL` never follows a link planted at the name: it fails with `EEXIST`.
    pub(super) fn create_append(path: &Path) -> io::Result<File> {
        open(
            path,
            OFlags::RDWR | OFlags::APPEND | OFlags::CREATE | OFlags::EXCL,
            Mode::RUSR | Mode::WUSR,
        )
    }

    pub(super) fn create_new(path: &Path) -> io::Result<File> {
        open(
            path,
            OFlags::WRONLY | OFlags::CREATE | OFlags::EXCL,
            Mode::RUSR | Mode::WUSR,
        )
    }

    pub(super) fn is_link_refusal(error: &io::Error) -> bool {
        error.raw_os_error() == Some(rustix::io::Errno::LOOP.raw_os_error())
    }

    pub(super) fn facts(metadata: &Metadata, _file: &File) -> io::Result<FileFacts> {
        Ok(FileFacts {
            plain: metadata.is_file() && metadata.nlink() == 1,
            size: metadata.size(),
            modified_ns: i128::from(metadata.mtime()) * 1_000_000_000
                + i128::from(metadata.mtime_nsec()),
            changed_ns: i128::from(metadata.ctime()) * 1_000_000_000
                + i128::from(metadata.ctime_nsec()),
            identity: (metadata.dev(), metadata.ino()),
        })
    }
}

#[cfg(windows)]
mod platform {
    use std::fs::OpenOptions;
    use std::os::windows::fs::OpenOptionsExt;
    use std::os::windows::io::AsRawHandle;

    use windows_sys::Win32::Storage::FileSystem::{
        FileAttributeTagInfo, FileBasicInfo, GetFileInformationByHandle,
        GetFileInformationByHandleEx, BY_HANDLE_FILE_INFORMATION, FILE_ATTRIBUTE_DIRECTORY,
        FILE_ATTRIBUTE_REPARSE_POINT, FILE_ATTRIBUTE_TAG_INFO, FILE_BASIC_INFO,
        FILE_FLAG_OPEN_REPARSE_POINT,
    };

    use super::*;

    /// 100-nanosecond ticks from 1601-01-01 to 1970-01-01.
    const UNIX_EPOCH_TICKS: i64 = 116_444_736_000_000_000;
    /// A reparse tag with this bit set names another file system object: a symbolic link, a
    /// junction (Microsoft, "Reparse Point Tags", `IsReparseTagNameSurrogate`).
    const NAME_SURROGATE_BIT: u32 = 0x2000_0000;

    fn options() -> OpenOptions {
        let mut options = OpenOptions::new();
        options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
        options
    }

    pub(super) fn open_read(path: &Path) -> io::Result<File> {
        options().read(true).open(path)
    }

    /// `FILE_APPEND_DATA` without `FILE_WRITE_DATA`, which `append(true)` asks for.
    pub(super) fn open_append(path: &Path) -> io::Result<File> {
        options().read(true).append(true).open(path)
    }

    pub(super) fn create_append(path: &Path) -> io::Result<File> {
        options()
            .read(true)
            .append(true)
            .create_new(true)
            .open(path)
    }

    pub(super) fn create_new(path: &Path) -> io::Result<File> {
        options().write(true).create_new(true).open(path)
    }

    /// A link is opened as itself on Windows and refused by [`facts`], never by the open.
    pub(super) fn is_link_refusal(_: &io::Error) -> bool {
        false
    }

    fn ticks_to_ns(ticks: u64) -> i128 {
        (i128::from(ticks) - i128::from(UNIX_EPOCH_TICKS)) * 100
    }

    pub(super) fn facts(_: &Metadata, file: &File) -> io::Result<FileFacts> {
        let mut info = BY_HANDLE_FILE_INFORMATION::default();
        // SAFETY: the handle stays open for the call, and `info` is the structure it fills.
        if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0 {
            return Err(io::Error::last_os_error());
        }
        let mut tag = FILE_ATTRIBUTE_TAG_INFO::default();
        // SAFETY: the handle stays open for the call, and `tag` is a FILE_ATTRIBUTE_TAG_INFO of
        // the size passed, the buffer FileAttributeTagInfo writes.
        let tagged = unsafe {
            GetFileInformationByHandleEx(
                file.as_raw_handle(),
                FileAttributeTagInfo,
                (&mut tag as *mut FILE_ATTRIBUTE_TAG_INFO).cast(),
                std::mem::size_of::<FILE_ATTRIBUTE_TAG_INFO>() as u32,
            )
        };
        let is_reparse_point = info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0;
        // A reparse point whose tag cannot be read is not trusted to be a placeholder.
        let is_link = is_reparse_point && (tagged == 0 || tag.ReparseTag & NAME_SURROGATE_BIT != 0);
        let mut basic = FILE_BASIC_INFO::default();
        // SAFETY: as above, with a FILE_BASIC_INFO.
        let basic_read = unsafe {
            GetFileInformationByHandleEx(
                file.as_raw_handle(),
                FileBasicInfo,
                (&mut basic as *mut FILE_BASIC_INFO).cast(),
                std::mem::size_of::<FILE_BASIC_INFO>() as u32,
            )
        };
        let changed_ns = if basic_read != 0 && basic.ChangeTime > 0 {
            ticks_to_ns(basic.ChangeTime as u64)
        } else {
            0
        };
        let written = u64::from(info.ftLastWriteTime.dwHighDateTime) << 32
            | u64::from(info.ftLastWriteTime.dwLowDateTime);
        Ok(FileFacts {
            plain: info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY == 0
                && !is_link
                && info.nNumberOfLinks == 1,
            size: u64::from(info.nFileSizeHigh) << 32 | u64::from(info.nFileSizeLow),
            modified_ns: ticks_to_ns(written),
            changed_ns,
            identity: (
                u64::from(info.dwVolumeSerialNumber),
                u64::from(info.nFileIndexHigh) << 32 | u64::from(info.nFileIndexLow),
            ),
        })
    }
}

pub(crate) fn open_read(path: &Path) -> io::Result<File> {
    platform::open_read(path)
}

pub(crate) fn open_append(path: &Path) -> io::Result<File> {
    platform::open_append(path)
}

pub(crate) fn create_append(path: &Path) -> io::Result<File> {
    platform::create_append(path)
}

pub(crate) fn create_new(path: &Path) -> io::Result<File> {
    platform::create_new(path)
}

/// Whether an open failed because the name is a link the open refused to follow.
pub(crate) fn is_link_refusal(error: &io::Error) -> bool {
    platform::is_link_refusal(error)
}

/// The facts of the file `file` is open on.
pub(crate) fn facts_of(file: &File) -> io::Result<FileFacts> {
    let metadata = file.metadata()?;
    platform::facts(&metadata, file)
}
