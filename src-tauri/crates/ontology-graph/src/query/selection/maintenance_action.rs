//! One step of a maintenance plan: what to do, how serious it is, where in the work it belongs, and
//! a stable address so a caller can ask for the steps after one it has handled.

use std::cmp::Ordering;

use answer_format::collation::compare_text;
use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};
use serde_json::value::RawValue;

use super::proposed_action::ProposedAction;
use super::relation_recommendations::RecommendationNodes;
use crate::compile_issue::CompileIssue;
use crate::query::node_summary::NodeSummary;

/// What a step is about, which decides the keys it carries beyond its kind and reason.
pub enum Subject<'a> {
    /// A compile issue, carried as the compiler wrote it.
    Issue(&'a CompileIssue),
    /// A dependency cycle: the nodes it passes through, and the row the walk wrote for it.
    Cycle {
        nodes: Vec<String>,
        row: Box<RawValue>,
    },
    /// A write to propose on one node; `None` when the step is only a repair to think through.
    Write {
        proposed: Option<ProposedAction>,
        node: Option<NodeSummary<'a>>,
    },
    /// A write to propose between two nodes.
    Link {
        proposed: ProposedAction,
        nodes: RecommendationNodes<'a>,
    },
    /// A judgement only a person can make, about one node.
    Review { node: Option<NodeSummary<'a>> },
}

pub struct Step<'a> {
    pub phase: &'static str,
    pub kind: &'static str,
    pub severity: &'static str,
    pub score: f64,
    pub reason: String,
    pub subject: Subject<'a>,
}

fn rank(order: &[&str], value: &str) -> usize {
    order
        .iter()
        .position(|candidate| *candidate == value)
        .unwrap_or(order.len() + 6)
}

/// Failures first, then by phase of the work, then the more certain, then by kind and reason.
pub fn compare_steps(left: &Step<'_>, right: &Step<'_>) -> Ordering {
    rank(&["fail", "warn", "info"], left.severity)
        .cmp(&rank(&["fail", "warn", "info"], right.severity))
        .then_with(|| {
            let phases = ["validate", "repair", "link", "materialize", "review"];
            rank(&phases, left.phase).cmp(&rank(&phases, right.phase))
        })
        .then_with(|| {
            right
                .score
                .partial_cmp(&left.score)
                .unwrap_or(Ordering::Equal)
        })
        .then_with(|| {
            compare_text(
                &format!("{}:{}", left.kind, left.reason),
                &format!("{}:{}", right.kind, right.reason),
            )
        })
}

#[derive(Serialize)]
struct IdNodes<'a> {
    from: &'a str,
    to: &'a str,
}

#[derive(Serialize)]
struct IdIssue<'a> {
    code: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    slug: Option<&'a str>,
    #[serde(rename = "ref", skip_serializing_if = "Option::is_none")]
    reference: Option<&'a str>,
}

/// What a step's address is made of: everything that makes it this step and not another.
#[derive(Serialize)]
struct IdPayload<'a> {
    phase: &'static str,
    kind: &'static str,
    severity: &'static str,
    #[serde(rename = "proposedAction")]
    proposed_action: Option<&'a ProposedAction>,
    node: Option<&'a str>,
    nodes: Option<IdNodes<'a>>,
    issue: Option<IdIssue<'a>>,
    cycle: Option<&'a [String]>,
    reason: &'a str,
}

fn issue_reference(issue: &CompileIssue) -> Option<&str> {
    match issue {
        CompileIssue::DanglingGraphReference { reference, .. } => Some(reference),
        _ => None,
    }
}

impl Step<'_> {
    fn proposed(&self) -> Option<&ProposedAction> {
        match &self.subject {
            Subject::Write { proposed, .. } => proposed.as_ref(),
            Subject::Link { proposed, .. } => Some(proposed),
            _ => None,
        }
    }

    pub fn is_executable(&self) -> bool {
        self.proposed().is_some()
    }

    fn node_slug(&self) -> Option<&str> {
        match &self.subject {
            Subject::Write { node, .. } | Subject::Review { node } => {
                node.as_ref().map(NodeSummary::slug)
            }
            _ => None,
        }
    }

    fn id_payload(&self) -> IdPayload<'_> {
        IdPayload {
            phase: self.phase,
            kind: self.kind,
            severity: self.severity,
            proposed_action: self.proposed(),
            node: self.node_slug(),
            nodes: match &self.subject {
                Subject::Link { nodes, .. } => Some(IdNodes {
                    from: nodes.source_slug(),
                    to: nodes.target_slug(),
                }),
                _ => None,
            },
            issue: match &self.subject {
                Subject::Issue(issue) => Some(IdIssue {
                    code: issue.code(),
                    slug: issue.slug(),
                    reference: issue_reference(issue),
                }),
                _ => None,
            },
            cycle: match &self.subject {
                Subject::Cycle { nodes, .. } => Some(nodes),
                _ => None,
            },
            reason: &self.reason,
        }
    }

    /// `maint_` and eight hex digits: FNV-1a over the UTF-16 code units of the payload's JSON.
    pub fn id(&self) -> String {
        let text = answer_format::json::to_string(&self.id_payload()).unwrap_or_default();
        let mut hash: u32 = 2_166_136_261;
        for unit in text.encode_utf16() {
            hash ^= u32::from(unit);
            hash = hash.wrapping_mul(16_777_619);
        }
        format!("maint_{hash:08x}")
    }
}

/// A step with its address, as the plan lists it.
pub struct Action<'a> {
    pub id: String,
    pub step: Step<'a>,
}

impl<'a> Action<'a> {
    pub fn of(step: Step<'a>) -> Self {
        Self {
            id: step.id(),
            step,
        }
    }

    pub fn is_executable(&self) -> bool {
        self.step.is_executable()
    }
}

impl Serialize for Action<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let step = &self.step;
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("id", &self.id)?;
        map.serialize_entry("executable", &step.is_executable())?;
        map.serialize_entry("phase", step.phase)?;
        map.serialize_entry("kind", step.kind)?;
        map.serialize_entry("severity", step.severity)?;
        map.serialize_entry("score", &step.score)?;
        map.serialize_entry("reason", &step.reason)?;
        match &step.subject {
            Subject::Issue(issue) => map.serialize_entry("issue", issue)?,
            Subject::Cycle { row, .. } => map.serialize_entry("cycle", row)?,
            Subject::Write { proposed, node } => {
                map.serialize_entry("proposedAction", proposed)?;
                map.serialize_entry("node", node)?;
            }
            Subject::Link { proposed, nodes } => {
                map.serialize_entry("proposedAction", proposed)?;
                map.serialize_entry("nodes", nodes)?;
            }
            Subject::Review { node } => map.serialize_entry("node", node)?,
        }
        map.end()
    }
}
