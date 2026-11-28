//! `neighbors`: the edges around one node.

use answer_format::collation::compare_text;
use serde::Serialize;

use super::graph_walk::edge_order_key;
use crate::compiled_graph::{CompiledGraph, EdgeId, Node, NodeId};
use crate::query::edge_rows::DirectedEdge;
use crate::query::node_resolution::resolve;
use crate::query::operation_defaults::{neighbors_direction, NEIGHBORS_LIMIT};
use crate::query::query_error::QueryError;
use crate::query::relation_set::{allowed, RelationSet};
use crate::query::request::QueryRequest;

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

/// The edges a call's filters let through: the relation is allowed, and an edge to code or to a
/// missing name is kept only when the call asked for those.
struct EdgeFilter<'a> {
    graph: &'a CompiledGraph,
    types: Option<&'a RelationSet>,
    include_external: bool,
    include_unresolved: bool,
}

impl<'a> EdgeFilter<'a> {
    fn of_call(
        graph: &'a CompiledGraph,
        request: &QueryRequest,
        types: Option<&'a RelationSet>,
    ) -> Self {
        Self {
            graph,
            types,
            include_external: request.include_external.unwrap_or(false),
            include_unresolved: request.include_unresolved.unwrap_or(false),
        }
    }

    fn passes(&self, id: EdgeId) -> bool {
        let edge = self.graph.edge(id);
        allowed(self.types, edge.via)
            && match edge.target {
                crate::compiled_graph::Target::Node(_) => true,
                crate::compiled_graph::Target::External => self.include_external,
                crate::compiled_graph::Target::Unresolved => self.include_unresolved,
            }
    }
}

/// How many edges around `center` the call's direction and filters let through: the number of rows
/// `neighbors` would list without a limit.
pub(in crate::query) fn count_filtered_edges(
    graph: &CompiledGraph,
    center: NodeId,
    request: &QueryRequest,
    types: Option<&RelationSet>,
) -> usize {
    let direction = neighbors_direction(request);
    let filter = EdgeFilter::of_call(graph, request, types);
    let leaving = if direction.follows_outgoing() {
        graph
            .outgoing(center)
            .iter()
            .filter(|id| filter.passes(**id))
            .count()
    } else {
        0
    };
    let entering = if direction.follows_incoming() {
        graph
            .incoming(center)
            .iter()
            .filter(|id| filter.passes(**id))
            .count()
    } else {
        0
    };
    leaving + entering
}

/// The edges of `center` that `direction` follows and the call's filters allow, entering edges
/// before leaving ones, each group in edge order.
fn filtered_edges(
    graph: &CompiledGraph,
    center: NodeId,
    request: &QueryRequest,
    types: Option<&RelationSet>,
) -> Vec<(&'static str, EdgeId)> {
    let direction = neighbors_direction(request);
    let filter = EdgeFilter::of_call(graph, request, types);
    let passes = |id: EdgeId| filter.passes(id);
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
    let limit = request.limit.unwrap_or(NEIGHBORS_LIMIT);
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
    neighbor_nodes.sort_unstable();
    Ok(NeighborsAnswer {
        operation: "neighbors",
        center: graph.node(center).slug(),
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
