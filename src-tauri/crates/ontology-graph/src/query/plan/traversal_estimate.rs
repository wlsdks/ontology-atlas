//! What a search from one node would look at, counted level by level without running it: how many
//! edges each level offers, how many nodes it newly reaches, and the most paths those edges could
//! make. The count is a ceiling, not a prediction: it multiplies each level's edge count into the
//! last, so it grows without limit on a graph that is rich in cycles. It is a number that may pass
//! any integer, so it is held as one.

use serde::Serialize;

use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::node_mask::NodeMask;
use crate::query::relation_set::RelationSet;
use crate::query::request::Direction;
use crate::query::walks::graph_walk::traversal_steps;

#[derive(Serialize)]
pub struct FrontierLevel {
    distance: usize,
    #[serde(rename = "frontierNodes")]
    frontier_nodes: usize,
    #[serde(rename = "candidateEdges")]
    candidate_edges: usize,
    #[serde(rename = "newNodes")]
    new_nodes: usize,
}

pub struct TraversalEstimate {
    pub edge_scans: usize,
    pub reachable_within_depth: usize,
    pub potential_path_upper_bound: f64,
    pub frontier_by_depth: Vec<FrontierLevel>,
}

/// Counts the search of `depth` levels from `start` that follows `direction` along `types`. Each
/// node is expanded once, so the work is at most `depth` times the edges of the graph.
pub fn estimate_traversal(
    graph: &CompiledGraph,
    start: NodeId,
    direction: Direction,
    types: Option<&RelationSet>,
    depth: usize,
) -> TraversalEstimate {
    let mut visited = NodeMask::of(graph, [start]);
    let mut reached = 0_usize;
    let mut frontier = vec![start];
    let mut edge_scans = 0_usize;
    let mut potential = 1.0_f64;
    let mut levels = Vec::new();
    for distance in 1..=depth {
        let mut next: Vec<NodeId> = Vec::new();
        let mut candidate_edges = 0_usize;
        for node in &frontier {
            let steps = traversal_steps(graph, *node, direction, types);
            candidate_edges += steps.len();
            next.extend(
                steps
                    .iter()
                    .map(|step| step.next)
                    .filter(|next| !visited.contains(*next)),
            );
        }
        next.sort_unstable();
        next.dedup();
        edge_scans += candidate_edges;
        potential *= candidate_edges.max(1) as f64;
        for node in &next {
            visited.insert(*node);
        }
        reached += next.len();
        levels.push(FrontierLevel {
            distance,
            frontier_nodes: frontier.len(),
            candidate_edges,
            new_nodes: next.len(),
        });
        frontier = next;
        if frontier.is_empty() {
            break;
        }
    }
    TraversalEstimate {
        edge_scans,
        reachable_within_depth: reached,
        potential_path_upper_bound: potential,
        frontier_by_depth: levels,
    }
}
