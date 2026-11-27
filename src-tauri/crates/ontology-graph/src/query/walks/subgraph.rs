//! `subgraph`: a node, the nodes within `depth` edges of it, and the edges among them.

use serde::Serialize;

use super::neighborhood::{Neighborhood, NodeAtDistance};
use crate::compiled_graph::{CompiledGraph, EdgeId, NodeId};
use crate::query::edge_rows::PathEdge;
use crate::query::node_mask::NodeMask;
use crate::query::node_resolution::resolve;
use crate::query::query_error::QueryError;
use crate::query::relation_set::{allowed, RelationSet};
use crate::query::request::{Direction, QueryRequest};

const DEFAULT_DEPTH: usize = 2;
const DEFAULT_LIMIT: usize = 100;

/// The cut of the neighborhood of a node that `subgraph` and `builder_context` answer with: the
/// first `limit` nodes, nearest first and the seed before any, and the first `limit` of the edges
/// among them. Both totals count everything found.
pub struct Subgraph {
    pub seed: NodeId,
    pub direction: Direction,
    pub depth: usize,
    pub total_nodes: usize,
    pub total_edges: usize,
    pub limited: bool,
    /// Each node shown with its distance from the seed.
    pub nodes: Vec<(NodeId, usize)>,
    /// Edges that the `types` of the call allow and that join two nodes shown, each once, in the
    /// order of the graph, whichever way the search went to find their ends.
    pub edges: Vec<EdgeId>,
}

impl Subgraph {
    /// The subgraph around the node `name` names.
    pub fn of_call(
        graph: &CompiledGraph,
        request: &QueryRequest,
        name: Option<&str>,
        default_depth: usize,
    ) -> Result<Self, QueryError> {
        let seed = resolve(graph, name, "slug")?;
        let direction = request.direction_undirected_as_both(Direction::Both);
        let depth = request.depth_or(default_depth);
        let limit = request.limit.unwrap_or(DEFAULT_LIMIT);
        let types = RelationSet::parse(request.types.as_deref(), "types")?;
        let neighborhood = Neighborhood::explore(graph, seed, direction, depth, types.as_ref());

        let total_nodes = neighborhood.others() + 1;
        let nodes: Vec<(NodeId, usize)> = std::iter::once((seed, 0))
            .chain(
                neighborhood
                    .nearest_first()
                    .into_iter()
                    .filter_map(|place| neighborhood.reached().get(place))
                    .map(|row| (row.node, row.distance)),
            )
            .take(limit)
            .collect();
        let shown = NodeMask::of(graph, nodes.iter().map(|&(node, _)| node));
        let mut among: Vec<EdgeId> = Vec::new();
        for &(node, _) in &nodes {
            for &id in graph.outgoing(node) {
                let edge = graph.edge(id);
                if allowed(types.as_ref(), edge.via)
                    && edge.to().is_some_and(|to| shown.contains(to))
                {
                    among.push(id);
                }
            }
        }
        among.sort_unstable();
        let total_edges = among.len();
        Ok(Self {
            seed,
            direction,
            depth,
            total_nodes,
            total_edges,
            limited: total_nodes > limit || total_edges > limit,
            nodes,
            edges: among.into_iter().take(limit).collect(),
        })
    }

    pub fn node_rows<'a>(&self, graph: &'a CompiledGraph) -> Vec<NodeAtDistance<'a>> {
        self.nodes
            .iter()
            .map(|&(node, distance)| NodeAtDistance::of(graph, node, distance))
            .collect()
    }

    /// The edges as rows that enter each edge at the end it starts from.
    pub fn edge_rows<'a>(&self, graph: &'a CompiledGraph) -> Vec<PathEdge<'a>> {
        self.edges
            .iter()
            .filter_map(|&id| {
                let edge = graph.edge(id);
                Some(PathEdge::of(graph, id, edge.from, edge.to()?))
            })
            .collect()
    }
}

#[derive(Serialize)]
pub struct SubgraphAnswer<'a> {
    operation: &'static str,
    seed: &'a str,
    direction: Direction,
    depth: usize,
    #[serde(rename = "totalNodes")]
    total_nodes: usize,
    #[serde(rename = "totalEdges")]
    total_edges: usize,
    limited: bool,
    nodes: Vec<NodeAtDistance<'a>>,
    edges: Vec<PathEdge<'a>>,
}

pub fn subgraph<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<SubgraphAnswer<'a>, QueryError> {
    let name = request.slug.as_deref().or(request.seed.as_deref());
    let slice = Subgraph::of_call(graph, request, name, DEFAULT_DEPTH)?;
    Ok(SubgraphAnswer {
        operation: "subgraph",
        seed: graph.node(slice.seed).slug(),
        direction: slice.direction,
        depth: slice.depth,
        total_nodes: slice.total_nodes,
        total_edges: slice.total_edges,
        limited: slice.limited,
        nodes: slice.node_rows(graph),
        edges: slice.edge_rows(graph),
    })
}
