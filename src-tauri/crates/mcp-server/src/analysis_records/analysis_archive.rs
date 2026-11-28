//! The archive of one vault: a record file read by its id, through the vault's confined folder, so
//! a link planted in the folder or at a name reaches nothing outside it and a record is never read
//! past its byte limit.

use std::path::PathBuf;

use analysis_archive_format::{
    is_record_of, is_uuid_v4, record_file_name, ARCHIVE_FOLDER, MAX_RECORD_BYTES,
};
use confined_files::{SidecarError, Unsafe, VaultSidecar};
use serde::Serialize;
use thiserror::Error;

use super::analysis_record::{AnalysisRecord, RecordKind};
use super::evidence_digest::evidence_problems;
use super::record_fault::RecordFault;
use super::record_text::parse_record;
use super::record_value::RecordValue;

const MEANING_AUTHORITY: &str = "diagnostic-records-only";

/// Why a call to the archive was refused. The first is the caller's to fix; the rest are about the
/// vault.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum ArchiveError {
    #[error("Analysis recordId must be a UUIDv4.")]
    InvalidRecordId,
    #[error("Analysis record was not found.")]
    NotFound,
    #[error("Analysis identity is ambiguous.")]
    Ambiguous,
    #[error("Analysis archive must be a real directory inside the selected vault.")]
    FolderRefused,
    /// A record that cannot be read, or the folder that cannot be listed, with the reason.
    #[error("{0}")]
    Unreadable(String),
}

#[derive(Serialize)]
pub struct RecordAnswer {
    contract: &'static str,
    operation: &'static str,
    #[serde(rename = "fileName")]
    file_name: String,
    record: RecordValue,
    #[serde(rename = "meaningAuthority")]
    meaning_authority: &'static str,
}

/// The analysis records of one vault.
pub struct AnalysisArchive {
    folder: VaultSidecar,
}

fn listing_failure(error: SidecarError) -> ArchiveError {
    match error {
        SidecarError::Unsafe(_) => ArchiveError::FolderRefused,
        other => ArchiveError::Unreadable(format!("Analysis archive could not be read: {other}")),
    }
}

/// The sentence a record that could not be opened is listed under.
fn read_failure(error: SidecarError) -> RecordFault {
    RecordFault::new(match error {
        SidecarError::Unsafe(Unsafe::EntryNotPlainFile) | SidecarError::TooLarge(..) => {
            "Analysis record is not a bounded, independent regular file.".to_string()
        }
        SidecarError::Changed(_) => "Analysis record changed while it was read.".to_string(),
        SidecarError::Unsafe(_) => "Analysis directory changed while it was read.".to_string(),
        SidecarError::Io(error) => format!("Analysis record could not be read: {error}"),
    })
}

impl AnalysisArchive {
    pub fn new(vault: PathBuf) -> Self {
        Self {
            folder: VaultSidecar::new(vault).below(ARCHIVE_FOLDER),
        }
    }

    /// The record kept under `name`, if it is the record its name says and its evidence is intact.
    fn read_file(&self, name: &str) -> Result<AnalysisRecord, RecordFault> {
        let stored = self
            .folder
            .read_text(name, MAX_RECORD_BYTES as u64)
            .map_err(read_failure)?
            .ok_or_else(|| RecordFault::new("Analysis record disappeared while it was read."))?;
        let record = parse_record(&stored.text)?;
        if record_file_name(record.created_at(), record.id()) != name {
            return Err(RecordFault::new(
                "Analysis file identity does not match its metadata.",
            ));
        }
        if record.kind() == RecordKind::Run {
            let problems = evidence_problems(&record);
            if !problems.is_empty() {
                return Err(RecordFault::new(format!(
                    "Analysis evidence integrity failed: {}",
                    problems.join(", ")
                )));
            }
        }
        Ok(record)
    }

    /// The one record with this id, whole.
    pub fn record(&self, id: &str) -> Result<RecordAnswer, ArchiveError> {
        if !is_uuid_v4(id) {
            return Err(ArchiveError::InvalidRecordId);
        }
        let mut names: Vec<String> = Vec::new();
        for name in self.folder.file_names().map_err(listing_failure)? {
            let name = name.map_err(|error| listing_failure(error.into()))?;
            if is_record_of(&name, id) {
                names.push(name);
                if names.len() > 1 {
                    break;
                }
            }
        }
        let name = match names.as_slice() {
            [] => return Err(ArchiveError::NotFound),
            [only] => only.clone(),
            _ => return Err(ArchiveError::Ambiguous),
        };
        let record = self
            .read_file(&name)
            .map_err(|fault| ArchiveError::Unreadable(fault.to_string()))?;
        Ok(RecordAnswer {
            contract: "analysisRecordRead:v1",
            operation: "analysis_record",
            file_name: name,
            record: record.into_value(),
            meaning_authority: MEANING_AUTHORITY,
        })
    }
}
