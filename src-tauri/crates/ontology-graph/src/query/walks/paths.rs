//! `path`: how two nodes are connected. The shortest path is a breadth-first search that keeps one
//! predecessor per node.

use serde::Serialize;

use super::graph_walk::traversal_steps;
use super::hop::{path_edges, Hop};
use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::edge_rows::PathEdge;
use crate::query::node_resolution::resolve;
use crate::query::node_summary::{summaries, NodeSummary};
use crate::query::operation_defaults::PATH_MAX_HOPS;
use crate::query::query_error::QueryError;
use crate::query::relation_set::RelationSet;
use crate::query::request::{Direction, QueryRequest};

#[derive(Serialize)]
#[serde(untagged)]
pub enum PathAnswer<'a> {
    Found(PathFound<'a>),
    Missing(PathMissing<'a>),
}

#[derive(Serialize)]
pub struct PathFound<'a> {
    operation: &'static str,
    from: &'a str,
    to: &'a str,
    found: bool,
    #[serde(rename = "hopCount")]
    hop_count: usize,
    hops: Vec<&'a str>,
    nodes: Vec<NodeSummary<'a>>,
    edges: Vec<PathEdge<'a>>,
}

#[derive(Serialize)]
pub struct PathMissing<'a> {
    operation: &'static str,
    from: &'a str,
    to: &'a str,
    found: bool,
    #[serde(rename = "maxHops")]
    max_hops: usize,
    hops: [&'a str; 0],
    nodes: [&'a str; 0],
    edges: [&'a str; 0],
}

struct Visit {
    node: NodeId,
    depth: usize,
    parent: Option<usize>,
    via: Option<Hop>,
}

/// The fewest-hop path between two resolved nodes, as the pieces of a path.
pub(crate) struct ShortestPath {
    pub hops: Vec<NodeId>,
    pub edges: Vec<Hop>,
}

/// Breadth-first search from `from` to `to` within `max_hops`.
pub(crate) fn shortest_path(
    graph: &CompiledGraph,
    from: NodeId,
    to: NodeId,
    max_hops: usize,
    direction: Direction,
    types: Option<&RelationSet>,
) -> Option<ShortestPath> {
    if from == to {
        return Some(ShortestPath {
            hops: vec![from],
            edges: Vec::new(),
        });
    }
    let mut visited = vec![false; graph.nodes().len()];
    if let Some(slot) = visited.get_mut(from.index()) {
        *slot = true;
    }
    let mut queue = vec![Visit {
        node: from,
        depth: 0,
        parent: None,
        via: None,
    }];
    let mut head = 0;
    while let Some(current) = queue.get(head) {
        let current_index = head;
        head += 1;
        if current.depth >= max_hops {
            continue;
        }
        let (current_node, current_depth) = (current.node, current.depth);
        for step in traversal_steps(graph, current_node, direction, types) {
            if visited.get(step.next.index()).copied().unwrap_or(true) {
                continue;
            }
            if step.next == to {
                let mut hops = vec![to];
                let mut edges = vec![Hop {
                    edge: step.edge,
                    entered: current_node,
                    left: to,
                }];
                let mut at = current_index;
                while let Some(visit) = queue.get(at) {
                    let Some(parent) = visit.parent else { break };
                    hops.push(visit.node);
                    if let Some(via) = visit.via {
                        edges.push(via);
                    }
                    at = parent;
                }
                hops.push(from);
                hops.reverse();
                edges.reverse();
                return Some(ShortestPath { hops, edges });
            }
            if let Some(slot) = visited.get_mut(step.next.index()) {
                *slot = true;
            }
            queue.push(Visit {
                node: step.next,
                depth: current_depth + 1,
                parent: Some(current_index),
                via: Some(Hop {
                    edge: step.edge,
                    entered: current_node,
                    left: step.next,
                }),
            });
        }
    }
    None
}

pub fn path<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<PathAnswer<'a>, QueryError> {
    let from = resolve(graph, request.from.as_deref(), "from")?;
    let to = resolve(graph, request.to.as_deref(), "to")?;
    let max_hops = request.max_hops.unwrap_or(PATH_MAX_HOPS);
    let direction = Direction::for_paths(request.direction);
    let types = RelationSet::parse(request.types.as_deref(), "types")?;
    let from_slug = graph.node(from).slug();
    let to_slug = graph.node(to).slug();
    Ok(
        match shortest_path(graph, from, to, max_hops, direction, types.as_ref()) {
            Some(found) => PathAnswer::Found(PathFound {
                operation: "path",
                from: from_slug,
                to: to_slug,
                found: true,
                hop_count: found.hops.len() - 1,
                hops: found
                    .hops
                    .iter()
                    .map(|node| graph.node(*node).slug())
                    .collect(),
                nodes: summaries(graph, found.hops.iter().copied()),
                edges: path_edges(graph, found.edges.iter().copied()),
            }),
            None => PathAnswer::Missing(PathMissing {
                operation: "path",
                from: from_slug,
                to: to_slug,
                found: false,
                max_hops,
                hops: [],
                nodes: [],
                edges: [],
            }),
        },
    )
}
