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
use std::path::{Path, PathBuf};

/// What an open handle says about its file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct FileFacts {
    /// A regular file with one name that is not a link.
    pub plain: bool,
    /// A regular file, whatever its names: not a folder, a pipe, a device or a link itself.
    pub regular: bool,
    pub size: u64,
    pub modified_ns: i128,
    /// The inode change time on Unix (`ctime`) and the NTFS change time (`ChangeTime`) on Windows.
    /// Zero on a Windows volume that keeps none (FAT, exFAT).
    pub changed_ns: i128,
    /// Device and inode on Unix; volume serial number and file index on Windows.
    pub identity: (u64, u64),
}

/// Which file a name led to when it was read: device and inode on Unix, volume serial number and
/// file index on Windows. A file replaced under the same name (a link, a hard link, a copy with the
/// same text) has another identity, which a text comparison cannot tell.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FileIdentity((u64, u64));

impl FileIdentity {
    pub(crate) fn of(facts: &FileFacts) -> Self {
        Self(facts.identity)
    }

    /// Whether `path` still names a plain file of this identity, reached without following a link.
    pub(crate) fn is_still_at(self, path: &Path) -> bool {
        open_read(path)
            .and_then(|file| facts_of(&file))
            .is_ok_and(|facts| facts.plain && Self::of(&facts) == self)
    }
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

    /// Follows a link, as a vault file reached through one is read; `O_NONBLOCK` still keeps a pipe
    /// at the name from hanging the open.
    pub(super) fn open_following(path: &Path) -> io::Result<File> {
        let descriptor: OwnedFd = rustix::fs::open(
            path,
            OFlags::RDONLY | OFlags::NONBLOCK | OFlags::CLOEXEC,
            Mode::empty(),
        )
        .map_err(io::Error::from)?;
        Ok(File::from(descriptor))
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

    /// `fcntl(F_GETPATH)` fills the path the kernel holds for the vnode.
    #[cfg(target_vendor = "apple")]
    pub(super) fn path_of(file: &File) -> io::Result<PathBuf> {
        use std::os::unix::ffi::OsStringExt;
        let path = rustix::fs::getpath(file).map_err(io::Error::from)?;
        Ok(PathBuf::from(std::ffi::OsString::from_vec(path.into_bytes())))
    }

    /// The link `/proc/self/fd/<n>` names the file the descriptor is open on, every folder resolved.
    #[cfg(not(target_vendor = "apple"))]
    pub(super) fn path_of(file: &File) -> io::Result<PathBuf> {
        use std::os::fd::AsRawFd;
        std::fs::read_link(format!("/proc/self/fd/{}", file.as_raw_fd()))
    }

    pub(super) fn facts(metadata: &Metadata, _file: &File) -> io::Result<FileFacts> {
        Ok(facts_of_metadata(metadata))
    }

    /// One `stat` of the name, following a link, with no open: a pipe at the name is not opened.
    pub(super) fn facts_at(path: &Path) -> io::Result<FileFacts> {
        std::fs::metadata(path).map(|metadata| facts_of_metadata(&metadata))
    }

    /// The facts of each path, following links, with one `stat` relative to the folder the path is
    /// in: consecutive paths in one folder (a sorted listing) reuse its open handle, so the kernel
    /// resolves one name per file instead of every folder above it.
    pub(super) fn facts_of_paths(paths: &[&Path]) -> Vec<io::Result<FileFacts>> {
        let mut folder: Option<(&Path, OwnedFd)> = None;
        paths
            .iter()
            .map(|path| {
                let (Some(parent), Some(name)) = (path.parent(), path.file_name()) else {
                    return facts_at(path);
                };
                if folder.as_ref().is_none_or(|(open, _)| *open != parent) {
                    match rustix::fs::open(
                        parent,
                        OFlags::RDONLY | OFlags::DIRECTORY | OFlags::CLOEXEC,
                        Mode::empty(),
                    ) {
                        Ok(descriptor) => folder = Some((parent, descriptor)),
                        // The folder is gone or closed to us: the one-file question answers.
                        Err(_) => return facts_at(path),
                    }
                }
                let Some((_, descriptor)) = folder.as_ref() else {
                    return facts_at(path);
                };
                rustix::fs::statat(descriptor, name, rustix::fs::AtFlags::empty())
                    .map(|stat| facts_of_stat(&stat))
                    .map_err(io::Error::from)
            })
            .collect()
    }

    #[allow(
        clippy::cast_sign_loss,
        clippy::cast_possible_truncation,
        clippy::unnecessary_cast,
        reason = "the same casts `std::os::unix::fs::MetadataExt` makes, so a stamp read this way equals one read from a handle"
    )]
    fn facts_of_stat(stat: &rustix::fs::Stat) -> FileFacts {
        let regular = rustix::fs::FileType::from_raw_mode(stat.st_mode as rustix::fs::RawMode)
            == rustix::fs::FileType::RegularFile;
        FileFacts {
            plain: regular && stat.st_nlink == 1,
            regular,
            size: stat.st_size as u64,
            modified_ns: i128::from(stat.st_mtime as i64) * 1_000_000_000
                + i128::from(stat.st_mtime_nsec as i64),
            changed_ns: i128::from(stat.st_ctime as i64) * 1_000_000_000
                + i128::from(stat.st_ctime_nsec as i64),
            identity: (stat.st_dev as u64, stat.st_ino as u64),
        }
    }

    fn facts_of_metadata(metadata: &Metadata) -> FileFacts {
        FileFacts {
            plain: metadata.is_file() && metadata.nlink() == 1,
            regular: metadata.is_file(),
            size: metadata.size(),
            modified_ns: i128::from(metadata.mtime()) * 1_000_000_000
                + i128::from(metadata.mtime_nsec()),
            changed_ns: i128::from(metadata.ctime()) * 1_000_000_000
                + i128::from(metadata.ctime_nsec()),
            identity: (metadata.dev(), metadata.ino()),
        }
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
        FILE_FLAG_OPEN_REPARSE_POINT, GetFinalPathNameByHandleW,
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

    /// Follows a link, as a vault file reached through one is read.
    pub(super) fn open_following(path: &Path) -> io::Result<File> {
        OpenOptions::new().read(true).open(path)
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

    /// `GetFinalPathNameByHandleW` with `VOLUME_NAME_DOS` and `FILE_NAME_NORMALIZED` (both zero)
    /// returns the path of the opened file with every link resolved, as `\\?\C:\...`
    /// (Microsoft, "GetFinalPathNameByHandleW"). The prefix is dropped as [`real_path`] drops it.
    ///
    /// [`real_path`]: crate::real_paths::real_path
    pub(super) fn path_of(file: &File) -> io::Result<PathBuf> {
        use std::os::windows::ffi::OsStringExt;
        let mut buffer = vec![0u16; 1024];
        loop {
            // SAFETY: the handle stays open for the call, and `buffer` is as long as the length passed.
            let length = unsafe {
                GetFinalPathNameByHandleW(
                    file.as_raw_handle(),
                    buffer.as_mut_ptr(),
                    buffer.len() as u32,
                    0,
                )
            } as usize;
            if length == 0 {
                return Err(io::Error::last_os_error());
            }
            // A result longer than the buffer is the length needed, with the final nul.
            if length >= buffer.len() {
                buffer.resize(length + 1, 0);
                continue;
            }
            let path = PathBuf::from(std::ffi::OsString::from_wide(&buffer[..length]));
            return Ok(dunce::simplified(&path).to_path_buf());
        }
    }

    /// The facts of the file at `path`, following a link, from a handle opened for the look.
    pub(super) fn facts_at(path: &Path) -> io::Result<FileFacts> {
        let file = open_following(path)?;
        facts(&file.metadata()?, &file)
    }

    pub(super) fn facts_of_paths(paths: &[&Path]) -> Vec<io::Result<FileFacts>> {
        paths.iter().map(|path| facts_at(path)).collect()
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
        let regular = info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY == 0 && !is_link;
        Ok(FileFacts {
            plain: regular && info.nNumberOfLinks == 1,
            regular,
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

pub(crate) fn open_following(path: &Path) -> io::Result<File> {
    platform::open_following(path)
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

/// The path the open handle `file` leads to with every link resolved, asked of the kernel, not
/// derived from the name that was opened: a folder swapped for a link after a path was checked
/// shows here, which `O_NOFOLLOW` on the last component does not catch.
pub(crate) fn path_of(file: &File) -> io::Result<PathBuf> {
    platform::path_of(file)
}

/// The facts of the file at `path`, following a link. On Unix one `stat` and no open.
pub(crate) fn facts_at(path: &Path) -> io::Result<FileFacts> {
    platform::facts_at(path)
}

/// [`facts_at`] for each path, in order; on Unix, consecutive paths in one folder share one open
/// handle to it.
pub(crate) fn facts_of_paths(paths: &[&Path]) -> Vec<io::Result<FileFacts>> {
    platform::facts_of_paths(paths)
}

/// The facts of the file `file` is open on.
pub(crate) fn facts_of(file: &File) -> io::Result<FileFacts> {
    let metadata = file.metadata()?;
    platform::facts(&metadata, file)
}
