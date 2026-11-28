//! Files under a source root, read for what they say about the meaning recorded beside them.
//!
//! - Staleness: when a cited path last changed ([`path_dating`]), what a cited file said then and
//!   says now ([`evidence_texts`]), and where a folder lies inside its repository
//!   ([`folder_placement`]).
//! - Imports: every source file below a root read from its syntax tree, placed on the files and
//!   packages it names, judged against the vault's `depends_on` edges ([`import_scan`],
//!   [`import_reconciliation`], [`import_review`], [`import_focus`]).
//! - Architecture: those edges against a profile's layers and rules ([`architecture_profile`],
//!   [`architecture_conformance`]).
//!
//! Declarations ([`source_outline`]) are read from the same trees. Evidence search joins as its tool is ported.
//!
//! The crate runs `git` only through `hardened-git` and reads files only through
//! `confined-files`, so the app and the MCP server share one implementation of each rule.

mod architecture_conformance;
mod architecture_profile;
mod autotools_c;
mod batch_reading;
mod bounded_parse;
mod comparable_code;
mod config_json;
mod evidence_texts;
mod file_reading;
mod folder_placement;
mod go_imports;
mod import_coverage;
mod import_delivery;
mod import_edges;
mod import_focus;
mod import_reconciliation;
mod import_review;
mod import_rollup;
mod import_scan;
mod jvm_declarations;
mod jvm_resolution;
mod module_grouping;
mod one_line_per_row;
mod path_dating;
mod path_facts;
mod path_pattern;
#[cfg(test)]
mod planted_tree;
mod python_imports;
mod python_resolution;
mod rust_dependencies;
mod rust_resolution;
mod script_imports;
mod script_resolution;
mod source_language;
mod source_outline;
mod source_scan_error;
mod source_stamp;
mod source_walk;
mod workspace_packages;

pub use evidence_texts::{
    read_evidence_pairs, EvidenceFiles, EvidenceReading, EvidenceRequest, MAX_EVIDENCE_PAIRS,
};
pub use folder_placement::{place_folder, FolderPlacementError, PlacedFolder};
pub use path_dating::{
    date_paths, Dating, DatingCommit, WantedPath, DATING_WINDOW_COMMITS, MAX_DATED_PATHS,
};

pub use architecture_conformance::{
    build_architecture_brief, evaluate_architecture_conformance, ArchitectureBrief, Conformance,
    ConformanceStatus, MeasuredSource, MeasuredStamp, MeasuredTool,
};
pub use architecture_profile::{
    find_architecture_profiles, parse_architecture_profile, ArchitectureProfile, ProfileDocument,
};
pub use comparable_code::comparable_code;
pub use bounded_parse::{parse_bounded, walk, ParseLimits, ParseRefusal, ParsedSource, Visit};
pub use go_imports::GoPackageEvidence;
pub use import_coverage::ImportCoverage;
pub use import_delivery::{
    choose_automatic_import_delivery, resolve_import_review_mode, CompactDelivery, Delivery,
    DeliveryRefusal, ModeArguments, ReviewMode, AUTOMATIC_LIMIT_BYTES,
};
pub use import_edges::{
    ExternalImport, ImportEdge, ImportKind, ImportUsage, SourceRole, UnresolvedImport,
    UnresolvedReason,
};
pub use import_focus::{
    build_import_impact_focus, FocusDirection, FocusRequest, ImportImpactFocus,
    DEFAULT_FOCUS_LIMIT, MAX_FOCUS_LIMIT,
};
pub use import_reconciliation::{
    reconcile_import_edges, summarize_reconciliation, Reconciliation, ReconciliationSummary,
    VaultEdge, VaultFacts,
};
pub use import_review::{build_next_relation_review, NextRelationReview};
pub use import_scan::{
    scan_imports, ImportScan, ImportScanOptions, ModuleEdge, DEFAULT_MAX_FILES, MAX_MAX_FILES,
    SOURCE_FILE_MAX_BYTES,
};
pub use source_language::{extension_of, extension_of_file, SourceLanguage};
pub use source_outline::{
    outline_parsed, outline_signature, outline_text, Declaration, DeclarationKind, Outline,
    OUTLINE_DECLARATION_LIMIT,
};
pub use source_scan_error::{ScanErrorCode, SourceScanError};
pub use source_stamp::{read_git_source_state, GitSourceState};
pub use source_walk::{
    is_module_extension, list_source_files, walk_sorted, Entry, Flow, IgnoredNames, WalkLimits,
    WalkReport, DEFAULT_IGNORE,
};
pub use workspace_packages::{
    declared_workspace_members, discover_declared_workspace, DeclaredMember, WorkspaceDiscovery,
    WorkspacePackage,
};
