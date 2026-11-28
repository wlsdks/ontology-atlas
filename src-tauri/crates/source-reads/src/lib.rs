//! Exact reads of a repository's source for the survey's `sourceReads`. See `README.md` for the
//! map of modules.

mod declaration_span;
mod file_outline;
mod opened_file;
mod path_policy;
mod product_index;
mod read_environment;
mod read_one;
mod refusal_reason;
mod selector;
mod session_reads;
mod source_evidence;
mod source_lines;
mod source_reads_text;
mod source_row;
mod surroundings;

pub use file_outline::{outline_file, FileOutline, OutlineDeclaration, OutlineKind};
pub use refusal_reason::RefusalReason;
pub use selector::{
    parse_source_reads, ReadTarget, SelectorRefusal, SourceReadSelector, MAX_SELECTORS,
};
pub use session_reads::{ReadRange, ReadsUnder, SessionReads};
pub use source_evidence::{read_source_evidence, AGGREGATE_TEXT_BYTES};
pub use source_reads_text::{fit_source_reads, render_source_reads};
pub use source_row::{
    AskedFor, CallerSite, Callee, ContextPart, ContextRole, NextRead, OmittedPart, OutlineRow,
    ReadRow, SourceEvidence, SourceRow,
};
