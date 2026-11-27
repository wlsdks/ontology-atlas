//! The edges that leave a scope's nodes, sorted by where they end: inside the scope, at another
//! node, at code the vault only points to, or at a name no node has.

use indexmap::IndexMap;
use serde::Serialize;

use super::containment::Scope;
use crate::compiled_graph::{CompiledGraph, EdgeId};
use crate::query::edge_rows::CompiledEdge;
use crate::query::name_counts::sorted_counts;
use crate::query::node_summary::NodeSummary;

/// Where an edge that starts in a scope ends.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EdgeEnd {
    Internal,
    Boundary,
    External,
    Unresolved,
}

impl EdgeEnd {
    pub const fn name(self) -> &'static str {
        match self {
            Self::Internal => "internal",
            Self::Boundary => "boundary",
            Self::External => "external",
            Self::Unresolved => "unresolved",
        }
    }
}

pub fn classify(graph: &CompiledGraph, scope: &Scope, id: EdgeId) -> EdgeEnd {
    let edge = graph.edge(id);
    match edge.to() {
        Some(to) if scope.contains(to) => EdgeEnd::Internal,
        Some(_) => EdgeEnd::Boundary,
        None if edge.is_external() => EdgeEnd::External,
        None => EdgeEnd::Unresolved,
    }
}

/// The edges of a scope's nodes by where they end, each list in edge order.
#[derive(Debug, Default)]
pub struct ScopeEdges {
    pub internal: Vec<EdgeId>,
    pub boundary: Vec<EdgeId>,
    pub external: Vec<EdgeId>,
    pub unresolved: Vec<EdgeId>,
}

impl ScopeEdges {
    pub fn of(graph: &CompiledGraph, scope: &Scope) -> Self {
        let mut edges = Self::default();
        for id in graph.edge_ids() {
            if !scope.contains(graph.edge(id).from) {
                continue;
            }
            match classify(graph, scope, id) {
                EdgeEnd::Internal => edges.internal.push(id),
                EdgeEnd::Boundary => edges.boundary.push(id),
                EdgeEnd::External => edges.external.push(id),
                EdgeEnd::Unresolved => edges.unresolved.push(id),
            }
        }
        edges
    }
}

/// The edge counts a scope's summary shows.
#[derive(Serialize, Clone)]
pub struct EdgeTotals {
    #[serde(rename = "internalEdges")]
    internal: usize,
    #[serde(rename = "boundaryEdges")]
    boundary: usize,
    #[serde(rename = "externalEdges")]
    external: usize,
    #[serde(rename = "unresolvedEdges")]
    unresolved: usize,
}

impl From<&ScopeEdges> for EdgeTotals {
    fn from(edges: &ScopeEdges) -> Self {
        Self {
            internal: edges.internal.len(),
            boundary: edges.boundary.len(),
            external: edges.external.len(),
            unresolved: edges.unresolved.len(),
        }
    }
}

#[derive(Serialize)]
struct ScopeEdgeRow<'a> {
    #[serde(flatten)]
    edge: CompiledEdge<'a>,
    #[serde(rename = "fromNode")]
    from_node: NodeSummary<'a>,
    #[serde(rename = "toNode")]
    to_node: Option<NodeSummary<'a>>,
    #[serde(rename = "toScope")]
    to_scope: &'static str,
}

/// One list of a scope's edges as the profile answers show it: the count, the relations, and the
/// first `limit` edges with their two ends.
#[derive(Serialize)]
pub struct ScopeEdgeGroup<'a> {
    total: usize,
    #[serde(rename = "byRelation")]
    by_relation: IndexMap<String, usize>,
    limited: bool,
    edges: Vec<ScopeEdgeRow<'a>>,
}

impl<'a> ScopeEdgeGroup<'a> {
    pub fn of(graph: &'a CompiledGraph, scope: &Scope, ids: &[EdgeId], limit: usize) -> Self {
        Self {
            total: ids.len(),
            by_relation: sorted_counts(ids.iter().map(|id| graph.edge(*id).via)),
            limited: ids.len() > limit,
            edges: ids
                .iter()
                .take(limit)
                .map(|id| {
                    let edge = graph.edge(*id);
                    ScopeEdgeRow {
                        edge: CompiledEdge::of(graph, *id),
                        from_node: NodeSummary::of(graph, edge.from),
                        to_node: edge.to().map(|to| NodeSummary::of(graph, to)),
                        to_scope: classify(graph, scope, *id).name(),
                    }
                })
                .collect(),
        }
    }
}
