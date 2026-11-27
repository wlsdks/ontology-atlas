//! What a call gets for an argument it leaves out, for the operations `query_plan` can describe in
//! numbers. Each operation reads its defaults from here and so does the plan, so a plan never
//! describes a call the operation would not run.

use crate::query::request::{Direction, QueryRequest};

/// A walk that expands outward from one node: how deep, how many rows, and which way it follows
/// edges when the call names none.
pub struct Expansion {
    pub depth: usize,
    pub limit: usize,
    direction: Direction,
    /// Whether `direction: "undirected"` is read as `both`, which the answer then writes.
    undirected_is_both: bool,
}

impl Expansion {
    pub fn direction(&self, request: &QueryRequest) -> Direction {
        if self.undirected_is_both {
            request.direction_undirected_as_both(self.direction)
        } else {
            request.direction_or(self.direction)
        }
    }

    pub fn depth(&self, request: &QueryRequest) -> usize {
        request.depth_or(self.depth)
    }

    pub fn limit(&self, request: &QueryRequest) -> usize {
        request.limit.unwrap_or(self.limit)
    }
}

pub const REACHABILITY: Expansion = Expansion {
    depth: 3,
    limit: 100,
    direction: Direction::Outgoing,
    undirected_is_both: false,
};

/// `impact` and `blast_radius`: what depends on a node.
pub const DEPENDENCY_IMPACT: Expansion = Expansion {
    depth: 2,
    limit: 100,
    direction: Direction::Incoming,
    undirected_is_both: true,
};

pub const SUBGRAPH: Expansion = Expansion {
    depth: 2,
    limit: 100,
    direction: Direction::Both,
    undirected_is_both: true,
};

pub const BUILDER_CONTEXT: Expansion = Expansion {
    depth: 1,
    limit: 100,
    direction: Direction::Both,
    undirected_is_both: true,
};

pub const NEIGHBORS_LIMIT: usize = 100;

/// The hops `path`, `all_paths` and `explain_relation` search.
pub const PATH_MAX_HOPS: usize = 5;
pub const ALL_PATHS_LIMIT: usize = 25;
pub const ALL_PATHS_SEARCH_BUDGET: usize = 5000;
pub const EXPLAIN_RELATION_LIMIT: usize = 20;

pub const MATCH_NODES_LIMIT: usize = 100;
pub const MATCH_EDGES_LIMIT: usize = 100;
pub const CENTRALITY_LIMIT: usize = 10;
