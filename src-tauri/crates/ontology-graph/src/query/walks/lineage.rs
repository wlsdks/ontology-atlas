//! `lineage`: what holds a node, all the way up, and what it holds, all the way down.
//!
//! [`lineage_reach`] is the search itself, with exact totals and the lists cut at `limit`, so a
//! profile of a node can ask for it without writing the answer.

use std::collections::HashSet;

use serde::Serialize;

use super::hop::{path_edges, Hop};
use super::neighborhood::{hops_between, Neighborhood};
use super::row_page::RowPage;
use crate::compiled_graph::{CompiledGraph, EdgeId, Node, NodeId};
use crate::query::containment_steps::{containment_steps, Way};
use crate::query::edge_rows::PathEdge;
use crate::query::node_mask::NodeMask;
use crate::query::node_resolution::resolve;
use crate::query::node_summary::NodeSummary;
use crate::query::operation_defaults::{LINEAGE_DEPTH, LINEAGE_LIMIT};
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;

/// A node that holds, or is held by, the center, and how.
#[derive(Debug, Clone, Copy)]
pub struct LineageNode {
    pub node: NodeId,
    /// How many containment steps from the center.
    pub distance: usize,
    /// The relation of the edge the search found the node by.
    pub via: &'static str,
}

/// Everything the center is held by, or everything it holds.
pub struct LineageSide {
    /// How many nodes, all of them.
    pub total: usize,
    /// The nearest `limit` of them, those equally near in the order of the graph.
    pub shown: Vec<LineageNode>,
}

impl LineageSide {
    pub fn limited(&self) -> bool {
        self.shown.len() < self.total
    }
}

pub struct LineageReach {
    pub ancestors: LineageSide,
    pub descendants: LineageSide,
    /// How many distinct edges the search took in all.
    pub edges_total: usize,
    /// The first `limit` of the edges between the center and the nodes shown, in the order of the
    /// graph.
    pub edges: Vec<Hop>,
}

/// One way along containment from the center: everything it reaches, nearest first.
struct Reach {
    neighborhood: Neighborhood,
    nearest: Vec<usize>,
}

impl Reach {
    fn new(graph: &CompiledGraph, center: NodeId, way: Way, depth: usize) -> Self {
        let neighborhood = Neighborhood::explore_by(graph.nodes().len(), center, depth, |node| {
            containment_steps(graph, node, way)
        });
        let nearest = neighborhood.nearest_first();
        Self {
            neighborhood,
            nearest,
        }
    }

    fn side(&self, graph: &CompiledGraph, limit: usize) -> LineageSide {
        LineageSide {
            total: self.nearest.len(),
            shown: self
                .nearest
                .iter()
                .take(limit)
                .filter_map(|&place| {
                    let row = self.neighborhood.reached().get(place)?;
                    Some(LineageNode {
                        node: row.node,
                        distance: row.distance,
                        via: graph.edge(row.arrived_by?.edge).via,
                    })
                })
                .collect(),
        }
    }
}

/// What holds `center` and what it holds, within `depth` steps along containment, with the
/// lists cut at `limit`.
pub fn lineage_reach(
    graph: &CompiledGraph,
    center: NodeId,
    depth: usize,
    limit: usize,
) -> LineageReach {
    let ancestors = Reach::new(graph, center, Way::Ancestors, depth);
    let descendants = Reach::new(graph, center, Way::Descendants, depth);
    let ancestors_side = ancestors.side(graph, limit);
    let descendants_side = descendants.side(graph, limit);

    let visible = NodeMask::of(
        graph,
        std::iter::once(center)
            .chain(ancestors_side.shown.iter().map(|held| held.node))
            .chain(descendants_side.shown.iter().map(|held| held.node)),
    );
    let mut taken: HashSet<EdgeId> = HashSet::new();
    let mut hops: Vec<Hop> = Vec::new();
    for reach in [&ancestors, &descendants] {
        for hop in hops_between(graph, reach.neighborhood.hops(), |_| true) {
            if taken.insert(hop.edge) {
                hops.push(hop);
            }
        }
    }
    hops.sort_by_key(|hop| hop.edge);
    let edges_total = hops.len();
    let edges: Vec<Hop> = hops
        .into_iter()
        .filter(|hop| {
            let edge = graph.edge(hop.edge);
            visible.contains(edge.from) && edge.to().is_some_and(|to| visible.contains(to))
        })
        .take(limit)
        .collect();
    LineageReach {
        ancestors: ancestors_side,
        descendants: descendants_side,
        edges_total,
        edges,
    }
}

#[derive(Serialize)]
struct LineageNodeRow<'a> {
    slug: &'a str,
    distance: usize,
    via: &'static str,
    node: NodeSummary<'a>,
}

/// One side of a lineage as an answer writes it: how many, whether some are missing, and the
/// nodes shown.
#[derive(Serialize)]
pub struct LineageRows<'a> {
    total: usize,
    limited: bool,
    nodes: Vec<LineageNodeRow<'a>>,
}

impl<'a> LineageRows<'a> {
    pub fn written(graph: &'a CompiledGraph, side: &LineageSide) -> Self {
        Self {
            total: side.total,
            limited: side.limited(),
            nodes: side
                .shown
                .iter()
                .map(|held| LineageNodeRow {
                    slug: graph.node(held.node).slug(),
                    distance: held.distance,
                    via: held.via,
                    node: NodeSummary::of(graph, held.node),
                })
                .collect(),
        }
    }
}

#[derive(Serialize)]
pub struct LineageAnswer<'a> {
    operation: &'static str,
    center: &'a str,
    node: &'a Node,
    depth: usize,
    ancestors: LineageRows<'a>,
    descendants: LineageRows<'a>,
    edges: RowPage<PathEdge<'a>>,
}

pub fn lineage<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<LineageAnswer<'a>, QueryError> {
    let center = resolve(graph, request.slug.as_deref(), "slug")?;
    let depth = request.depth_or(LINEAGE_DEPTH);
    let limit = request.limit.unwrap_or(LINEAGE_LIMIT);
    let reach = lineage_reach(graph, center, depth, limit);
    Ok(LineageAnswer {
        operation: "lineage",
        center: graph.node(center).slug(),
        node: graph.node(center),
        depth,
        ancestors: LineageRows::written(graph, &reach.ancestors),
        descendants: LineageRows::written(graph, &reach.descendants),
        edges: RowPage::partial(
            reach.edges_total,
            path_edges(graph, reach.edges.iter().copied()),
        ),
    })
}
