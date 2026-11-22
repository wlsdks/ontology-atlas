//! Opens one settings file below a base without following a link at any component below it,
//! and reads at most `SETTINGS_MAX_BYTES`. A failure is a code; it never carries file content.

use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::time::UNIX_EPOCH;

pub(super) const SETTINGS_MAX_BYTES: u64 = 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum OpenFailure {
    Missing,
    Link,
    NotAFile,
    NotAFolder,
    PermissionDenied,
    TooLarge,
    Io,
}

pub(super) struct SettingsBytes {
    pub bytes: Vec<u8>,
    pub size: u64,
    pub modified_ms: Option<u64>,
}

#[cfg(test)]
thread_local! {
    pub(super) static OPENED: std::cell::RefCell<Vec<std::path::PathBuf>> =
        const { std::cell::RefCell::new(Vec::new()) };
}

fn io_failure(error: &std::io::Error) -> OpenFailure {
    match error.kind() {
        std::io::ErrorKind::NotFound => OpenFailure::Missing,
        std::io::ErrorKind::PermissionDenied => OpenFailure::PermissionDenied,
        _ => OpenFailure::Io,
    }
}

/// `base` is resolved first; `relative` names the folders and the file below it.
pub(super) fn read_settings_below(
    base: &Path,
    relative: &[&str],
) -> Result<SettingsBytes, OpenFailure> {
    #[cfg(test)]
    OPENED.with(|opened| {
        let mut path = base.to_path_buf();
        path.extend(relative);
        opened.borrow_mut().push(path);
    });
    let base = fs::canonicalize(base).map_err(|error| io_failure(&error))?;
    let file = open_below(&base, relative)?;
    read_bounded(file)
}

fn read_bounded(file: fs::File) -> Result<SettingsBytes, OpenFailure> {
    let metadata = file.metadata().map_err(|error| io_failure(&error))?;
    if !metadata.is_file() {
        return Err(OpenFailure::NotAFile);
    }
    if metadata.len() > SETTINGS_MAX_BYTES {
        return Err(OpenFailure::TooLarge);
    }
    let mut bytes = Vec::new();
    file.take(SETTINGS_MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| io_failure(&error))?;
    if bytes.len() as u64 > SETTINGS_MAX_BYTES {
        return Err(OpenFailure::TooLarge);
    }
    let modified_ms = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|elapsed| elapsed.as_millis() as u64);
    Ok(SettingsBytes {
        size: bytes.len() as u64,
        bytes,
        modified_ms,
    })
}

#[cfg(unix)]
fn open_below(base: &Path, relative: &[&str]) -> Result<fs::File, OpenFailure> {
    use std::ffi::CString;
    use std::os::fd::FromRawFd;
    use std::os::unix::ffi::OsStrExt;

    let root = unsafe {
        libc::open(
            c"/".as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC,
        )
    };
    if root < 0 {
        return Err(OpenFailure::Io);
    }
    let mut current = unsafe { fs::File::from_raw_fd(root) };
    let mut names = Vec::new();
    for component in base.components() {
        match component {
            std::path::Component::RootDir => {}
            std::path::Component::Normal(part) => names.push(part.as_bytes().to_vec()),
            _ => return Err(OpenFailure::Io),
        }
    }
    names.extend(relative.iter().map(|part| part.as_bytes().to_vec()));
    let Some((file_name, folders)) = names.split_last() else {
        return Err(OpenFailure::Io);
    };
    for folder in folders {
        let name = CString::new(folder.as_slice()).map_err(|_| OpenFailure::Io)?;
        current = open_at(&current, &name, libc::O_DIRECTORY)?;
    }
    let name = CString::new(file_name.as_slice()).map_err(|_| OpenFailure::Io)?;
    open_at(&current, &name, libc::O_NONBLOCK)
}

#[cfg(unix)]
fn open_at(
    folder: &fs::File,
    name: &std::ffi::CStr,
    flags: libc::c_int,
) -> Result<fs::File, OpenFailure> {
    use std::os::fd::{AsRawFd, FromRawFd};

    let fd = unsafe {
        libc::openat(
            folder.as_raw_fd(),
            name.as_ptr(),
            libc::O_RDONLY | libc::O_CLOEXEC | libc::O_NOFOLLOW | flags,
        )
    };
    if fd >= 0 {
        return Ok(unsafe { fs::File::from_raw_fd(fd) });
    }
    let error = std::io::Error::last_os_error();
    let mut entry: libc::stat = unsafe { std::mem::zeroed() };
    let found = unsafe {
        libc::fstatat(
            folder.as_raw_fd(),
            name.as_ptr(),
            &mut entry,
            libc::AT_SYMLINK_NOFOLLOW,
        )
    } == 0;
    if found && entry.st_mode & libc::S_IFMT == libc::S_IFLNK {
        return Err(OpenFailure::Link);
    }
    Err(match error.raw_os_error() {
        Some(libc::ELOOP) => OpenFailure::Link,
        Some(libc::ENOTDIR) => OpenFailure::NotAFolder,
        _ => io_failure(&error),
    })
}

#[cfg(windows)]
fn open_below(base: &Path, relative: &[&str]) -> Result<fs::File, OpenFailure> {
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;

    let Some((file_name, folders)) = relative.split_last() else {
        return Err(OpenFailure::Io);
    };
    let mut path = base.to_path_buf();
    for folder in folders {
        path.push(folder);
        let metadata = fs::symlink_metadata(&path).map_err(|error| io_failure(&error))?;
        if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(OpenFailure::Link);
        }
        if !metadata.is_dir() {
            return Err(OpenFailure::NotAFolder);
        }
    }
    path.push(file_name);
    let file = fs::OpenOptions::new()
        .read(true)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(&path)
        .map_err(|error| io_failure(&error))?;
    let metadata = file.metadata().map_err(|error| io_failure(&error))?;
    if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(OpenFailure::Link);
    }
    Ok(file)
}

#[cfg(not(any(unix, windows)))]
fn open_below(_base: &Path, _relative: &[&str]) -> Result<fs::File, OpenFailure> {
    Err(OpenFailure::Io)
}
