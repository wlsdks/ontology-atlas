//! `neighbors`: the edges around one node.

use answer_format::collation::compare_text;
use serde::Serialize;

use crate::compiled_graph::{CompiledGraph, EdgeId, Node, NodeId};
use crate::query::graph_walk::edge_order_key;
use crate::query::node_resolution::resolve;
use crate::query::query_error::QueryError;
use crate::query::relation_set::{allowed, RelationSet};
use crate::query::request::{Direction, QueryRequest};
use crate::query::views::DirectedEdge;

const DEFAULT_LIMIT: usize = 100;

#[derive(Serialize)]
pub struct NeighborsAnswer<'a> {
    operation: &'static str,
    center: &'a str,
    node: &'a Node,
    total: usize,
    limited: bool,
    edges: Vec<DirectedEdge<'a>>,
    nodes: Vec<&'a Node>,
}

/// The edges of `center` that `direction` follows and the call's filters allow, entering edges
/// before leaving ones, each group in edge order.
fn filtered_edges(
    graph: &CompiledGraph,
    center: NodeId,
    request: &QueryRequest,
    types: Option<&RelationSet>,
) -> Vec<(&'static str, EdgeId)> {
    let direction = match request.direction {
        None | Some(Direction::Undirected) => Direction::Both,
        Some(other) => other,
    };
    let include_external = request.include_external.unwrap_or(false);
    let include_unresolved = request.include_unresolved.unwrap_or(false);
    let passes = |id: EdgeId| {
        let edge = graph.edge(id);
        allowed(types, edge.via)
            && match edge.target {
                crate::compiled_graph::Target::Node(_) => true,
                crate::compiled_graph::Target::External => include_external,
                crate::compiled_graph::Target::Unresolved => include_unresolved,
            }
    };
    let mut keyed: Vec<(String, &'static str, EdgeId)> = Vec::new();
    if direction.follows_outgoing() {
        for &id in graph.outgoing(center) {
            if passes(id) {
                keyed.push((
                    format!("outgoing:{}", edge_order_key(graph, id)),
                    "outgoing",
                    id,
                ));
            }
        }
    }
    if direction.follows_incoming() {
        for &id in graph.incoming(center) {
            if passes(id) {
                keyed.push((
                    format!("incoming:{}", edge_order_key(graph, id)),
                    "incoming",
                    id,
                ));
            }
        }
    }
    keyed.sort_by(|left, right| compare_text(&left.0, &right.0));
    keyed.into_iter().map(|(_, way, id)| (way, id)).collect()
}

pub fn neighbors<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<NeighborsAnswer<'a>, QueryError> {
    let center = resolve(graph, request.slug.as_deref(), "slug")?;
    let limit = request.limit.unwrap_or(DEFAULT_LIMIT);
    let types = RelationSet::parse(request.types.as_deref(), "types")?;
    let all = filtered_edges(graph, center, request, types.as_ref());
    let rows = all.get(..limit.min(all.len())).unwrap_or_default();
    let mut neighbor_nodes: Vec<NodeId> = Vec::new();
    for (way, id) in rows {
        let edge = graph.edge(*id);
        if let Some(to) = edge.to() {
            let neighbor = if *way == "incoming" { edge.from } else { to };
            if !neighbor_nodes.contains(&neighbor) {
                neighbor_nodes.push(neighbor);
            }
        }
    }
    graph.sort_by_code_units(&mut neighbor_nodes);
    Ok(NeighborsAnswer {
        operation: "neighbors",
        center: &graph.node(center).slug,
        node: graph.node(center),
        total: all.len(),
        limited: all.len() > rows.len(),
        edges: rows
            .iter()
            .map(|(way, id)| DirectedEdge::of(graph, *id, way))
            .collect(),
        nodes: neighbor_nodes
            .into_iter()
            .map(|id| graph.node(id))
            .collect(),
    })
}
