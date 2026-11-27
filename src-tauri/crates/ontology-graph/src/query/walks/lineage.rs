//! `lineage`: what holds a node, all the way up, and what it holds, all the way down.

use std::collections::HashSet;

use serde::Serialize;

use super::hop::{path_edges, Hop};
use super::neighborhood::{hops_between, Neighborhood};
use crate::compiled_graph::{CompiledGraph, Node, NodeId};
use crate::query::containment_steps::{containment_steps, Way};
use crate::query::edge_rows::PathEdge;
use crate::query::node_mask::NodeMask;
use crate::query::node_resolution::resolve;
use crate::query::node_summary::NodeSummary;
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;

const DEFAULT_DEPTH: usize = 20;
const DEFAULT_LIMIT: usize = 100;

#[derive(Serialize)]
pub struct LineageNode<'a> {
    slug: &'a str,
    distance: usize,
    via: &'static str,
    node: NodeSummary<'a>,
}

#[derive(Serialize)]
struct Side<'a> {
    total: usize,
    limited: bool,
    nodes: Vec<LineageNode<'a>>,
}

#[derive(Serialize)]
pub struct LineageAnswer<'a> {
    operation: &'static str,
    center: &'a str,
    node: &'a Node,
    depth: usize,
    ancestors: Side<'a>,
    descendants: Side<'a>,
    edges: Vec<PathEdge<'a>>,
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

    fn shown(&self, limit: usize) -> impl Iterator<Item = (NodeId, usize, Hop)> + '_ {
        self.nearest.iter().take(limit).filter_map(|&place| {
            let row = self.neighborhood.reached().get(place)?;
            Some((row.node, row.distance, row.arrived_by?))
        })
    }

    fn side<'a>(&self, graph: &'a CompiledGraph, limit: usize) -> Side<'a> {
        Side {
            total: self.nearest.len(),
            limited: self.nearest.len() > limit,
            nodes: self
                .shown(limit)
                .map(|(node, distance, hop)| LineageNode {
                    slug: graph.node(node).slug(),
                    distance,
                    via: graph.edge(hop.edge).via,
                    node: NodeSummary::of(graph, node),
                })
                .collect(),
        }
    }
}

pub fn lineage<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<LineageAnswer<'a>, QueryError> {
    let center = resolve(graph, request.slug.as_deref(), "slug")?;
    let depth = request.depth_or(DEFAULT_DEPTH);
    let limit = request.limit.unwrap_or(DEFAULT_LIMIT);
    let ancestors = Reach::new(graph, center, Way::Ancestors, depth);
    let descendants = Reach::new(graph, center, Way::Descendants, depth);

    let visible = NodeMask::of(
        graph,
        std::iter::once(center)
            .chain(ancestors.shown(limit).map(|(node, _, _)| node))
            .chain(descendants.shown(limit).map(|(node, _, _)| node)),
    );
    let mut seen: HashSet<Hop> = HashSet::new();
    let mut hops: Vec<Hop> = Vec::new();
    for reach in [&ancestors, &descendants] {
        for hop in hops_between(graph, reach.neighborhood.hops(), |node| {
            visible.contains(node)
        }) {
            if seen.insert(hop) {
                hops.push(hop);
            }
        }
    }
    hops.sort_by_key(|hop| hop.edge);

    Ok(LineageAnswer {
        operation: "lineage",
        center: graph.node(center).slug(),
        node: graph.node(center),
        depth,
        ancestors: ancestors.side(graph, limit),
        descendants: descendants.side(graph, limit),
        edges: path_edges(graph, hops),
    })
}
