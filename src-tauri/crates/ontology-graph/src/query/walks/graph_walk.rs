//! Which edges a walk may follow from a node, in the order it follows them.

use crate::compiled_graph::{CompiledGraph, EdgeId, NodeId};
use crate::query::edge_rows::name_reached;
use crate::query::relation_set::{allowed, RelationSet};
use crate::query::request::Direction;
use crate::query::step::Step;

/// The text edges are ordered by: `from:via:to:ref`.
pub fn edge_order_key(graph: &CompiledGraph, id: EdgeId) -> String {
    let edge = graph.edge(id);
    format!(
        "{}:{}:{}:{}",
        graph.node(edge.from).slug(),
        edge.via,
        name_reached(graph, id),
        edge.reference
    )
}

/// The resolved edges leaving and entering `node` that `direction` follows and `types` allows,
/// each with the node on its other end, ordered by that node and then by the edge. Both are
/// positions in the graph's own order, so no text is built to sort a hub's fifty thousand edges.
pub fn traversal_steps(
    graph: &CompiledGraph,
    node: NodeId,
    direction: Direction,
    types: Option<&RelationSet>,
) -> Vec<Step> {
    let mut steps: Vec<Step> = Vec::new();
    if direction.follows_outgoing() {
        for &id in graph.outgoing(node) {
            let edge = graph.edge(id);
            let Some(next) = edge.to() else { continue };
            if allowed(types, edge.via) {
                steps.push(Step { next, edge: id });
            }
        }
    }
    if direction.follows_incoming() {
        for &id in graph.incoming(node) {
            let edge = graph.edge(id);
            if allowed(types, edge.via) {
                steps.push(Step {
                    next: edge.from,
                    edge: id,
                });
            }
        }
    }
    steps.sort_unstable_by_key(|step| (step.next, step.edge));
    steps
}
