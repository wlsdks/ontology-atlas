//! The analysis records a vault keeps in `.ontology-atlas/analyses`: what one question was asked and
//! answered from (a run) and what a person decided about one finding of it (a review). The app
//! writes them; this crate lists them a page at a time, reads one whole, and judges each against the
//! rules of its format and the digests it was stamped with. See `README.md` in this folder.

mod analysis_archive;
mod analysis_record;
mod archive_limits;
#[cfg(test)]
mod archive_tests;
mod evidence_digest;
mod field_checks;
mod name_page;
mod record_fault;
mod record_summary;
mod record_text;
mod record_value;

pub use analysis_archive::{AnalysisArchive, ArchiveError, HistoryLimit, HistoryQuery};
pub use analysis_record::AnalysisMode;
