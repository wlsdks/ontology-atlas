//! Exact reads of a repository's source for the survey's `sourceReads`. See `README.md` for the
//! map of modules.

mod call_sites;
mod callees;
mod deciding_lines;
mod declaration_span;
mod declaration_survey;
mod file_outline;
mod import_bindings;
mod kept_files;
mod opened_file;
mod path_policy;
mod posix_path;
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
mod symbol_context;

pub use file_outline::{outline_file, FileOutline, OutlineDeclaration, OutlineKind};
pub use refusal_reason::RefusalReason;
pub use selector::{
    parse_source_reads, ReadTarget, SelectorRefusal, SourceReadSelector, MAX_SELECTORS,
};
pub use session_reads::{ReadRange, ReadsUnder, SessionReads};
pub use source_evidence::{read_source_evidence, AGGREGATE_TEXT_BYTES};
pub use source_reads_text::{fit_source_reads, render_source_reads};
pub use source_row::{
    AskedFor, Callee, CallerSite, ContextPart, ContextRole, NextRead, OmittedPart, OutlineRow,
    ReadRow, SourceEvidence, SourceRow,
};
