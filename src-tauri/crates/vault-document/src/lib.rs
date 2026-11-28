//! A vault's Markdown files as documents: frontmatter read by Atlas's own reader, the body, and
//! the bytes of every part, so a later write changes only the lines it means to; and the plain reads
//! over them. See `README.md` for where each part lives.

mod backlinks;
mod body_delivery;
mod body_findings;
mod body_links;
mod body_signature;
mod document;
mod document_cache;
mod evidence_limit;
mod evidence_search;
pub mod frontmatter;
mod kind_census;
mod loaded_document;
mod loaded_vault;
pub mod meaning_wording;
mod near_titles;
mod orphans;
mod query_filter;
mod read_hints;
mod reader_threads;
mod reference_index;
mod relations;
mod review;
pub mod schema;
mod search_needle;
mod search_text;
mod slug_list;
mod slug_resolution;
pub mod starter_body;
mod validation;
mod vault_issues;

pub use backlinks::{find_backlinks, AmbiguousReferences, Backlink};
pub use body_delivery::{
    describe_body_delivery, BodyDelivery, BodyInfo, BodyMode, EXCERPT_MAX_CHARS,
    summary_excerpt, FULL_BODY_MAX_CHARS, FULL_BODY_MAX_DOCUMENTS, SUMMARY_MAX_CHARS,
};
pub use body_findings::{body_findings, BodyFinding};
pub use document::{Document, RawShape};
pub use document_cache::{CacheCounts, DocumentCache};
pub use evidence_search::{search_evidence, EvidenceHit, EvidenceQuery, MatchedIn};
pub use kind_census::{kind_census, KindCensus, KindCounts};
pub use loaded_document::{DisplayTitle, FileReadError, LoadedDocument};
pub use loaded_vault::{LoadedVault, NamedReadError};
pub use near_titles::{near_titles, NearTitle};
pub use orphans::{find_orphans, Orphan};
pub use query_filter::{FilterError, QueryFilter};
pub use read_hints::{
    evidence_zero_hits_hint, query_zero_rows_hint, slug_not_found_hint, GrowthHint, Reference,
};
pub use reference_index::ReferenceIndex;
pub use relations::{
    dependency_refs, neighbor_refs, normalized_refs, relation_note_for, NeighborRef,
};
pub use review::{describe_review, Review};
pub use slug_list::SlugList;
pub use slug_resolution::{
    find_graph_references, resolve_uid, suggest_similar_slugs, AmbiguousName, SlugLookup,
};
pub use validation::{validate_document, Issue, Severity};
pub use vault_issues::{count_vault_issues, VaultIssues};
