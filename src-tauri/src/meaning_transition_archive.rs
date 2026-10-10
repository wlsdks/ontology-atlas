//! App-owned immutable meaning-transition evidence. Callers select a vault,
//! never an archive path; artifacts become durable before a record is visible.

pub(crate) mod append;
mod confined;
mod envelope;
pub(crate) mod history;
pub(crate) mod read;

use serde::{Deserialize, Serialize};
#[cfg(unix)]
use std::fs;

const RECORD_LIMIT: usize = 1_000_000;
const ARTIFACT_LIMIT: usize = 1_000_000;

const DIRECTORY: &str = ".ontology-atlas/meaning-transitions";
const ARTIFACT_DIRECTORY: &str = ".ontology-atlas/meaning-transitions/artifacts";

#[derive(Debug, Clone, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MeaningTransitionRootIdentity {
    canonical_path: String,
    #[cfg(unix)]
    device: u64,
    #[cfg(unix)]
    inode: u64,
}

#[tauri::command]
pub(crate) fn observe_meaning_transition_root(
    root_path: String,
) -> Result<MeaningTransitionRootIdentity, String> {
    let root = super::canonical_root(&root_path)?;
    if let Some(reason) = super::vault_root_rejection(&root) {
        return Err(format!("vault root is not eligible: {reason}"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let metadata = fs::metadata(&root).map_err(|error| error.to_string())?;
        Ok(MeaningTransitionRootIdentity {
            canonical_path: root.to_string_lossy().into_owned(),
            device: metadata.dev(),
            inode: metadata.ino(),
        })
    }
    #[cfg(not(unix))]
    {
        let _ = root;
        Err("meaning transition archival is unavailable on this platform because stable vault identity is not implemented".into())
    }
}

fn checked_root(
    root_path: &str,
    expected: &MeaningTransitionRootIdentity,
) -> Result<std::path::PathBuf, String> {
    let observed = observe_meaning_transition_root(root_path.to_string())?;
    if &observed != expected {
        return Err("selected vault identity changed".into());
    }
    Ok(std::path::PathBuf::from(observed.canonical_path))
}

#[cfg(test)]
mod tests;
