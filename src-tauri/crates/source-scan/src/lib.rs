//! Files under a source root, read for what they say about the meaning recorded beside them.
//! This slice holds staleness: when a cited path last changed ([`path_dating`]) and what a cited
//! file said then and says now ([`evidence_texts`]), and where a folder lies inside its
//! repository ([`folder_placement`]). Imports, outlines, declarations and evidence
//! search join as their tools are ported.
//!
//! The crate runs `git` only through `hardened-git` and reads files only through
//! `confined-files`, so the app and the MCP server share one implementation of each rule.

mod autotools_c;
mod bounded_parse;
mod config_json;
mod evidence_texts;
mod folder_placement;
mod go_imports;
mod import_coverage;
mod import_edges;
mod import_rollup;
mod import_scan;
mod jvm_declarations;
mod jvm_resolution;
mod module_grouping;
mod path_dating;
mod path_facts;
mod python_imports;
mod python_resolution;
mod rust_dependencies;
mod rust_resolution;
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
pub use go_imports::GoPackageEvidence;
pub use import_coverage::ImportCoverage;
pub use import_edges::{
    ExternalImport, ImportEdge, ImportKind, ImportUsage, SourceRole, UnresolvedImport,
    UnresolvedReason,
};
pub use import_scan::{
    scan_imports, ImportScan, ImportScanOptions, ModuleEdge, DEFAULT_MAX_FILES, MAX_MAX_FILES,
    SOURCE_FILE_MAX_BYTES,
};
pub use source_language::{extension_of, SourceLanguage};
