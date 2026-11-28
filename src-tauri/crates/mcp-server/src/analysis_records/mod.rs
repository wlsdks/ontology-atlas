//! The analysis records a vault keeps in `.ontology-atlas/analyses`: what one question was asked and
//! answered from (a run) and what a person decided about one finding of it (a review). The app
//! writes them and lists them; this crate reads one whole, and judges it against the rules of its
//! format and the digests it was stamped with. See `README.md` in this folder.

mod analysis_archive;
mod analysis_record;
#[cfg(test)]
mod archive_tests;
mod evidence_digest;
mod field_checks;
mod record_fault;
mod record_text;
mod record_value;

pub use analysis_archive::{AnalysisArchive, ArchiveError};
