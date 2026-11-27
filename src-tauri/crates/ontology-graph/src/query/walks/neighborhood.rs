//! The nodes within `depth` edges of a seed, found breadth first and counted exactly. Reachability,
//! impact, blast radius, subgraph and the builder's context are all a cut of this one search.
//!
//! The search visits each node once and takes each edge at most twice, so its cost is the size of
//! what it reaches and never more; a node holds one parent, so no path is kept per node. An answer
//! cuts the list it writes at `limit` after counting, which is why its totals are exact.

use serde::Serialize;

use crate::compiled_graph::{CompiledGraph, Node, NodeId};
use crate::query::relation_set::RelationSet;
use crate::query::request::{Direction, DEPTH_MAX};

use super::graph_walk::{traversal_steps, Step};
use super::hop::Hop;

/// A node of an answer with how far it is from the seed.
#[derive(Serialize)]
pub struct NodeAtDistance<'a> {
    slug: &'a str,
    distance: usize,
    node: &'a Node,
}

impl<'a> NodeAtDistance<'a> {
    pub fn of(graph: &'a CompiledGraph, node: NodeId, distance: usize) -> Self {
        Self {
            slug: graph.node(node).slug(),
            distance,
            node: graph.node(node),
        }
    }
}

/// A node the search reached, and how.
#[derive(Debug, Clone, Copy)]
pub struct Reached {
    pub node: NodeId,
    pub distance: usize,
    parent: Option<usize>,
    /// The edge the search found the node by; the seed was found by none.
    pub arrived_by: Option<Hop>,
}

pub struct Neighborhood {
    reached: Vec<Reached>,
    hops: Vec<Hop>,
}

impl Neighborhood {
    /// Everything within `depth` of `seed` along the edges `direction` follows and `types` allows.
    pub fn explore(
        graph: &CompiledGraph,
        seed: NodeId,
        direction: Direction,
        depth: usize,
        types: Option<&RelationSet>,
    ) -> Self {
        Self::explore_by(graph.nodes().len(), seed, depth, |node| {
            traversal_steps(graph, node, direction, types)
        })
    }

    /// Everything within `depth` of `seed` along the steps `steps_of` gives for each node, in the
    /// order it gives them. `node_count` is the number of nodes in the graph.
    pub fn explore_by(
        node_count: usize,
        seed: NodeId,
        depth: usize,
        mut steps_of: impl FnMut(NodeId) -> Vec<Step>,
    ) -> Self {
        let depth = depth.min(DEPTH_MAX);
        let mut seen = vec![false; node_count];
        if let Some(slot) = seen.get_mut(seed.index()) {
            *slot = true;
        }
        let mut reached = vec![Reached {
            node: seed,
            distance: 0,
            parent: None,
            arrived_by: None,
        }];
        let mut hops: Vec<Hop> = Vec::new();
        let mut head = 0;
        while let Some(&current) = reached.get(head) {
            let index = head;
            head += 1;
            if current.distance >= depth {
                continue;
            }
            let mut previous: Option<Step> = None;
            for step in steps_of(current.node) {
                // A loop on the node itself is listed once going out and once coming in.
                if previous.is_some_and(|last| last.next == step.next && last.edge == step.edge) {
                    continue;
                }
                previous = Some(step);
                let hop = Hop {
                    edge: step.edge,
                    entered: current.node,
                    left: step.next,
                };
                hops.push(hop);
                let Some(slot) = seen.get_mut(step.next.index()) else {
                    continue;
                };
                if *slot {
                    continue;
                }
                *slot = true;
                reached.push(Reached {
                    node: step.next,
                    distance: current.distance + 1,
                    parent: Some(index),
                    arrived_by: Some(hop),
                });
            }
        }
        Self { reached, hops }
    }

    /// Every node reached, the seed first.
    pub fn reached(&self) -> &[Reached] {
        &self.reached
    }

    /// How many nodes besides the seed were reached.
    pub fn others(&self) -> usize {
        self.reached.len().saturating_sub(1)
    }

    /// Every edge the search took from a node it expanded, in the order it took them.
    pub fn hops(&self) -> &[Hop] {
        &self.hops
    }

    /// The nodes reached besides the seed, as places in [`Neighborhood::reached`]: the nearest
    /// first, and those equally near in the order of the graph.
    pub fn nearest_first(&self) -> Vec<usize> {
        let mut keyed: Vec<(usize, NodeId, usize)> = self
            .reached
            .iter()
            .enumerate()
            .skip(1)
            .map(|(place, row)| (row.distance, row.node, place))
            .collect();
        keyed.sort_unstable();
        keyed.into_iter().map(|(_, _, place)| place).collect()
    }

    /// The edges from the seed to the node at `place`, along the way the search found it.
    pub fn hops_to(&self, place: usize) -> Vec<Hop> {
        let mut hops = Vec::new();
        let mut at = self.reached.get(place);
        while let Some(row) = at {
            let Some(hop) = row.arrived_by else { break };
            hops.push(hop);
            at = row.parent.and_then(|parent| self.reached.get(parent));
        }
        hops.reverse();
        hops
    }
}

/// The edges among `hops` whose two ends both pass `keep`, in the order of the graph.
pub fn hops_between(
    graph: &CompiledGraph,
    hops: &[Hop],
    keep: impl Fn(NodeId) -> bool,
) -> Vec<Hop> {
    let mut among: Vec<Hop> = hops
        .iter()
        .copied()
        .filter(|hop| {
            let edge = graph.edge(hop.edge);
            keep(edge.from) && edge.to().is_some_and(&keep)
        })
        .collect();
    among.sort_by_key(|hop| hop.edge);
    among
}
