//! The edges at each node, every node's list in one array: a node's edges are the run from its
//! start to the next node's. A graph of fifty thousand nodes keeps two arrays per direction, not
//! fifty thousand lists, each its own allocation.

use crate::compiled_graph::{EdgeId, NodeId};

#[derive(Debug, Default)]
pub(crate) struct Adjacency {
    /// Where each node's run starts in `edges`, and after the last node where the last run ends.
    starts: Box<[usize]>,
    edges: Box<[EdgeId]>,
}

impl Adjacency {
    /// The edges at each of `node_count` nodes, from `(node, edge)` pairs in edge order: each run
    /// keeps that order.
    pub(crate) fn of(
        node_count: usize,
        pairs: impl Iterator<Item = (NodeId, EdgeId)> + Clone,
    ) -> Self {
        let mut starts = vec![0_usize; node_count + 1];
        for (node, _) in pairs.clone() {
            if let Some(count) = starts.get_mut(node.index() + 1) {
                *count += 1;
            }
        }
        let mut running = 0;
        for start in &mut starts {
            running += *start;
            *start = running;
        }
        let mut edges = vec![EdgeId::from_index(0); running];
        let mut next = starts.clone();
        for (node, edge) in pairs {
            if let Some(at) = next.get_mut(node.index()) {
                if let Some(slot) = edges.get_mut(*at) {
                    *slot = edge;
                }
                *at += 1;
            }
        }
        Self {
            starts: starts.into_boxed_slice(),
            edges: edges.into_boxed_slice(),
        }
    }

    /// The edges at `node`, in edge order.
    pub(crate) fn at(&self, node: NodeId) -> &[EdgeId] {
        let start = self.starts.get(node.index()).copied().unwrap_or(0);
        let end = self.starts.get(node.index() + 1).copied().unwrap_or(start);
        self.edges.get(start..end).unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_node_gets_its_own_edges_in_edge_order() {
        let pairs = [(2, 0), (0, 1), (2, 2), (2, 3), (0, 4)]
            .map(|(node, edge)| (NodeId::from_index(node), EdgeId::from_index(edge)));
        let adjacency = Adjacency::of(4, pairs.iter().copied());
        let at = |node: usize| -> Vec<usize> {
            adjacency
                .at(NodeId::from_index(node))
                .iter()
                .map(|edge| edge.index())
                .collect()
        };
        assert_eq!(at(0), [1, 4]);
        assert_eq!(at(1), Vec::<usize>::new());
        assert_eq!(at(2), [0, 2, 3]);
        assert_eq!(at(3), Vec::<usize>::new());
        assert_eq!(at(9), Vec::<usize>::new(), "a node past the end has none");
    }
}
