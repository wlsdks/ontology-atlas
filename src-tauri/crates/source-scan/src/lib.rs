//! Files under a source root, read for what they say about the meaning recorded beside them.
//! This slice holds staleness: when a cited path last changed ([`path_dating`]) and what a cited
//! file said then and says now ([`evidence_texts`]). Imports, outlines, declarations and evidence
//! search join as their tools are ported.
//!
//! The crate runs `git` only through `hardened-git` and reads files only through
//! `confined-files`, so the app and the MCP server share one implementation of each rule.

mod evidence_texts;
mod path_dating;

pub use evidence_texts::{
    read_evidence_pairs, EvidenceFiles, EvidenceReading, EvidenceRequest, MAX_EVIDENCE_PAIRS,
};
pub use path_dating::{
    date_paths, Dating, DatingCommit, WantedPath, DATING_WINDOW_COMMITS, MAX_DATED_PATHS,
};
