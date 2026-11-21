// What preparing and downloading do to files on disk: how a failure is reported,
// hashing, syncing, writing, removing, sizes and free space.

use super::super::EmbedError;
use crate::lower_hex::lower_hex;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

const HASH_CHUNK: usize = 1024 * 1024;

pub(super) fn store_error(error: std::io::Error) -> EmbedError {
    EmbedError::Store(crate::coded_error::squeeze(&error.to_string()))
}

/// Bytes the current user may still write on the volume holding `path`.
#[cfg(unix)]
pub(super) fn free_space(path: &Path) -> std::io::Result<u64> {
    use std::os::unix::ffi::OsStrExt;
    let name = std::ffi::CString::new(path.as_os_str().as_bytes())?;
    // SAFETY: `statvfs` only writes into the zeroed struct it is given.
    let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
    // SAFETY: `name` is a valid C string and `stat` outlives the call.
    if unsafe { libc::statvfs(name.as_ptr(), &mut stat) } != 0 {
        return Err(std::io::Error::last_os_error());
    }
    #[allow(
        clippy::useless_conversion,
        reason = "the field widths differ by platform"
    )]
    let free = u64::from(stat.f_bavail).saturating_mul(u64::from(stat.f_frsize));
    Ok(free)
}

#[cfg(windows)]
pub(super) fn free_space(path: &Path) -> std::io::Result<u64> {
    use std::os::windows::ffi::OsStrExt;
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut available = 0u64;
    // SAFETY: `wide` is NUL-terminated and `available` outlives the call.
    let ok = unsafe {
        windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut available,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if ok == 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(available)
}

pub(super) fn file_len(path: &Path) -> u64 {
    fs::symlink_metadata(path)
        .ok()
        .filter(fs::Metadata::is_file)
        .map_or(0, |meta| meta.len())
}

/// Makes the renames in `dir` survive a power loss; Windows has no directory handle
/// to sync and journals the rename itself.
pub(super) fn sync_dir(dir: &Path) -> Result<(), EmbedError> {
    #[cfg(unix)]
    fs::File::open(dir)
        .and_then(|file| file.sync_all())
        .map_err(store_error)?;
    #[cfg(not(unix))]
    let _ = dir;
    Ok(())
}

pub(super) fn sync_file(path: &Path) -> Result<(), EmbedError> {
    open_for_sync(path)
        .and_then(|file| file.sync_all())
        .map_err(store_error)
}

/// Windows flushes only through a handle that may write (`FlushFileBuffers`), and answers
/// "Access is denied" for a read-only one.
pub(super) fn open_for_sync(path: &Path) -> std::io::Result<fs::File> {
    fs::OpenOptions::new().write(true).open(path)
}

/// Removes `path` when it is a link, so the next open makes a plain file there.
pub(super) fn remove_link(path: &Path) -> Result<(), EmbedError> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() => remove_if_present(path),
        _ => Ok(()),
    }
}

/// Writes a synced temporary sibling, then renames it over `path`.
pub(super) fn write_synced(path: &Path, bytes: &[u8]) -> Result<(), EmbedError> {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".tmp");
    let temporary = path.with_file_name(name);
    remove_link(&temporary)?;
    let mut file = File::create(&temporary).map_err(store_error)?;
    file.write_all(bytes).map_err(store_error)?;
    file.sync_all().map_err(store_error)?;
    drop(file);
    fs::rename(&temporary, path).map_err(store_error)
}

pub(super) fn remove_if_present(path: &Path) -> Result<(), EmbedError> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(store_error(error)),
    }
}

/// Deletes every entry of `dir` that `keep` rejects; a link is removed, never followed.
pub(super) fn sweep_dir(
    dir: &Path,
    keep: &dyn Fn(&str, &fs::Metadata) -> bool,
) -> Result<(), EmbedError> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(store_error(error)),
    };
    for entry in entries {
        let entry = entry.map_err(store_error)?;
        let path = entry.path();
        let meta = fs::symlink_metadata(&path).map_err(store_error)?;
        let name = entry.file_name();
        if keep(&name.to_string_lossy(), &meta) {
            continue;
        }
        if meta.is_dir() {
            fs::remove_dir_all(&path).map_err(store_error)?;
        } else {
            remove_link(&path)?;
            remove_if_present(&path)?;
        }
    }
    Ok(())
}

/// The whole file's SHA-256 in lower-case hex.
pub(super) fn sha256_file(path: &Path, cancel: &AtomicBool) -> Result<String, EmbedError> {
    let file = File::open(path).map_err(store_error)?;
    let hasher = hash_chunks(file, cancel, &mut |_| {})?;
    Ok(lower_hex(&hasher.finalize()))
}

/// Hashes a file's first `len` bytes, reporting each chunk; a resumed download
/// goes on from the hasher it returns. Nothing is opened when `len` is 0.
pub(super) fn hash_prefix(
    path: &Path,
    len: u64,
    cancel: &AtomicBool,
    on_bytes: &mut dyn FnMut(u64),
) -> Result<Sha256, EmbedError> {
    if len == 0 {
        return Ok(Sha256::new());
    }
    let reader = File::open(path).map_err(store_error)?.take(len);
    hash_chunks(reader, cancel, on_bytes)
}

fn hash_chunks(
    mut reader: impl Read,
    cancel: &AtomicBool,
    on_bytes: &mut dyn FnMut(u64),
) -> Result<Sha256, EmbedError> {
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; HASH_CHUNK];
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err(EmbedError::Cancelled);
        }
        let read = reader.read(&mut buffer).map_err(store_error)?;
        let Some(chunk) = buffer.get(..read).filter(|chunk| !chunk.is_empty()) else {
            return Ok(hasher);
        };
        hasher.update(chunk);
        on_bytes(read as u64);
    }
}
