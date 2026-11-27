//! Files under a source root, read for what they say about the meaning recorded beside them.
//! This slice holds staleness: when a cited path last changed ([`path_dating`]) and what a cited
//! file said then and says now ([`evidence_texts`]), and where a folder lies inside its
//! repository ([`folder_placement`]). Imports, outlines, declarations and evidence
//! search join as their tools are ported.
//!
//! The crate runs `git` only through `hardened-git` and reads files only through
//! `confined-files`, so the app and the MCP server share one implementation of each rule.

mod bounded_parse;
mod config_json;
mod evidence_texts;
mod folder_placement;
mod import_edges;
mod path_dating;
mod path_facts;
mod script_imports;
mod script_resolution;
mod source_language;
mod source_walk;
mod workspace_packages;

pub use evidence_texts::{
    read_evidence_pairs, EvidenceFiles, EvidenceReading, EvidenceRequest, MAX_EVIDENCE_PAIRS,
};
pub use folder_placement::{place_folder, FolderPlacementError, PlacedFolder};
pub use path_dating::{
    date_paths, Dating, DatingCommit, WantedPath, DATING_WINDOW_COMMITS, MAX_DATED_PATHS,
};

pub use bounded_parse::{parse_bounded, walk, ParseLimits, ParseRefusal, ParsedSource, Visit};
pub use source_language::{extension_of, SourceLanguage};
