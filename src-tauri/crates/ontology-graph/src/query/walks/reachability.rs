//! `reachability`: every node within `depth` edges of one node, the way to each, and the edges
//! among the nodes shown.

use indexmap::IndexMap;
use serde::Serialize;

use super::graph_walk::traversal_steps;
use super::hop::{path_edges, Hop};
use super::neighborhood::{hops_between, Neighborhood};
use super::row_page::RowPage;
use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::edge_rows::PathEdge;
use crate::query::name_counts::{kind_counts, sorted_counts};
use crate::query::node_mask::NodeMask;
use crate::query::node_resolution::resolve;
use crate::query::node_summary::{summaries, NodeSummary};
use crate::query::query_error::QueryError;
use crate::query::relation_set::RelationSet;
use crate::query::request::{Direction, QueryRequest};

const DEFAULT_DEPTH: usize = 3;
const DEFAULT_LIMIT: usize = 100;

#[derive(Serialize)]
struct ReachabilitySummary {
    #[serde(rename = "reachableNodes")]
    reachable_nodes: usize,
    #[serde(rename = "traversedEdges")]
    traversed_edges: usize,
    layers: usize,
    #[serde(rename = "terminalNodes")]
    terminal_nodes: usize,
}

#[derive(Serialize)]
struct Layer<'a> {
    distance: usize,
    total: usize,
    nodes: Vec<NodeSummary<'a>>,
}

#[derive(Serialize)]
struct ReachedRow<'a> {
    slug: &'a str,
    distance: usize,
    path: Vec<&'a str>,
    edges: Vec<PathEdge<'a>>,
    node: NodeSummary<'a>,
}

#[derive(Serialize)]
pub struct ReachabilityAnswer<'a> {
    operation: &'static str,
    start: &'a str,
    node: NodeSummary<'a>,
    direction: Direction,
    depth: usize,
    summary: ReachabilitySummary,
    #[serde(rename = "byKind")]
    by_kind: IndexMap<String, usize>,
    #[serde(rename = "byRelation")]
    by_relation: IndexMap<String, usize>,
    layers: Vec<Layer<'a>>,
    paths: RowPage<ReachedRow<'a>>,
    #[serde(rename = "terminalNodes")]
    terminal_nodes: Vec<NodeSummary<'a>>,
    edges: RowPage<PathEdge<'a>>,
}

/// The nodes along `hops` from `start`, `start` first.
pub fn nodes_along(start: NodeId, hops: &[Hop]) -> impl Iterator<Item = NodeId> + '_ {
    std::iter::once(start).chain(hops.iter().map(|hop| hop.left))
}

pub fn reachability<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<ReachabilityAnswer<'a>, QueryError> {
    let start = resolve(graph, request.slug.as_deref(), "slug")?;
    let direction = request.direction_or(Direction::Outgoing);
    let depth = request.depth_or(DEFAULT_DEPTH);
    let limit = request.limit.unwrap_or(DEFAULT_LIMIT);
    let types = RelationSet::parse(request.types.as_deref(), "types")?;

    let neighborhood = Neighborhood::explore(graph, start, direction, depth, types.as_ref());
    let nearest = neighborhood.nearest_first();
    let shown: Vec<usize> = nearest.iter().copied().take(limit).collect();
    let shown_nodes: Vec<NodeId> = shown
        .iter()
        .filter_map(|&place| neighborhood.reached().get(place))
        .map(|row| row.node)
        .collect();
    let visible = NodeMask::of(
        graph,
        std::iter::once(start).chain(shown_nodes.iter().copied()),
    );
    let among = hops_between(graph, neighborhood.hops(), |node| visible.contains(node));

    let rows: Vec<ReachedRow<'a>> = shown
        .iter()
        .filter_map(|&place| {
            let row = neighborhood.reached().get(place)?;
            let hops = neighborhood.hops_to(place);
            Some(ReachedRow {
                slug: graph.node(row.node).slug(),
                distance: row.distance,
                path: nodes_along(start, &hops)
                    .map(|node| graph.node(node).slug())
                    .collect(),
                edges: path_edges(graph, hops.iter().copied()),
                node: NodeSummary::of(graph, row.node),
            })
        })
        .collect();

    let mut layers: Vec<Layer<'a>> = Vec::new();
    for &place in &shown {
        let Some(row) = neighborhood.reached().get(place) else {
            continue;
        };
        if layers
            .last()
            .is_none_or(|layer| layer.distance != row.distance)
        {
            layers.push(Layer {
                distance: row.distance,
                total: 0,
                nodes: Vec::new(),
            });
        }
        if let Some(layer) = layers.last_mut() {
            layer.total += 1;
            layer.nodes.push(NodeSummary::of(graph, row.node));
        }
    }

    let terminal: Vec<NodeId> = shown_nodes
        .iter()
        .copied()
        .filter(|&node| traversal_steps(graph, node, direction, types.as_ref()).is_empty())
        .collect();
    let reached_nodes = nearest
        .iter()
        .filter_map(|&place| neighborhood.reached().get(place))
        .map(|row| row.node);

    Ok(ReachabilityAnswer {
        operation: "reachability",
        start: graph.node(start).slug(),
        node: NodeSummary::of(graph, start),
        direction,
        depth,
        summary: ReachabilitySummary {
            reachable_nodes: nearest.len(),
            traversed_edges: among.len(),
            layers: layers.len(),
            terminal_nodes: terminal.len(),
        },
        by_kind: kind_counts(graph, reached_nodes),
        by_relation: sorted_counts(among.iter().map(|hop| graph.edge(hop.edge).via)),
        layers,
        paths: RowPage::new(nearest.len(), limit, rows),
        terminal_nodes: summaries(graph, terminal),
        edges: RowPage::new(
            among.len(),
            limit,
            path_edges(graph, among.iter().copied().take(limit)),
        ),
    })
}
