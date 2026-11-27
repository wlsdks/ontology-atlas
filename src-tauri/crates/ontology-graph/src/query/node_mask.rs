//! A set of nodes of one graph, held as a flag per node so that asking whether a node is in it
//! costs one read however large the set.

use crate::compiled_graph::{CompiledGraph, NodeId};

pub struct NodeMask(Vec<bool>);

impl NodeMask {
    /// A set of the nodes of `graph` that holds none.
    pub fn empty(graph: &CompiledGraph) -> Self {
        Self(vec![false; graph.nodes().len()])
    }

    pub fn of(graph: &CompiledGraph, nodes: impl IntoIterator<Item = NodeId>) -> Self {
        let mut mask = Self::empty(graph);
        for node in nodes {
            mask.insert(node);
        }
        mask
    }

    /// Adds `node`; false when it was there already or is no node of the graph.
    pub fn insert(&mut self, node: NodeId) -> bool {
        match self.0.get_mut(node.index()) {
            Some(slot) if !*slot => {
                *slot = true;
                true
            }
            _ => false,
        }
    }

    pub fn contains(&self, node: NodeId) -> bool {
        self.0.get(node.index()).copied().unwrap_or(false)
    }
}
