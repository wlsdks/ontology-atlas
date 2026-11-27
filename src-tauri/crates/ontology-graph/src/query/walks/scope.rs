//! A scope is a node and everything it holds, and the edges that start inside it are told apart
//! by where they end: in the scope, outside it, in code no node has, or nowhere.

use serde::Serialize;

use super::containment::children;
use super::neighborhood::is_set;
use crate::compiled_graph::{CompiledGraph, EdgeId, NodeId, Target};
use crate::query::edge_rows::CompiledEdge;
use crate::query::name_counts::sorted_counts;
use crate::query::node_summary::NodeSummary;

/// The nodes a root holds, itself included, in the order of the graph.
pub struct Scope {
    pub nodes: Vec<NodeId>,
    mask: Vec<bool>,
}

impl Scope {
    /// Every node that any of `roots` holds, directly or through what it holds.
    pub fn holding(graph: &CompiledGraph, roots: &[NodeId]) -> Self {
        let mut mask = vec![false; graph.nodes().len()];
        let mut queue: Vec<NodeId> = Vec::new();
        for &root in roots {
            if let Some(slot) = mask.get_mut(root.index()) {
                if !*slot {
                    *slot = true;
                    queue.push(root);
                }
            }
        }
        let mut head = 0;
        while let Some(&current) = queue.get(head) {
            head += 1;
            for step in children(graph, current) {
                if let Some(slot) = mask.get_mut(step.next.index()) {
                    if !*slot {
                        *slot = true;
                        queue.push(step.next);
                    }
                }
            }
        }
        queue.sort_unstable();
        Self { nodes: queue, mask }
    }

    pub fn of(graph: &CompiledGraph, root: NodeId) -> Self {
        Self::holding(graph, &[root])
    }

    pub fn contains(&self, node: NodeId) -> bool {
        is_set(&self.mask, node)
    }
}

/// Where the edges that start in a scope end.
pub struct ScopeEdges {
    pub internal: Vec<EdgeId>,
    pub boundary: Vec<EdgeId>,
    pub external: Vec<EdgeId>,
    pub unresolved: Vec<EdgeId>,
}

impl ScopeEdges {
    pub fn of(graph: &CompiledGraph, scope: &Scope) -> Self {
        let mut edges = Self {
            internal: Vec::new(),
            boundary: Vec::new(),
            external: Vec::new(),
            unresolved: Vec::new(),
        };
        for &node in &scope.nodes {
            for &id in graph.outgoing(node) {
                match graph.edge(id).target {
                    Target::Node(to) if scope.contains(to) => edges.internal.push(id),
                    Target::Node(_) => edges.boundary.push(id),
                    Target::External => edges.external.push(id),
                    Target::Unresolved => edges.unresolved.push(id),
                }
            }
        }
        for list in [
            &mut edges.internal,
            &mut edges.boundary,
            &mut edges.external,
            &mut edges.unresolved,
        ] {
            list.sort_unstable();
        }
        edges
    }
}

/// The counts a scope's summary writes: its edges by where they end.
#[derive(Serialize, Clone)]
pub struct EdgeCounts {
    #[serde(rename = "internalEdges")]
    internal_edges: usize,
    #[serde(rename = "boundaryEdges")]
    boundary_edges: usize,
    #[serde(rename = "externalEdges")]
    external_edges: usize,
    #[serde(rename = "unresolvedEdges")]
    unresolved_edges: usize,
}

impl EdgeCounts {
    pub fn of(edges: &ScopeEdges) -> Self {
        Self {
            internal_edges: edges.internal.len(),
            boundary_edges: edges.boundary.len(),
            external_edges: edges.external.len(),
            unresolved_edges: edges.unresolved.len(),
        }
    }
}

/// Where an edge that starts in a scope ends.
fn end_of(graph: &CompiledGraph, id: EdgeId, scope: &Scope) -> &'static str {
    match graph.edge(id).target {
        Target::Node(to) if scope.contains(to) => "internal",
        Target::External => "external",
        Target::Node(_) => "boundary",
        Target::Unresolved => "unresolved",
    }
}

#[derive(Serialize)]
struct ScopeEdge<'a> {
    #[serde(flatten)]
    edge: CompiledEdge<'a>,
    #[serde(rename = "fromNode")]
    from_node: NodeSummary<'a>,
    #[serde(rename = "toNode")]
    to_node: Option<NodeSummary<'a>>,
    #[serde(rename = "toScope")]
    to_scope: &'static str,
}

/// A kind of edge of a scope: how many, by relation, and the first `limit`.
#[derive(Serialize)]
pub struct ScopeEdgeGroup<'a> {
    total: usize,
    #[serde(rename = "byRelation")]
    by_relation: indexmap::IndexMap<String, usize>,
    limited: bool,
    edges: Vec<ScopeEdge<'a>>,
}

impl<'a> ScopeEdgeGroup<'a> {
    pub fn of(
        graph: &'a CompiledGraph,
        ids: &[EdgeId],
        scope: &Scope,
        limit: usize,
    ) -> Self {
        Self {
            total: ids.len(),
            by_relation: sorted_counts(ids.iter().map(|&id| graph.edge(id).via)),
            limited: ids.len() > limit,
            edges: ids
                .iter()
                .take(limit)
                .map(|&id| ScopeEdge {
                    edge: CompiledEdge::of(graph, id),
                    from_node: NodeSummary::of(graph, graph.edge(id).from),
                    to_node: graph.edge(id).to().map(|to| NodeSummary::of(graph, to)),
                    to_scope: end_of(graph, id, scope),
                })
                .collect(),
        }
    }
}
