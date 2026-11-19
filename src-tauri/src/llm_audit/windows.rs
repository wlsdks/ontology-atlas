// The Windows twin of the `openat` walk. Windows has no `openat`, so the handle is
// checked after it is opened: not a reparse point, one link, and its final path is
// the expected path inside the vault. A junction anywhere above the log moves the
// final path, so it is caught here. The log is held without delete sharing, so it
// cannot be renamed or replaced while a reservation holds it.

use super::{audit_log_path, AUDIT_LOCK_RETRIES, AUDIT_LOCK_RETRY_PAUSE, SIDECAR_DIR};
use crate::errors::coded;
use std::fs::{self, File, OpenOptions};
use std::io::{Seek, SeekFrom};
use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
use std::os::windows::io::AsRawHandle;
use std::path::{Path, PathBuf};
use windows_sys::Win32::Foundation::{ERROR_LOCK_VIOLATION, HANDLE};
use windows_sys::Win32::Storage::FileSystem::{
    GetFileInformationByHandle, GetFinalPathNameByHandleW, LockFileEx, BY_HANDLE_FILE_INFORMATION,
    FILE_ATTRIBUTE_REPARSE_POINT, FILE_FLAG_OPEN_REPARSE_POINT, FILE_NAME_NORMALIZED,
    FILE_SHARE_READ, FILE_SHARE_WRITE, LOCKFILE_EXCLUSIVE_LOCK, LOCKFILE_FAIL_IMMEDIATELY,
};
use windows_sys::Win32::System::IO::{OVERLAPPED, OVERLAPPED_0, OVERLAPPED_0_0};

/// One byte far past any real log, so the lock excludes other writers without
/// blocking the Settings screen that reads the lines.
const LOCK_OFFSET_LOW: u32 = 0xFFFF_FFFE;
const LOCK_OFFSET_HIGH: u32 = 0x7FFF_FFFF;

fn handle(file: &File) -> HANDLE {
    file.as_raw_handle()
}

fn is_reparse_point(metadata: &fs::Metadata) -> bool {
    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

fn link_count(file: &File) -> Result<u32, String> {
    let mut info = BY_HANDLE_FILE_INFORMATION::default();
    // SAFETY: the handle is open for the call and `info` is a valid out pointer.
    if unsafe { GetFileInformationByHandle(handle(file), &mut info) } == 0 {
        return Err(coded(
            "audit-log-write-failed",
            std::io::Error::last_os_error(),
        ));
    }
    Ok(info.nNumberOfLinks)
}

fn final_path(file: &File) -> Result<String, String> {
    let mut buffer = vec![0u16; 1024];
    loop {
        let capacity = u32::try_from(buffer.len()).unwrap_or(u32::MAX);
        // SAFETY: the buffer holds `capacity` u16s and the handle is open.
        let written = unsafe {
            GetFinalPathNameByHandleW(
                handle(file),
                buffer.as_mut_ptr(),
                capacity,
                FILE_NAME_NORMALIZED,
            )
        };
        if written == 0 {
            return Err(coded("audit-log-tampered", std::io::Error::last_os_error()));
        }
        let written = written as usize;
        if written < buffer.len() {
            return Ok(String::from_utf16_lossy(
                buffer.get(..written).unwrap_or(&[]),
            ));
        }
        if buffer.len() >= 32_768 {
            return Err(coded("audit-log-tampered", "path too long"));
        }
        buffer.resize(written + 1, 0);
    }
}

/// Where the handle really is, its link count, and that it is a plain file.
pub(super) fn verify_handle(expected: &Path, file: &File) -> Result<(), String> {
    let metadata = file
        .metadata()
        .map_err(|err| coded("audit-log-tampered", err))?;
    if is_reparse_point(&metadata) || !metadata.is_file() {
        return Err(coded("audit-log-tampered", "a link or not a regular file"));
    }
    if link_count(file)? != 1 {
        return Err(coded("audit-log-tampered", "hard-linked from another path"));
    }
    let actual = final_path(file)?;
    if !actual.eq_ignore_ascii_case(&expected.to_string_lossy()) {
        return Err(coded(
            "audit-log-tampered",
            "the log resolves outside the vault's .ontology-atlas folder",
        ));
    }
    Ok(())
}

fn try_lock(file: &File) -> std::io::Result<bool> {
    let mut overlapped = OVERLAPPED {
        Anonymous: OVERLAPPED_0 {
            Anonymous: OVERLAPPED_0_0 {
                Offset: LOCK_OFFSET_LOW,
                OffsetHigh: LOCK_OFFSET_HIGH,
            },
        },
        ..Default::default()
    };
    // SAFETY: synchronous handle, valid OVERLAPPED; the lock ends when the handle closes.
    let locked = unsafe {
        LockFileEx(
            handle(file),
            LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY,
            0,
            1,
            0,
            &mut overlapped,
        )
    };
    if locked != 0 {
        return Ok(true);
    }
    let error = std::io::Error::last_os_error();
    if error.raw_os_error() == Some(ERROR_LOCK_VIOLATION as i32) {
        Ok(false)
    } else {
        Err(error)
    }
}

pub(super) fn open_audit_file(canonical_vault: &Path) -> Result<(PathBuf, File), String> {
    let sidecar = canonical_vault.join(SIDECAR_DIR);
    match fs::create_dir(&sidecar) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(error) => return Err(coded("audit-log-write-failed", error)),
    }
    let sidecar_metadata =
        fs::symlink_metadata(&sidecar).map_err(|err| coded("audit-log-write-failed", err))?;
    if is_reparse_point(&sidecar_metadata) || !sidecar_metadata.is_dir() {
        return Err(coded(
            "audit-log-tampered",
            ".ontology-atlas is a link or not a directory",
        ));
    }
    let path = audit_log_path(canonical_vault);
    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        // No delete sharing: the path cannot be renamed or replaced while held.
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(&path)
        .map_err(|err| coded("audit-log-tampered", err))?;
    verify_handle(&path, &file)?;

    let mut retries = 0;
    loop {
        match try_lock(&file) {
            Ok(true) => break,
            Ok(false) if retries == AUDIT_LOCK_RETRIES => {
                return Err(coded("audit-log-busy", ""));
            }
            Ok(false) => {
                retries += 1;
                std::thread::sleep(AUDIT_LOCK_RETRY_PAUSE);
            }
            Err(error) => return Err(coded("audit-log-write-failed", error)),
        }
    }
    // Opened without append (finalize truncates), so writes start at the end here.
    file.seek(SeekFrom::End(0))
        .map_err(|err| coded("audit-log-write-failed", err))?;
    Ok((path, file))
}
