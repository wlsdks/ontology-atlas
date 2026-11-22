//! Hashes files natively, so a scan of cited sources never sends file bytes over IPC.

use std::fs;
use std::path::Path;

use sha2::{Digest, Sha256};

use crate::lower_hex::lower_hex;
use crate::resolve_existing_inside;

/// 64 KiB chunks keep a 200 MB scan out of resident memory.
pub(super) fn copy_hashing(
    input: &mut impl std::io::Read,
    output: &mut impl std::io::Write,
) -> std::io::Result<(String, u64)> {
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    let mut length = 0_u64;
    loop {
        let read = match input.read(&mut buffer) {
            Ok(0) => break,
            Ok(read) => read,
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error),
        };
        let chunk = buffer.get(..read).ok_or_else(|| {
            std::io::Error::other("a read returned more bytes than the buffer holds")
        })?;
        hasher.update(chunk);
        output.write_all(chunk)?;
        length += read as u64;
    }
    Ok((lower_hex(&hasher.finalize()), length))
}

fn hash_and_length(path: &Path) -> Result<(String, u64), String> {
    let mut file = fs::File::open(path).map_err(|err| err.to_string())?;
    copy_hashing(&mut file, &mut std::io::sink()).map_err(|err| err.to_string())
}

pub(crate) fn hash_path(path: &Path) -> Result<String, String> {
    hash_and_length(path).map(|(hash, _)| hash)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultFileHash {
    pub relative_path: String,
    /// `None` when unreadable, so an unreadable source never reads as compiled.
    pub sha256: Option<String>,
}

#[tauri::command(async)]
pub fn hash_vault_files(
    root_path: String,
    relative_paths: Vec<String>,
) -> Result<Vec<VaultFileHash>, String> {
    let mut hashes = Vec::with_capacity(relative_paths.len());
    for relative_path in relative_paths {
        let sha256 = resolve_existing_inside(&root_path, &relative_path)
            .and_then(|path| hash_path(&path))
            .ok();
        hashes.push(VaultFileHash {
            relative_path,
            sha256,
        });
    }
    Ok(hashes)
}

#[cfg(test)]
mod tests;
