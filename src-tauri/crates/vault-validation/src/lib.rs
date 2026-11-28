//! What `validate_vault` reports: the findings of a whole vault, whether its summaries and the code
//! it cites are still current, and the page an agent reads. See `README.md`.

mod code_remedy;
mod evidence_drift;
mod evidence_verdict;
mod issue_collection;
mod kept_history;
mod node_revisions;
mod path_drift;
mod problem_list;
mod raw_source_kind;
mod slug_collision;
mod summary_freshness;
mod validation_page;

pub use evidence_drift::{
    evidence_concepts, evidence_drift, EvidenceConcept, EvidenceCounts, EvidenceDrift,
    EvidenceHistory,
};
pub use evidence_verdict::{judge_evidence, CitedEntry, Judgement, PathChange, Verdict};
pub use issue_collection::{collect_issues, IssueCollection};
pub use kept_history::KeptHistory;
pub use node_revisions::{
    contained_slugs, node_revisions, NodeRevisions, Revision, CONTAINMENT_KEYS,
};
pub use path_drift::{path_drift, path_drift_unchecked, Drift, PathDrift};
pub use problem_list::{list_problems, CodeTally, Problem, ProblemList, ProblemSummary};
pub use raw_source_kind::raw_source_kind_issues;
pub use summary_freshness::{summary_freshness, StaleSummary, SummaryFreshness};
pub use validation_page::{
    page_validation, PageRequest, ValidationFrame, ValidationPage, DEFAULT_PAGE_LIMIT,
};
