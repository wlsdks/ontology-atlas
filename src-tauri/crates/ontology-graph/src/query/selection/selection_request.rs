//! The arguments only the selection operations read, and the facts about the world outside the
//! graph that some of them need. Both reach an operation inside `QueryRequest::selection`, read
//! once by the tool layer, so no operation parses text or opens a file.

use serde::Serialize;

/// How `match_nodes` orders its rows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum NodeSort {
    #[default]
    Degree,
    InDegree,
    OutDegree,
    Slug,
}

impl NodeSort {
    pub fn parse(text: &str) -> Option<Self> {
        match text {
            "degree" => Some(Self::Degree),
            "inDegree" => Some(Self::InDegree),
            "outDegree" => Some(Self::OutDegree),
            "slug" => Some(Self::Slug),
            _ => None,
        }
    }

    pub const fn name(self) -> &'static str {
        match self {
            Self::Degree => "degree",
            Self::InDegree => "inDegree",
            Self::OutDegree => "outDegree",
            Self::Slug => "slug",
        }
    }
}

/// The arguments only the selection operations read, each as the call sent it: `None` is an
/// argument that was not sent. The arguments every family reads (`slug`, `limit`, `itemLimit`,
/// `project`, `type`, `types`) are on the request itself.
#[derive(Debug, Clone, Default)]
pub struct SelectionArguments {
    pub kind: Option<String>,
    pub domain: Option<String>,
    pub has_incoming: Option<bool>,
    pub has_outgoing: Option<bool>,
    pub sort: Option<NodeSort>,
    /// `offset` of `match_nodes`: the rows of the sorted match to skip.
    pub offset: Option<usize>,
    /// `excludeKinds` of `match_nodes`: node kinds left out of the match.
    pub exclude_kinds: Option<Vec<String>>,
    pub candidate_slug: Option<String>,
    pub title: Option<String>,
    pub phases: Option<Vec<String>>,
    pub severities: Option<Vec<String>>,
    pub kinds: Option<Vec<String>>,
    pub executable_only: Option<bool>,
    pub after_action_id: Option<String>,
    /// Keeps only the maintenance steps about these slugs, and reads only their bodies: what a
    /// write asks after the nodes it changed. A call of `query_ontology` never sets it.
    pub touching: Option<Vec<String>>,
}

/// A domain or project whose membership changed after its description was last written, as the
/// Git history of the vault says. A vault outside a repository has no such history, and
/// `maintenance_plan` then lists none.
#[derive(Debug, Clone)]
pub struct StaleSummary {
    pub slug: String,
    pub score: f64,
    pub hint: String,
}

/// The lines of a file a statement says were left unread, or that were read.
#[derive(Debug, Clone, Serialize)]
pub struct LineSpan {
    pub path: String,
    pub from: u64,
    pub to: u64,
}

/// A read a node's own `## Uncertainty` section asks for, as the reader of bodies found it. The
/// graph does not read prose: `growth_plan` lists these in the order they are handed over.
#[derive(Debug, Clone, Serialize)]
pub struct UncertaintyRead {
    pub slug: String,
    pub kind: String,
    pub statement: String,
    pub paths: Vec<String>,
    pub ranges: Vec<LineSpan>,
    #[serde(rename = "readRanges")]
    pub read_ranges: Vec<LineSpan>,
    #[serde(rename = "proposedAction")]
    pub proposed_action: String,
}

/// What the vault's validation found, as `validate_vault` reports it. `health` and `workspace_brief`
/// carry it as one more check; the graph cannot know it, because it is about files, not nodes.
#[derive(Debug, Clone)]
pub struct VaultValidationFacts {
    /// The `validation` object the brief writes, as the validation tool wrote it.
    pub brief: Box<answer_format::json::RawJson>,
    pub error_files: usize,
    pub warning_files: usize,
    pub path_drifts: usize,
    /// Whether the source paths were compared with a repository at all.
    pub paths_checked: bool,
    pub repo_root: Option<String>,
}

/// What a project's source says now about the witnesses its receipt recorded, when it can judge them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WitnessesNow {
    /// Every recorded witness path still resolves.
    AllResolve { total: usize },
    SomeMissing { missing: usize, total: usize },
}

/// The source as it is now, beside the receipt that is behind it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceNow {
    /// The first characters of the revision the source is at.
    pub revision: String,
    pub witnesses: WitnessesNow,
}

/// One project's meaning assessment as the tool layer judged it from the project's receipts: the
/// status and the gap and next action that decide it, copied as the assessment names them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectMeaningFacts {
    pub project_slug: String,
    pub status: String,
    pub top_gap: String,
    pub next_action: String,
    /// Whether the project's `## Competency answers` section parses, so a section that is written
    /// and only not finalized is not asked to be written again.
    pub competency_authored: bool,
    pub source_now: Option<SourceNow>,
}

impl ProjectMeaningFacts {
    pub fn is_current(&self) -> bool {
        self.status == "verified_current"
    }
}

/// What the tool layer reads from beside the graph.
#[derive(Debug, Clone, Default)]
pub struct OutsideFacts {
    /// `None` when no validation was handed over: the answer then carries no validation check.
    pub validation: Option<VaultValidationFacts>,
    /// The `.ontology-atlasignore` patterns of the vault, one per line of the file.
    pub ignore_patterns: Vec<String>,
    pub stale_summaries: Vec<StaleSummary>,
    /// The reads the uncertainty sections ask for, ordered; `None` when no body was handed to the
    /// reader of them.
    pub next_reads: Option<Vec<UncertaintyRead>>,
    /// The assessment of every project, ordered by slug; empty when none was judged, and then the
    /// answer carries no meaning check.
    pub meaning: Vec<ProjectMeaningFacts>,
}

#[derive(Debug, Clone, Default)]
pub struct SelectionRequest {
    pub arguments: SelectionArguments,
    pub outside: OutsideFacts,
}
