//! `match_edges`: the edges that meet every condition given, in edge order. A scan, like
//! `match_nodes`: how many matched, the first `limit`, and the calls that prove the first one.

use serde::Serialize;

use super::follow_up::EdgeFollowUp;
use super::relation_filter::{edge_passes, EchoedRelations};
use crate::compiled_graph::{CompiledGraph, Edge, EdgeId, NodeId, Target};
use crate::query::edge_rows::CompiledEdge;
use crate::query::node_resolution::resolve;
use crate::query::node_summary::NodeSummary;
use crate::query::query_error::QueryError;
use crate::query::relation_set::{RelationSet, RELATION_TYPE_VALUES};
use crate::query::request::QueryRequest;

const DEFAULT_LIMIT: usize = 100;

/// The relations a `match_edges` call filters by: `types` when it names any, else the one in
/// `type` or its alias `relation`.
fn relation_filter(request: &QueryRequest) -> Result<Option<RelationSet>, QueryError> {
    if request
        .types
        .as_ref()
        .is_some_and(|types| !types.is_empty())
    {
        return RelationSet::parse(request.types.as_deref(), "types");
    }
    let arguments = &request.selection.arguments;
    let (field, value) = match (&arguments.relation_type, &arguments.relation) {
        (Some(value), _) => ("type", value),
        (None, Some(value)) => ("relation", value),
        (None, None) => return Ok(None),
    };
    if !RELATION_TYPE_VALUES.contains(&value.as_str()) {
        return Err(QueryError::NotAnAllowedValue {
            name: field.to_string(),
            received: value.clone(),
            allowed: RELATION_TYPE_VALUES.to_vec(),
        });
    }
    RelationSet::parse(Some(std::slice::from_ref(value)), field)
}

/// What an edge ends at, by kind: the kind of its node, or `external` or `unresolved`.
fn end_kind<'a>(graph: &'a CompiledGraph, edge: &Edge) -> &'a str {
    match edge.target {
        Target::Node(node) => match graph.node(node).kind() {
            "" => "unknown",
            kind => kind,
        },
        Target::External => "external",
        Target::Unresolved => "unresolved",
    }
}

struct EdgeConditions<'a> {
    graph: &'a CompiledGraph,
    types: Option<RelationSet>,
    from: Option<NodeId>,
    to: Option<NodeId>,
    from_kind: Option<&'a str>,
    to_kind: Option<&'a str>,
    include_external: bool,
    include_unresolved: bool,
}

impl EdgeConditions<'_> {
    fn accepts(&self, edge: &Edge) -> bool {
        edge_passes(
            self.types.as_ref(),
            self.include_external,
            self.include_unresolved,
            edge,
        ) && self.from.is_none_or(|from| edge.from == from)
            && self.to.is_none_or(|to| edge.to() == Some(to))
            && self
                .from_kind
                .is_none_or(|kind| self.graph.node(edge.from).kind() == kind)
            && self
                .to_kind
                .is_none_or(|kind| end_kind(self.graph, edge) == kind)
    }
}

#[derive(Serialize)]
struct EdgeMatch<'a> {
    #[serde(flatten)]
    edge: CompiledEdge<'a>,
    #[serde(rename = "fromNode")]
    from_node: NodeSummary<'a>,
    #[serde(rename = "toNode")]
    to_node: Option<NodeSummary<'a>>,
    #[serde(rename = "toKind")]
    to_kind: &'a str,
}

#[derive(Serialize)]
struct EchoedConditions {
    from: Option<String>,
    to: Option<String>,
    #[serde(rename = "fromKind")]
    from_kind: Option<String>,
    #[serde(rename = "toKind")]
    to_kind: Option<String>,
    #[serde(flatten)]
    relations: EchoedRelations,
    #[serde(rename = "includeExternal")]
    include_external: bool,
    #[serde(rename = "includeUnresolved")]
    include_unresolved: bool,
}

#[derive(Serialize)]
pub struct MatchEdgesAnswer<'a> {
    operation: &'static str,
    filters: EchoedConditions,
    #[serde(rename = "totalMatches")]
    total_matches: usize,
    limited: bool,
    edges: Vec<EdgeMatch<'a>>,
    #[serde(rename = "followUp", skip_serializing_if = "Option::is_none")]
    follow_up: Option<EdgeFollowUp<'a>>,
}

pub fn match_edges<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<MatchEdgesAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(DEFAULT_LIMIT);
    let arguments = &request.selection.arguments;
    let types = relation_filter(request)?;
    let from = request
        .from
        .as_deref()
        .map(|name| resolve(graph, Some(name), "from"))
        .transpose()?;
    let to = request
        .to
        .as_deref()
        .map(|name| resolve(graph, Some(name), "to"))
        .transpose()?;
    let conditions = EdgeConditions {
        graph,
        types,
        from,
        to,
        from_kind: arguments.from_kind.as_deref(),
        to_kind: arguments.to_kind.as_deref(),
        include_external: request.include_external.unwrap_or(false),
        include_unresolved: request.include_unresolved.unwrap_or(false),
    };
    let matched: Vec<EdgeId> = graph
        .edge_ids()
        .filter(|id| conditions.accepts(graph.edge(*id)))
        .collect();
    let rows: Vec<EdgeMatch<'a>> = matched
        .iter()
        .take(limit)
        .map(|id| {
            let edge = graph.edge(*id);
            EdgeMatch {
                edge: CompiledEdge::of(graph, *id),
                from_node: NodeSummary::of(graph, edge.from),
                to_node: edge.to().map(|node| NodeSummary::of(graph, node)),
                to_kind: end_kind(graph, edge),
            }
        })
        .collect();
    let follow_up = matched.first().and_then(|id| {
        let edge = graph.edge(*id);
        let to = edge.to()?;
        Some(EdgeFollowUp::about(
            graph.node(edge.from).slug(),
            graph.node(to).slug(),
            edge.via,
        ))
    });
    Ok(MatchEdgesAnswer {
        operation: "match_edges",
        filters: EchoedConditions {
            from: from.map(|node| graph.node(node).slug().to_string()),
            to: to.map(|node| graph.node(node).slug().to_string()),
            from_kind: arguments.from_kind.clone(),
            to_kind: arguments.to_kind.clone(),
            relations: EchoedRelations::of(conditions.types.as_ref()),
            include_external: conditions.include_external,
            include_unresolved: conditions.include_unresolved,
        },
        total_matches: matched.len(),
        limited: matched.len() > limit,
        edges: rows,
        follow_up,
    })
}
