//! Reading `.ontology-atlas/library-collections.json` and saying what state it is in.
//!
//! The file is read through `confined-files`: never through a link, and never past 1 MiB. A file
//! that cannot be used is an answer (`availability: "unavailable"` with the reason), not an error,
//! and it is never repaired or replaced.

use std::path::Path;

use confined_files::{sha256_hex, SidecarError, Unsafe, VaultSidecar};
use serde::Serialize;
use serde_json::Value;

use crate::collections_validation::{validate, Collections};

pub const COLLECTIONS_PATH: &str = ".ontology-atlas/library-collections.json";
const COLLECTIONS_SCHEMA: &str = "ontology-atlas/library-collections/v1";
const FILE_NAME: &str = "library-collections.json";
const MAX_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Missing,
    Ready,
    Corrupt,
    Unsupported,
}

/// The answer's `source`: which file, in which state, and which version of it was read.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CollectionsSource {
    pub path: &'static str,
    pub schema: &'static str,
    pub status: Status,
    pub availability: &'static str,
    /// The SHA-256 of the text that was read; none when no text was read.
    pub revision: Option<String>,
    pub mtime: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

impl CollectionsSource {
    fn new(
        status: Status,
        revision: Option<String>,
        mtime: Option<f64>,
        reason: Option<String>,
    ) -> Self {
        let availability = match status {
            Status::Ready => "ready",
            Status::Missing => "missing",
            Status::Corrupt | Status::Unsupported => "unavailable",
        };
        Self {
            path: COLLECTIONS_PATH,
            schema: COLLECTIONS_SCHEMA,
            status,
            availability,
            revision,
            mtime,
            reason,
        }
    }
}

/// What was read: the source, and the collections when the file is ready.
#[derive(Debug, Clone, PartialEq)]
pub struct SavedCollections {
    pub source: CollectionsSource,
    pub collections: Option<Collections>,
}

impl SavedCollections {
    fn without_collections(source: CollectionsSource) -> Self {
        Self {
            source,
            collections: None,
        }
    }
}

fn unreadable(reason: &str) -> SavedCollections {
    SavedCollections::without_collections(CollectionsSource::new(
        Status::Corrupt,
        None,
        None,
        Some(reason.to_string()),
    ))
}

/// The collections of the vault at `vault`, or why there are none to read.
pub fn read_saved_collections(vault: &Path) -> SavedCollections {
    let stored = match VaultSidecar::new(vault.to_path_buf()).read_text(FILE_NAME, MAX_BYTES) {
        Ok(Some(stored)) => stored,
        Ok(None) | Err(SidecarError::Unsafe(Unsafe::VaultUnresolvable)) => {
            return SavedCollections::without_collections(CollectionsSource::new(
                Status::Missing,
                None,
                None,
                None,
            ))
        }
        Err(SidecarError::TooLarge(..)) => {
            return unreadable("The collection file exceeds the 1 MiB limit.")
        }
        Err(SidecarError::Unsafe(Unsafe::EntryNotPlainFile)) => {
            return unreadable("The collection path is not a regular file.")
        }
        Err(SidecarError::Unsafe(_)) => {
            return unreadable("The collection file resolves outside the configured vault.")
        }
        Err(_) => {
            return unreadable("The collection file could not be read from the configured vault.")
        }
    };
    let revision = Some(sha256_hex(stored.text.as_bytes()));
    let mtime = Some(stored.revision.modified_time().milliseconds());
    let described = |status: Status, reason: &str| {
        SavedCollections::without_collections(CollectionsSource::new(
            status,
            revision.clone(),
            mtime,
            Some(reason.to_string()),
        ))
    };
    let Ok(parsed) = serde_json::from_str::<Value>(&stored.text) else {
        return described(Status::Corrupt, "The collection file is not valid JSON.");
    };
    let document = match &parsed {
        Value::Object(fields)
            if fields.get("schema").and_then(Value::as_str) == Some(COLLECTIONS_SCHEMA) =>
        {
            fields
        }
        _ => {
            return described(
                Status::Unsupported,
                "The collection file uses an unsupported schema version.",
            )
        }
    };
    match validate(document) {
        Ok(collections) => SavedCollections {
            source: CollectionsSource::new(Status::Ready, revision, mtime, None),
            collections: Some(collections),
        },
        Err(reason) => described(Status::Corrupt, &reason),
    }
}

#[cfg(test)]
#[allow(
    clippy::disallowed_methods,
    reason = "these tests plant the collection file a vault holds"
)]
mod tests {
    use super::*;

    fn vault_with(file: Option<&str>) -> tempfile::TempDir {
        let vault = tempfile::tempdir().expect("vault");
        if let Some(text) = file {
            let folder = vault.path().join(".ontology-atlas");
            std::fs::create_dir_all(&folder).expect("folder");
            std::fs::write(folder.join(FILE_NAME), text).expect("file");
        }
        vault
    }

    #[test]
    fn a_file_is_missing_ready_corrupt_or_of_another_schema_and_only_a_ready_one_gives_collections()
    {
        let ready = r#"{"schema":"ontology-atlas/library-collections/v1","folders":[],"items":[]}"#;
        let cases = [
            (None, Status::Missing, "missing"),
            (Some(ready), Status::Ready, "ready"),
            (Some("{"), Status::Corrupt, "unavailable"),
            (
                Some(r#"{"schema":"other"}"#),
                Status::Unsupported,
                "unavailable",
            ),
            (Some("[]"), Status::Unsupported, "unavailable"),
            (
                Some(r#"{"schema":"ontology-atlas/library-collections/v1","folders":{}}"#),
                Status::Corrupt,
                "unavailable",
            ),
        ];
        for (file, status, availability) in cases {
            let vault = vault_with(file);
            let read = read_saved_collections(vault.path());
            assert_eq!(
                (read.source.status, read.source.availability),
                (status, availability),
                "{file:?}"
            );
            assert_eq!(read.collections.is_some(), status == Status::Ready);
            assert_eq!(read.source.revision.is_some(), file.is_some());
        }
    }
}
