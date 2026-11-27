//! One edge a walk took, with the node it entered from and the node it left to.

use crate::compiled_graph::{CompiledGraph, EdgeId, NodeId};
use crate::query::edge_rows::PathEdge;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Hop {
    pub edge: EdgeId,
    pub entered: NodeId,
    pub left: NodeId,
}

impl Hop {
    /// The edge as a path shows it.
    pub fn row(self, graph: &CompiledGraph) -> PathEdge<'_> {
        PathEdge::of(graph, self.edge, self.entered, self.left)
    }
}

/// The rows of `hops`, in their order.
pub fn path_edges<'a>(
    graph: &'a CompiledGraph,
    hops: impl IntoIterator<Item = Hop>,
) -> Vec<PathEdge<'a>> {
    hops.into_iter().map(|hop| hop.row(graph)).collect()
}
