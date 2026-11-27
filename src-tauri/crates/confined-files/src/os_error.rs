//! A failed file call as a value: which call, on which path, and the operating system's answer
//! as the closed set of codes JavaScript names.

use std::io;
use std::path::PathBuf;

/// The error codes Node prints for the failures a file write meets.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OsErrorCode {
    PermissionDenied,
    NotPermitted,
    NotFound,
    AlreadyExists,
    IsADirectory,
    NotADirectory,
    DirectoryNotEmpty,
    ReadOnlyFileSystem,
    TooManyLinks,
    NameTooLong,
    NoSpace,
    /// Any other failure, which Node would name by its own code.
    Other,
}

impl OsErrorCode {
    /// What the failure is, from the raw error number where the platform gives one and from the
    /// error kind otherwise.
    pub fn of(error: &io::Error) -> Self {
        #[cfg(unix)]
        if let Some(raw) = error.raw_os_error() {
            use rustix::io::Errno;
            let errno = Errno::from_raw_os_error(raw);
            let known = if errno == Errno::ACCESS {
                Some(Self::PermissionDenied)
            } else if errno == Errno::PERM {
                Some(Self::NotPermitted)
            } else if errno == Errno::NOENT {
                Some(Self::NotFound)
            } else if errno == Errno::EXIST {
                Some(Self::AlreadyExists)
            } else if errno == Errno::ISDIR {
                Some(Self::IsADirectory)
            } else if errno == Errno::NOTDIR {
                Some(Self::NotADirectory)
            } else if errno == Errno::NOTEMPTY {
                Some(Self::DirectoryNotEmpty)
            } else if errno == Errno::ROFS {
                Some(Self::ReadOnlyFileSystem)
            } else if errno == Errno::LOOP {
                Some(Self::TooManyLinks)
            } else if errno == Errno::NAMETOOLONG {
                Some(Self::NameTooLong)
            } else if errno == Errno::NOSPC {
                Some(Self::NoSpace)
            } else {
                None
            };
            if let Some(code) = known {
                return code;
            }
        }
        match error.kind() {
            io::ErrorKind::PermissionDenied => Self::PermissionDenied,
            io::ErrorKind::NotFound => Self::NotFound,
            io::ErrorKind::AlreadyExists => Self::AlreadyExists,
            io::ErrorKind::IsADirectory => Self::IsADirectory,
            io::ErrorKind::NotADirectory => Self::NotADirectory,
            io::ErrorKind::DirectoryNotEmpty => Self::DirectoryNotEmpty,
            io::ErrorKind::ReadOnlyFilesystem => Self::ReadOnlyFileSystem,
            io::ErrorKind::InvalidFilename => Self::NameTooLong,
            io::ErrorKind::StorageFull => Self::NoSpace,
            _ => Self::Other,
        }
    }

    /// The name Node gives the code, for the codes this set knows.
    pub fn name(self) -> Option<&'static str> {
        Some(match self {
            Self::PermissionDenied => "EACCES",
            Self::NotPermitted => "EPERM",
            Self::NotFound => "ENOENT",
            Self::AlreadyExists => "EEXIST",
            Self::IsADirectory => "EISDIR",
            Self::NotADirectory => "ENOTDIR",
            Self::DirectoryNotEmpty => "ENOTEMPTY",
            Self::ReadOnlyFileSystem => "EROFS",
            Self::TooManyLinks => "ELOOP",
            Self::NameTooLong => "ENAMETOOLONG",
            Self::NoSpace => "ENOSPC",
            Self::Other => return None,
        })
    }

    /// The description libuv gives the code.
    pub fn description(self) -> Option<&'static str> {
        Some(match self {
            Self::PermissionDenied => "permission denied",
            Self::NotPermitted => "operation not permitted",
            Self::NotFound => "no such file or directory",
            Self::AlreadyExists => "file already exists",
            Self::IsADirectory => "illegal operation on a directory",
            Self::NotADirectory => "not a directory",
            Self::DirectoryNotEmpty => "directory not empty",
            Self::ReadOnlyFileSystem => "read-only file system",
            Self::TooManyLinks => "too many symbolic links encountered",
            Self::NameTooLong => "name too long",
            Self::NoSpace => "no space left on device",
            Self::Other => return None,
        })
    }
}

/// A file call that failed: the call, the path and the operating system's error.
#[derive(Debug, thiserror::Error)]
#[error("{syscall} {}: {source}", path.display())]
pub struct IoFailure {
    pub syscall: &'static str,
    pub path: PathBuf,
    #[source]
    pub source: io::Error,
}

impl IoFailure {
    pub fn new(syscall: &'static str, path: impl Into<PathBuf>, source: io::Error) -> Self {
        Self {
            syscall,
            path: path.into(),
            source,
        }
    }

    pub fn code(&self) -> OsErrorCode {
        OsErrorCode::of(&self.source)
    }
}
