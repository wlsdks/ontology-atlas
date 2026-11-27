//! A list of nodes cut to a limit, with how many there were before the cut.

use serde::Serialize;

use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::node_summary::NodeSummary;

#[derive(Serialize)]
pub struct LimitedNodes<'a> {
    total: usize,
    limited: bool,
    nodes: Vec<NodeSummary<'a>>,
}

impl<'a> LimitedNodes<'a> {
    pub fn of(graph: &'a CompiledGraph, ids: &[NodeId], limit: usize) -> Self {
        Self {
            total: ids.len(),
            limited: ids.len() > limit,
            nodes: ids
                .iter()
                .take(limit)
                .map(|id| NodeSummary::of(graph, *id))
                .collect(),
        }
    }
}
