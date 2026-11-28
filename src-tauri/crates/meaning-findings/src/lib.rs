//! What a vault's nodes claim that their source does not back, and the schema checks a packet an
//! agent hands in is held to. See `README.md` for where each part lives.

mod dependency_witness;
mod finding;
mod folder_only_evidence;
mod module_specifiers;
mod note_paths;
pub mod packet_schema;
mod repository_path;
mod starter_example;

pub use dependency_witness::{
    dependency_witness_findings, CitedPaths, ImportedNames, WITNESS_TEXT_MAX_BYTES,
};
pub use finding::Finding;
pub use folder_only_evidence::folder_only_evidence_finding;
pub use module_specifiers::module_specifiers;
pub use note_paths::path_tokens_in;
pub use packet_schema::{
    count_by, is_digest, is_persistable_evidence_reference, is_persistable_path_witness,
    is_persistable_relative_path, is_record, map_unique, non_blank, parse_source_range_citation,
    portable_source_ref, unique_strings, valid_timestamp, PacketFinding, PacketSeverity,
    SourceRangeCitation, NON_BLANK_DEFAULT_MAX,
};
pub use repository_path::{inside_repository, RepositoryPath};
pub use starter_example::{is_starter_example, starter_example_findings};
