//! The archive of one vault: its record files listed a page at a time and read one at a time, each
//! through the vault's confined folder, so a link planted in the folder or at a name reaches
//! nothing outside it and a record is never read past its byte limit.

use std::path::PathBuf;

use confined_files::{SidecarError, Unsafe, VaultSidecar};
use serde::Serialize;
use thiserror::Error;

use super::analysis_record::{AnalysisMode, AnalysisRecord, RecordKind};
use super::archive_limits::{ARCHIVE_FOLDER, HISTORY_LIMIT_MAX, MAX_RECORD_BYTES};
use super::evidence_digest::evidence_problems;
use super::field_checks::is_uuid;
use super::name_page::NamePage;
use super::record_fault::RecordFault;
use super::record_file_name::{is_record_file_name, is_record_of, record_file_name};
use super::record_summary::RecordSummary;
use super::record_text::parse_record;
use super::record_value::RecordValue;

const MEANING_AUTHORITY: &str = "diagnostic-records-only";

/// Why a call to the archive was refused. The first three are the caller's to fix; the rest are
/// about the vault.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum ArchiveError {
    #[error("Analysis history limit must be between 1 and 100 scanned files.")]
    InvalidLimit,
    #[error("Invalid analysis history cursor.")]
    InvalidCursor,
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

/// What one `analysis_history` call asks for.
#[derive(Debug, Clone, Default)]
pub struct HistoryQuery {
    pub limit: usize,
    pub cursor: Option<String>,
    pub mode: Option<AnalysisMode>,
    pub project: Option<String>,
}

#[derive(Serialize)]
pub struct Problem {
    #[serde(rename = "fileName")]
    file_name: String,
    reason: String,
}

#[derive(Serialize)]
pub struct Pagination {
    #[serde(rename = "hasMore")]
    has_more: bool,
    #[serde(rename = "nextCursor")]
    next_cursor: Option<String>,
}

#[derive(Serialize)]
pub struct HistoryAnswer {
    contract: &'static str,
    operation: &'static str,
    records: Vec<RecordSummary>,
    problems: Vec<Problem>,
    #[serde(rename = "totalFiles")]
    total_files: usize,
    scanned: usize,
    returned: usize,
    pagination: Pagination,
    #[serde(rename = "meaningAuthority")]
    meaning_authority: &'static str,
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

/// A review keeps its run's id and so never approves another scope or run: it passes whatever the
/// filters say, and only a run is held to them.
fn passes(record: &AnalysisRecord, query: &HistoryQuery) -> bool {
    if record.kind() == RecordKind::Review {
        return true;
    }
    let mode_fits = query
        .mode
        .is_none_or(|mode| record.text_of("mode") == mode.name());
    let project_fits = query.project.as_deref().is_none_or(|project| {
        record
            .at("scope")
            .get("projectSlug")
            .and_then(RecordValue::as_text)
            == Some(project)
    });
    mode_fits && project_fits
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

    /// The newest records below the cursor, `limit` files at a time. A page reads and judges
    /// `limit` files, so `mode` and `project` can leave it with fewer rows than files; `hasMore`
    /// and `nextCursor` follow the files, never the rows.
    pub fn history(&self, query: &HistoryQuery) -> Result<HistoryAnswer, ArchiveError> {
        if !(1..=HISTORY_LIMIT_MAX).contains(&query.limit) {
            return Err(ArchiveError::InvalidLimit);
        }
        if query
            .cursor
            .as_deref()
            .is_some_and(|cursor| !is_record_file_name(cursor))
        {
            return Err(ArchiveError::InvalidCursor);
        }
        let mut page = NamePage::new(query.limit, query.cursor.clone());
        for name in self.folder.file_names().map_err(listing_failure)? {
            let name = name.map_err(|error| listing_failure(error.into()))?;
            if is_record_file_name(&name) {
                page.add(name);
            }
        }
        let found = page.finish();
        let mut records = Vec::new();
        let mut problems = Vec::new();
        for name in &found.names {
            match self.read_file(name) {
                Ok(record) => {
                    if !passes(&record, query) {
                        continue;
                    }
                    records.push(RecordSummary::of(&record, name));
                }
                Err(fault) => problems.push(Problem {
                    file_name: name.clone(),
                    reason: fault.to_string(),
                }),
            }
        }
        Ok(HistoryAnswer {
            contract: "analysisHistory:v1",
            operation: "analysis_history",
            returned: records.len(),
            records,
            problems,
            total_files: found.total,
            scanned: found.names.len(),
            pagination: Pagination {
                has_more: found.next_cursor.is_some(),
                next_cursor: found.next_cursor,
            },
            meaning_authority: MEANING_AUTHORITY,
        })
    }

    /// The one record with this id, whole.
    pub fn record(&self, id: &str) -> Result<RecordAnswer, ArchiveError> {
        if !is_uuid(id) {
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
