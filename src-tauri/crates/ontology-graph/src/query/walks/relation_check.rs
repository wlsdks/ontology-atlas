//! `relation_check`: whether an edge an agent wants to add is already there, is the reverse of one
//! that is, or would be a new kind of edge, and the write that would add it. A new `depends_on`
//! never comes with a ready write: it needs an ability that fails without the target, and a
//! person's approval of the direction.

use std::collections::HashMap;

use answer_format::collation::compare_text;
use answer_format::whitespace::trim;
use serde::Serialize;

use crate::compiled_graph::{CompiledGraph, EdgeId, Target};
use crate::query::edge_rows::{name_reached, CompiledEdge};
use crate::query::node_resolution::resolve;
use crate::query::query_error::QueryError;
use crate::query::relation_set::{public_relation_type, RELATION_TYPE_VALUES};
use crate::query::request::QueryRequest;

const NEARBY_LIMIT: usize = 5;
const EXAMPLES_PER_PATTERN: usize = 3;

#[derive(Serialize, Clone)]
struct EdgeExample<'a> {
    from: &'a str,
    to: &'a str,
    #[serde(rename = "ref")]
    reference: &'a str,
}

/// A kind of edge: what kind of node it leaves, which relation it is, and what it reaches. A
/// `to_kind` of `external` or `unresolved` is an edge that reaches no node.
#[derive(Serialize, Clone)]
struct EdgePattern<'a> {
    #[serde(rename = "fromKind")]
    from_kind: &'a str,
    relation: &'static str,
    #[serde(rename = "toKind")]
    to_kind: &'a str,
    count: usize,
    resolved: usize,
    external: usize,
    unresolved: usize,
    examples: Vec<EdgeExample<'a>>,
}

impl EdgePattern<'_> {
    fn is(&self, from_kind: &str, relation: &str, to_kind: &str) -> bool {
        self.from_kind == from_kind && self.relation == relation && self.to_kind == to_kind
    }
}

/// Every kind of edge the graph has, with how many of each.
fn edge_patterns(graph: &CompiledGraph) -> Vec<EdgePattern<'_>> {
    let mut patterns: Vec<EdgePattern<'_>> = Vec::new();
    let mut at: HashMap<(&str, &str, &str), usize> = HashMap::new();
    for id in graph.edge_ids() {
        let edge = graph.edge(id);
        let from_kind = graph.node(edge.from).kind();
        let to_kind = match edge.target {
            Target::Node(node) => graph.node(node).kind(),
            Target::External => "external",
            Target::Unresolved => "unresolved",
        };
        let place = *at.entry((from_kind, edge.via, to_kind)).or_insert_with(|| {
            patterns.push(EdgePattern {
                from_kind,
                relation: edge.via,
                to_kind,
                count: 0,
                resolved: 0,
                external: 0,
                unresolved: 0,
                examples: Vec::new(),
            });
            patterns.len() - 1
        });
        let Some(pattern) = patterns.get_mut(place) else {
            continue;
        };
        pattern.count += 1;
        match edge.target {
            Target::Node(_) => pattern.resolved += 1,
            Target::External => pattern.external += 1,
            Target::Unresolved => pattern.unresolved += 1,
        }
        if pattern.examples.len() < EXAMPLES_PER_PATTERN {
            pattern.examples.push(EdgeExample {
                from: graph.node(edge.from).slug(),
                to: name_reached(graph, id),
                reference: &edge.reference,
            });
        }
    }
    patterns
}

#[derive(Serialize)]
struct NearbyPattern<'a> {
    #[serde(flatten)]
    pattern: EdgePattern<'a>,
    /// How many of the pattern's three parts match the proposed edge's.
    similarity: usize,
}

#[derive(Serialize)]
struct Recommendation {
    decision: &'static str,
    severity: &'static str,
    reason: String,
}

#[derive(Serialize)]
struct ProposedRelation<'a> {
    from: &'a str,
    to: &'a str,
    #[serde(rename = "type")]
    relation: &'static str,
}

#[derive(Serialize)]
struct ProposedArguments<'a> {
    relations: [ProposedRelation<'a>; 1],
}

#[derive(Serialize)]
struct ProposedAction<'a> {
    tool: &'static str,
    args: ProposedArguments<'a>,
}

#[derive(Serialize)]
struct ApprovalGate {
    status: &'static str,
    #[serde(rename = "writeAllowed")]
    write_allowed: bool,
    required: [&'static str; 4],
    next: &'static str,
}

#[derive(Serialize)]
pub struct RelationCheckAnswer<'a> {
    operation: &'static str,
    from: &'a str,
    to: &'a str,
    relation: &'static str,
    #[serde(rename = "fromKind")]
    from_kind: &'a str,
    #[serde(rename = "toKind")]
    to_kind: &'a str,
    exists: bool,
    verdict: &'static str,
    recommendation: Recommendation,
    #[serde(rename = "matchingEdges")]
    matching_edges: Vec<CompiledEdge<'a>>,
    #[serde(rename = "inverseEdges")]
    inverse_edges: Vec<CompiledEdge<'a>>,
    #[serde(rename = "schemaPattern")]
    schema_pattern: Option<EdgePattern<'a>>,
    #[serde(rename = "nearbyPatterns")]
    nearby_patterns: Vec<NearbyPattern<'a>>,
    #[serde(rename = "proposedAction")]
    proposed_action: Option<ProposedAction<'a>>,
    #[serde(rename = "approvalGate")]
    approval_gate: Option<ApprovalGate>,
}

/// The relation the call proposes, by the name edges carry.
fn proposed_relation(request: &QueryRequest) -> Result<&'static str, QueryError> {
    let (argument, label) = match (&request.relation_type, &request.relation) {
        (Some(text), _) => (Some(text), "type"),
        (None, other) => (other.as_ref(), "relation"),
    };
    let Some(text) = argument.filter(|text| !trim(text).is_empty()) else {
        return Err(QueryError::Invalid(
            "type (string) is required for relation_check.".to_string(),
        ));
    };
    let name = trim(text);
    match RELATION_TYPE_VALUES.iter().find(|known| **known == name) {
        Some(&"depends_on") => Ok("dependencies"),
        Some(&known) => Ok(known),
        None => Err(QueryError::NotAnAllowedValue {
            name: label.to_string(),
            received: name.to_string(),
            allowed: RELATION_TYPE_VALUES.to_vec(),
        }),
    }
}

fn recommendation(
    exists: bool,
    inverse_exists: bool,
    pattern_known: bool,
    from_kind: &str,
    relation: &str,
    to_kind: &str,
) -> Recommendation {
    if exists {
        return Recommendation {
            decision: "skip_existing",
            severity: "info",
            reason: "Exact edge already exists; do not add another relation.".to_string(),
        };
    }
    if inverse_exists {
        return Recommendation {
            decision: "review_inverse",
            severity: "warn",
            reason: "Reverse edge with the same relation already exists; inspect direction before adding.".to_string(),
        };
    }
    if pattern_known {
        return Recommendation {
            decision: "safe_to_add",
            severity: "info",
            reason: format!("No exact or inverse edge found; {from_kind} --{relation}--> {to_kind} is an existing schema pattern."),
        };
    }
    Recommendation {
        decision: "review_new_schema",
        severity: "warn",
        reason: format!("No exact or inverse edge found; {from_kind} --{relation}--> {to_kind} would introduce a new schema pattern."),
    }
}

pub fn relation_check<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<RelationCheckAnswer<'a>, QueryError> {
    let relation = proposed_relation(request)?;
    let from = resolve(graph, request.from.as_deref(), "from")?;
    let to = resolve(graph, request.to.as_deref(), "to")?;
    let from_kind = graph.node(from).kind();
    let to_kind = graph.node(to).kind();

    let joining = |source, target| -> Vec<EdgeId> {
        graph
            .outgoing(source)
            .iter()
            .copied()
            .filter(|&id| {
                let edge = graph.edge(id);
                edge.via == relation && edge.to() == Some(target)
            })
            .collect()
    };
    let existing = joining(from, to);
    let inverse = joining(to, from);

    let patterns = edge_patterns(graph);
    let matched = patterns
        .iter()
        .find(|pattern| pattern.is(from_kind, relation, to_kind))
        .cloned();
    let mut nearby: Vec<NearbyPattern<'a>> = patterns
        .iter()
        .filter(|pattern| !pattern.is(from_kind, relation, to_kind))
        .map(|pattern| NearbyPattern {
            similarity: usize::from(pattern.from_kind == from_kind)
                + usize::from(pattern.relation == relation)
                + usize::from(pattern.to_kind == to_kind),
            pattern: pattern.clone(),
        })
        .filter(|row| row.similarity > 0)
        .collect();
    nearby.sort_by(|left, right| {
        right
            .similarity
            .cmp(&left.similarity)
            .then_with(|| right.pattern.count.cmp(&left.pattern.count))
            .then_with(|| compare_text(left.pattern.from_kind, right.pattern.from_kind))
            .then_with(|| compare_text(left.pattern.relation, right.pattern.relation))
            .then_with(|| compare_text(left.pattern.to_kind, right.pattern.to_kind))
    });
    nearby.truncate(NEARBY_LIMIT);

    let exists = !existing.is_empty();
    let verdict = if exists {
        "already_exists"
    } else if matched.is_some() {
        "matches_existing_schema"
    } else {
        "new_schema_pattern"
    };
    let needs_semantic_approval = !exists && relation == "dependencies";
    let proposed_action = (!exists && !needs_semantic_approval).then(|| ProposedAction {
        tool: "add_relations",
        args: ProposedArguments {
            relations: [ProposedRelation {
                from: graph.node(from).slug(),
                to: graph.node(to).slug(),
                relation: public_relation_type(relation),
            }],
        },
    });
    let approval_gate = needs_semantic_approval.then_some(ApprovalGate {
        status: "semantic_approval_required",
        write_allowed: false,
        required: [
            "observable_ability",
            "semantic_rationale",
            "explicit_human_approval",
            "why",
        ],
        next: "Explain which observable ability fails without the target, ask for approval of the exact direction and rationale, then call add_relations with a nonblank why on the row.",
    });

    Ok(RelationCheckAnswer {
        operation: "relation_check",
        from: graph.node(from).slug(),
        to: graph.node(to).slug(),
        relation,
        from_kind,
        to_kind,
        exists,
        verdict,
        recommendation: recommendation(
            exists,
            !inverse.is_empty(),
            matched.is_some(),
            from_kind,
            relation,
            to_kind,
        ),
        matching_edges: existing
            .iter()
            .map(|&id| CompiledEdge::of(graph, id))
            .collect(),
        inverse_edges: inverse
            .iter()
            .map(|&id| CompiledEdge::of(graph, id))
            .collect(),
        schema_pattern: matched,
        nearby_patterns: nearby,
        proposed_action,
        approval_gate,
    })
}
