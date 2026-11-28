//! What a write tool tells the audit log it did. A tool cannot finish without saying: its handler
//! returns a [`WriteDone`], which holds one of these, so a write that leaves no record is a choice
//! the tool makes in its own words ([`WriteRecord::Nothing`]), never an oversight.

use crate::answer::ToolOutput;

/// The share of the code a vault's map holds, in the shape of a map analysis line. `None` for a
/// count that could not be measured (no repository is connected).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ShareCounts {
    pub source_commit: Option<String>,
    pub source_dirty: Option<bool>,
    pub abilities: Option<AbilityShare>,
    pub areas: Option<AreaShare>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct AbilityShare {
    pub total: u64,
    #[serde(rename = "offMap")]
    pub off_map: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct AreaShare {
    pub total: u64,
    #[serde(rename = "notMapped")]
    pub not_mapped: u64,
}

/// The concepts one write added, changed or removed, by slug.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ConceptEffect {
    pub added: Vec<String>,
    pub changed: Vec<String>,
    pub removed: Vec<String>,
}

impl ConceptEffect {
    /// The effect of one write; an empty slug names nothing and is dropped.
    pub fn new(added: Vec<String>, changed: Vec<String>, removed: Vec<String>) -> Self {
        let named =
            |slugs: Vec<String>| slugs.into_iter().filter(|slug| !slug.is_empty()).collect();
        Self {
            added: named(added),
            changed: named(changed),
            removed: named(removed),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.added.is_empty() && self.changed.is_empty() && self.removed.is_empty()
    }
}

/// Whether and how the share on the map is measured for a write.
pub enum ShareMeasure {
    /// The write cannot move the share (a relation changes no concept's path, title or body), so the
    /// counts of the last line stand.
    Unchanged,
    /// The write may move it. Called at most once, and only when the write changed a concept.
    Measure(Box<dyn FnOnce() -> ShareCounts + Send>),
}

/// The one line of the activity log a write adds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActivityContent {
    pub target: String,
    pub summary: String,
    pub why: Option<String>,
    /// The tool name the line carries when it is not the tool called: a rename that changes the
    /// kind and a removal that replaces the relation are logged as the tools they stand for.
    pub logged_as: Option<&'static str>,
}

pub enum WriteRecord {
    /// Nothing changed (a dry run, a call that refused every row), so nothing is recorded: the logs
    /// carry what happened and nothing else.
    Nothing,
    Wrote {
        activity: ActivityContent,
        concepts: ConceptEffect,
        share: ShareMeasure,
    },
}

/// The end of a write handler: the answer and the record of the change.
pub struct WriteDone {
    pub output: ToolOutput,
    pub record: WriteRecord,
}
