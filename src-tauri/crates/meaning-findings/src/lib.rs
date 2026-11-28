//! What a vault's nodes claim that their source does not back. See `README.md` for where each part lives.

mod dependency_witness;
mod finding;
mod folder_only_evidence;
mod module_specifiers;
mod note_paths;
mod remedies;
mod repository_path;
mod starter_example;

pub use dependency_witness::{
    dependency_witness_findings, CitedPaths, ImportedNames, WITNESS_TEXT_MAX_BYTES,
};
pub use finding::Finding;
pub use folder_only_evidence::folder_only_evidence_finding;
pub use module_specifiers::module_specifiers;
pub use note_paths::path_tokens_in;
pub use remedies::remedy;
pub use repository_path::{inside_repository, RepositoryPath};
pub use starter_example::{is_starter_example, starter_example_findings};
