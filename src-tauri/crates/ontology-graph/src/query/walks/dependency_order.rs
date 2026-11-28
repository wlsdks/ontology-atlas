//! The order dependencies can be built in, which `health` reports as what a cycle blocks. Kahn's
//! algorithm by layers over distinct prerequisite pairs; it holds no recursion.

use std::collections::HashSet;

use serde::Serialize;

use crate::compiled_graph::{CompiledGraph, EdgeId, NodeId};
use crate::query::node_summary::NodeSummary;
use crate::query::relation_set::{allowed, RelationSet};

/// A node that waits on a cycle: prerequisites of it are still unordered when the layers end.
pub struct Blocked {
    pub node: NodeId,
    pub remaining_in_degree: usize,
}

/// The order dependencies can be built in, before any of it is written.
pub struct DependencyOrder {
    /// Nodes in the order of the graph that have a dependency edge.
    pub total_nodes: usize,
    /// `layers[rank]` holds the nodes whose prerequisites all sit in earlier layers.
    pub layers: Vec<Vec<NodeId>>,
    /// The nodes no layer could take, in the order of the graph.
    pub blocked: Vec<Blocked>,
}

impl DependencyOrder {
    pub fn ordered_count(&self) -> usize {
        self.layers.iter().map(Vec::len).sum()
    }

    pub fn is_acyclic(&self) -> bool {
        self.blocked.is_empty()
    }
}

/// The order of the nodes joined by the edges `types` allows.
pub fn order_dependencies(
    graph: &CompiledGraph,
    types: Option<&RelationSet>,
) -> DependencyOrder {
    let count = graph.nodes().len();

    let selected: Vec<EdgeId> = graph
        .edge_ids()
        .filter(|id| {
            let edge = graph.edge(*id);
            edge.is_resolved() && allowed(types, edge.via)
        })
        .collect();
    let mut in_set = vec![false; count];
    let mut dependents: Vec<Vec<NodeId>> = vec![Vec::new(); count];
    let mut indegree = vec![0_usize; count];
    let mut pairs: HashSet<(NodeId, NodeId)> = HashSet::new();
    for id in &selected {
        let edge = graph.edge(*id);
        let Some(prerequisite) = edge.to() else {
            continue;
        };
        let dependent = edge.from;
        for node in [dependent, prerequisite] {
            if let Some(slot) = in_set.get_mut(node.index()) {
                *slot = true;
            }
        }
        if !pairs.insert((prerequisite, dependent)) {
            continue;
        }
        if let Some(list) = dependents.get_mut(prerequisite.index()) {
            list.push(dependent);
        }
        if let Some(slot) = indegree.get_mut(dependent.index()) {
            *slot += 1;
        }
    }
    let slugs: Vec<NodeId> = graph
        .node_ids()
        .filter(|n| in_set.get(n.index()).copied().unwrap_or(false))
        .collect();

    let mut ready: Vec<NodeId> = slugs
        .iter()
        .copied()
        .filter(|node| indegree.get(node.index()).copied() == Some(0))
        .collect();
    ready.sort_unstable();
    let mut layers: Vec<Vec<NodeId>> = Vec::new();
    while !ready.is_empty() {
        let layer = std::mem::take(&mut ready);
        let mut next_ready: Vec<NodeId> = Vec::new();
        for node in &layer {
            let mut following = dependents.get(node.index()).cloned().unwrap_or_default();
            following.sort_unstable();
            for next in following {
                if let Some(slot) = indegree.get_mut(next.index()) {
                    *slot = slot.saturating_sub(1);
                    if *slot == 0 {
                        next_ready.push(next);
                    }
                }
            }
        }
        next_ready.sort_unstable();
        next_ready.dedup();
        layers.push(layer);
        ready = next_ready;
    }
    let blocked: Vec<Blocked> = slugs
        .iter()
        .filter_map(|&node| {
            let remaining_in_degree = indegree.get(node.index()).copied().unwrap_or(0);
            (remaining_in_degree > 0).then_some(Blocked {
                node,
                remaining_in_degree,
            })
        })
        .collect();
    DependencyOrder {
        total_nodes: slugs.len(),
        layers,
        blocked,
    }
}

/// A blocked node as an answer writes it.
#[derive(Serialize)]
pub struct BlockedRow<'a> {
    slug: &'a str,
    #[serde(rename = "remainingInDegree")]
    remaining_in_degree: usize,
    node: NodeSummary<'a>,
}

impl<'a> BlockedRow<'a> {
    pub fn of(graph: &'a CompiledGraph, blocked: &Blocked) -> Self {
        Self {
            slug: graph.node(blocked.node).slug(),
            remaining_in_degree: blocked.remaining_in_degree,
            node: NodeSummary::of(graph, blocked.node),
        }
    }
}
