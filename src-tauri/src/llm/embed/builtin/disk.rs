// What preparing and downloading share on disk: how a file error is reported and
// how a file is hashed.

use super::super::EmbedError;
use crate::lower_hex::lower_hex;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

const HASH_CHUNK: usize = 1024 * 1024;

pub(super) fn store_error(error: std::io::Error) -> EmbedError {
    EmbedError::Store(crate::errors::squeeze(&error.to_string()))
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
