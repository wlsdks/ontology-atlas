// Opens the audit log inside the vault and re-checks it before every write. The
// log is never reached through a link, never shared with another path, and is held
// under an exclusive lock from reservation to finalize; a platform that cannot
// verify that fails closed rather than sending without a record.

use std::fs;
use std::path::{Path, PathBuf};
#[cfg(any(unix, windows, test))]
use std::time::Duration;

use crate::errors::coded;

/// NUL-terminated twins for `openat`/`mkdirat`, so no `CString::new(..).expect(..)`
/// exists: a panic unwinding through an Objective-C frame aborts the process. `names_stay_in_step`
/// pins each literal to its `&str` twin.
#[cfg(any(unix, test))]
pub(super) const SIDECAR_DIR_C: &std::ffi::CStr = c".ontology-atlas";
#[cfg(any(unix, test))]
pub(super) const AUDIT_FILE_C: &std::ffi::CStr = c"llm-audit.jsonl";

/// A busy `flock` may be our own child between `fork` and `exec` holding an inherited copy, so it
/// is retried within a fixed budget, then fails closed.
#[cfg(any(unix, windows, test))]
pub(super) const AUDIT_LOCK_RETRY_PAUSE: Duration = Duration::from_micros(250);
#[cfg(any(unix, windows, test))]
pub(super) const AUDIT_LOCK_RETRIES: u32 = 52;

/// Lets the positive control prove the overlap really happened.
#[cfg(all(test, unix))]
pub(super) static ABSORBED_INHERITED_BUSY: std::sync::atomic::AtomicUsize =
    std::sync::atomic::AtomicUsize::new(0);

/// The identity both the registry and the `openat` walk key on.
pub(super) fn canonical_vault_dir(vault_dir: &Path) -> Result<PathBuf, String> {
    let canonical_vault =
        fs::canonicalize(vault_dir).map_err(|err| coded("audit-vault-unreadable", err))?;
    if !canonical_vault.is_dir() {
        return Err(coded("audit-vault-unreadable", "not a directory"));
    }
    Ok(canonical_vault)
}

#[cfg(unix)]
pub(super) fn open_audit_file(canonical_vault: &Path) -> Result<(PathBuf, fs::File), String> {
    use std::ffi::CString;
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::ffi::OsStrExt;

    let vault_c = CString::new(canonical_vault.as_os_str().as_bytes())
        .map_err(|_| coded("audit-vault-unreadable", "path contains a NUL byte"))?;
    let root_fd = unsafe {
        libc::open(
            vault_c.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
        )
    };
    if root_fd < 0 {
        return Err(coded(
            "audit-vault-unreadable",
            std::io::Error::last_os_error(),
        ));
    }
    let root = unsafe { fs::File::from_raw_fd(root_fd) };

    let sidecar_name = SIDECAR_DIR_C;
    let made = unsafe { libc::mkdirat(root.as_raw_fd(), sidecar_name.as_ptr(), 0o700) };
    if made != 0 {
        let error = std::io::Error::last_os_error();
        if error.kind() != std::io::ErrorKind::AlreadyExists {
            return Err(coded("audit-log-write-failed", error));
        }
    }

    // O_NOFOLLOW closes the race where the directory is swapped for a link after the check.
    let sidecar_fd = unsafe {
        libc::openat(
            root.as_raw_fd(),
            sidecar_name.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
        )
    };
    if sidecar_fd < 0 {
        return Err(coded(
            "audit-log-tampered",
            format!(
                ".ontology-atlas is a link or not a directory: {}",
                std::io::Error::last_os_error()
            ),
        ));
    }
    let sidecar = unsafe { fs::File::from_raw_fd(sidecar_fd) };

    let audit_name = AUDIT_FILE_C;
    let audit_fd = unsafe {
        libc::openat(
            sidecar.as_raw_fd(),
            audit_name.as_ptr(),
            libc::O_RDWR
                | libc::O_CREAT
                | libc::O_APPEND
                | libc::O_CLOEXEC
                | libc::O_NOFOLLOW
                | libc::O_NONBLOCK,
            0o600,
        )
    };
    if audit_fd < 0 {
        return Err(coded(
            "audit-log-tampered",
            format!(
                "llm-audit.jsonl is a link or cannot be opened: {}",
                std::io::Error::last_os_error()
            ),
        ));
    }
    let file = unsafe { fs::File::from_raw_fd(audit_fd) };
    let metadata = file
        .metadata()
        .map_err(|err| coded("audit-log-write-failed", err))?;
    if !metadata.is_file() {
        return Err(coded("audit-log-tampered", "not a regular file"));
    }
    use std::os::unix::fs::MetadataExt;
    if metadata.nlink() != 1 {
        return Err(coded("audit-log-tampered", "hard-linked from another path"));
    }
    if unsafe { libc::fchmod(file.as_raw_fd(), 0o600) } != 0 {
        return Err(coded(
            "audit-log-write-failed",
            format!(
                "cannot restrict the file mode: {}",
                std::io::Error::last_os_error()
            ),
        ));
    }

    // LOCK_NB keeps a conflict from waiting as long as the network timeout; a busy
    // answer retries within the budget, then fails closed.
    let mut retries = 0;
    loop {
        if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } == 0 {
            break;
        }
        let error = std::io::Error::last_os_error();
        if error.kind() != std::io::ErrorKind::WouldBlock {
            return Err(coded("audit-log-write-failed", error));
        }
        if retries == AUDIT_LOCK_RETRIES {
            return Err(coded("audit-log-busy", ""));
        }
        retries += 1;
        #[cfg(test)]
        ABSORBED_INHERITED_BUSY.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        std::thread::sleep(AUDIT_LOCK_RETRY_PAUSE);
    }
    Ok((super::audit_log_path(canonical_vault), file))
}

#[cfg(windows)]
mod windows;

#[cfg(windows)]
pub(super) use windows::open_audit_file;

#[cfg(not(any(unix, windows)))]
pub(super) fn open_audit_file(_canonical_vault: &Path) -> Result<(PathBuf, fs::File), String> {
    // A platform with neither the `openat` walk nor the Windows handle checks fails
    // closed rather than sending without a record.
    Err(coded("audit-log-unsupported", ""))
}

pub(super) fn ensure_reservation_path(path: &Path, file: &fs::File) -> Result<(), String> {
    #[cfg(not(any(unix, windows)))]
    let _ = file;
    let path_metadata =
        fs::symlink_metadata(path).map_err(|err| coded("audit-log-tampered", err))?;
    if path_metadata.file_type().is_symlink() || !path_metadata.is_file() {
        return Err(coded(
            "audit-log-tampered",
            "the reserved path became a link or stopped being a file",
        ));
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let opened = file
            .metadata()
            .map_err(|err| coded("audit-log-tampered", err))?;
        if opened.dev() != path_metadata.dev() || opened.ino() != path_metadata.ino() {
            return Err(coded(
                "audit-log-tampered",
                "the reserved file was swapped for another",
            ));
        }
        if opened.nlink() != 1 || path_metadata.nlink() != 1 {
            return Err(coded(
                "audit-log-tampered",
                "the reserved file is hard-linked from another path",
            ));
        }
    }
    #[cfg(windows)]
    windows::verify_handle(path, file)?;
    Ok(())
}
