//! Which edges a walk may follow from a node, in the order it follows them.

use answer_format::collation::compare_text;

use crate::compiled_graph::{CompiledGraph, EdgeId, NodeId};
use crate::query::relation_set::{allowed, RelationSet};
use crate::query::request::Direction;
use crate::query::views::name_reached;

/// One step of a walk: the edge and the node it leads to.
#[derive(Debug, Clone, Copy)]
pub struct Step {
    pub next: NodeId,
    pub edge: EdgeId,
}

/// The text edges are ordered by: `from:via:to:ref`.
pub fn edge_order_key(graph: &CompiledGraph, id: EdgeId) -> String {
    let edge = graph.edge(id);
    format!(
        "{}:{}:{}:{}",
        graph.node(edge.from).slug,
        edge.via,
        name_reached(graph, id),
        edge.reference
    )
}

/// The resolved edges leaving and entering `node` that `direction` follows and `types` allows,
/// each with the node on its other end, ordered by that node's slug and then the edge's own text.
pub fn traversal_steps(
    graph: &CompiledGraph,
    node: NodeId,
    direction: Direction,
    types: Option<&RelationSet>,
) -> Vec<Step> {
    let mut keyed: Vec<(String, Step)> = Vec::new();
    if direction.follows_outgoing() {
        for &id in graph.outgoing(node) {
            let edge = graph.edge(id);
            let Some(next) = edge.to() else { continue };
            if allowed(types, edge.via) {
                keyed.push((step_key(graph, next, id), Step { next, edge: id }));
            }
        }
    }
    if direction.follows_incoming() {
        for &id in graph.incoming(node) {
            let edge = graph.edge(id);
            if allowed(types, edge.via) {
                keyed.push((
                    step_key(graph, edge.from, id),
                    Step {
                        next: edge.from,
                        edge: id,
                    },
                ));
            }
        }
    }
    keyed.sort_by(|left, right| compare_text(&left.0, &right.0));
    keyed.into_iter().map(|(_, step)| step).collect()
}

fn step_key(graph: &CompiledGraph, next: NodeId, id: EdgeId) -> String {
    format!("{}:{}", graph.node(next).slug, edge_order_key(graph, id))
}
