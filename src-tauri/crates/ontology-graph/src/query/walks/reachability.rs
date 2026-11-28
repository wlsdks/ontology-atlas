//! `reachability`: every node within `depth` edges of one node, the way to each, and the edges
//! among the nodes shown.

use indexmap::IndexMap;
use serde::Serialize;

use super::graph_walk::has_traversal_step;
use super::hop::{path_edges, Hop};
use super::neighborhood::{hops_between, Neighborhood, Reached};
use super::row_page::RowPage;
use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::edge_rows::PathEdge;
use crate::query::name_counts::{kind_counts, sorted_counts};
use crate::query::node_mask::NodeMask;
use crate::query::node_resolution::resolve;
use crate::query::node_summary::{summaries, NodeSummary};
use crate::query::operation_defaults::REACHABILITY;
use crate::query::query_error::QueryError;
use crate::query::relation_set::RelationSet;
use crate::query::request::{Direction, QueryRequest};

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
    let direction = REACHABILITY.direction(request);
    let depth = REACHABILITY.depth(request);
    let limit = REACHABILITY.limit(request);
    let types = RelationSet::parse(request.types.as_deref(), "types")?;

    let neighborhood = Neighborhood::explore(graph, start, direction, depth, types.as_ref());
    let nearest = neighborhood.nearest_first();
    let reached: Vec<&Reached> = nearest
        .iter()
        .filter_map(|&place| neighborhood.reached().get(place))
        .collect();
    let shown = reached.get(..limit.min(reached.len())).unwrap_or_default();
    let visible = NodeMask::of(
        graph,
        std::iter::once(start).chain(shown.iter().map(|row| row.node)),
    );
    // Every edge the search took is counted; the rows written are those between nodes shown.
    let traversed = hops_between(graph, neighborhood.hops(), |_| true);
    let among_shown: Vec<Hop> = traversed
        .iter()
        .copied()
        .filter(|hop| {
            let edge = graph.edge(hop.edge);
            visible.contains(edge.from) && edge.to().is_some_and(|to| visible.contains(to))
        })
        .take(limit)
        .collect();

    let rows: Vec<ReachedRow<'a>> = nearest
        .iter()
        .take(limit)
        .zip(shown)
        .map(|(&place, row)| {
            let hops = neighborhood.hops_to(place);
            ReachedRow {
                slug: graph.node(row.node).slug(),
                distance: row.distance,
                path: nodes_along(start, &hops)
                    .map(|node| graph.node(node).slug())
                    .collect(),
                edges: path_edges(graph, hops.iter().copied()),
                node: NodeSummary::of(graph, row.node),
            }
        })
        .collect();

    let mut layers: Vec<Layer<'a>> = Vec::new();
    for (index, row) in reached.iter().enumerate() {
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
            if index < limit {
                layer.nodes.push(NodeSummary::of(graph, row.node));
            }
        }
    }

    let terminal: Vec<NodeId> = reached
        .iter()
        .map(|row| row.node)
        .filter(|&node| !has_traversal_step(graph, node, direction, types.as_ref()))
        .collect();

    Ok(ReachabilityAnswer {
        operation: "reachability",
        start: graph.node(start).slug(),
        node: NodeSummary::of(graph, start),
        direction,
        depth,
        summary: ReachabilitySummary {
            reachable_nodes: reached.len(),
            traversed_edges: traversed.len(),
            layers: layers.len(),
            terminal_nodes: terminal.len(),
        },
        by_kind: kind_counts(graph, reached.iter().map(|row| row.node)),
        by_relation: sorted_counts(traversed.iter().map(|hop| graph.edge(hop.edge).via)),
        layers,
        paths: RowPage::new(reached.len(), limit, rows),
        terminal_nodes: summaries(graph, terminal.iter().copied().take(limit)),
        edges: RowPage::partial(
            traversed.len(),
            path_edges(graph, among_shown.iter().copied()),
        ),
    })
}
