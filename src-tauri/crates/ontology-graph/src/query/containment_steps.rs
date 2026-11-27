//! What contains what. `domains`, `capabilities`, `elements` and `contains` lead from a container
//! to what it holds; `domain` leads the other way, from a node to its domain. A node's children
//! and parents are found from its own edges, so asking about one node never reads the rest.

use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::step::Step;

const DOWNWARD: [&str; 4] = ["domains", "capabilities", "elements", "contains"];
const UPWARD: &str = "domain";

/// Which way along containment a step goes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Way {
    /// To what the node holds.
    Descendants,
    /// To what holds the node.
    Ancestors,
}

/// The containment edges at `node` that lead `way`, each with the node on its other end, in the
/// order of that node and then the edge. A node may be reached by more than one edge.
pub fn containment_steps(graph: &CompiledGraph, node: NodeId, way: Way) -> Vec<Step> {
    let mut steps: Vec<Step> = Vec::new();
    let (down_from, up_from) = match way {
        Way::Descendants => (graph.outgoing(node), graph.incoming(node)),
        Way::Ancestors => (graph.incoming(node), graph.outgoing(node)),
    };
    for &id in down_from {
        let edge = graph.edge(id);
        if !DOWNWARD.contains(&edge.via) {
            continue;
        }
        let next = match way {
            Way::Descendants => edge.to(),
            Way::Ancestors => Some(edge.from),
        };
        if let Some(next) = next {
            steps.push(Step { next, edge: id });
        }
    }
    for &id in up_from {
        let edge = graph.edge(id);
        if edge.via != UPWARD {
            continue;
        }
        let next = match way {
            Way::Descendants => Some(edge.from),
            Way::Ancestors => edge.to(),
        };
        if let Some(next) = next {
            steps.push(Step { next, edge: id });
        }
    }
    steps.sort_unstable_by_key(|step| (step.next, step.edge));
    steps
}

/// One step to each node: when `domain` and another relation both reach a node, the other one
/// speaks for the pair.
fn one_step_per_node(graph: &CompiledGraph, steps: Vec<Step>) -> Vec<Step> {
    let mut kept: Vec<Step> = Vec::with_capacity(steps.len());
    for step in steps {
        match kept.last_mut() {
            Some(last) if last.next == step.next => {
                if graph.edge(last.edge).via == UPWARD && graph.edge(step.edge).via != UPWARD {
                    *last = step;
                }
            }
            _ => kept.push(step),
        }
    }
    kept
}

/// What `node` holds, one step to each child, in the order of the graph.
pub fn children(graph: &CompiledGraph, node: NodeId) -> Vec<Step> {
    one_step_per_node(graph, containment_steps(graph, node, Way::Descendants))
}

/// What holds `node`, one step to each parent, in the order of the graph.
pub fn parents(graph: &CompiledGraph, node: NodeId) -> Vec<Step> {
    one_step_per_node(graph, containment_steps(graph, node, Way::Ancestors))
}

/// Whether something holds `node`.
pub fn has_parent(graph: &CompiledGraph, node: NodeId) -> bool {
    let held = graph.incoming(node).iter().any(|&id| {
        let edge = graph.edge(id);
        DOWNWARD.contains(&edge.via)
    });
    held || graph.outgoing(node).iter().any(|&id| {
        let edge = graph.edge(id);
        edge.via == UPWARD && edge.is_resolved()
    })
}
