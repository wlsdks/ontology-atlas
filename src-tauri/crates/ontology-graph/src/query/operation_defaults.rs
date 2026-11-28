//! What a call gets for an argument it leaves out, for every operation. Each operation reads its
//! defaults from here and so does `query_plan`, so a plan never describes a call the operation
//! would not run and a default is changed in one place.

use crate::query::operation::{Operation, PendingOperation};
use crate::query::request::{Direction, QueryRequest};
use crate::query::selection::SelectionOperation;
use crate::query::walks::WalkOperation;

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

/// `neighbors` follows edges both ways unless the call names one; `undirected` is `both`.
pub fn neighbors_direction(request: &QueryRequest) -> Direction {
    request.direction_undirected_as_both(Direction::Both)
}
pub const NEIGHBORS_LIMIT: usize = 100;

/// The hops `path` and `explain_relation` search.
pub const PATH_MAX_HOPS: usize = 5;
pub const EXPLAIN_RELATION_LIMIT: usize = 20;
pub const PATTERN_WALK_LIMIT: usize = 100;

pub const LINEAGE_DEPTH: usize = 20;
pub const LINEAGE_LIMIT: usize = 100;
pub const CONTAINMENT_TREE_DEPTH: usize = 20;
pub const CONTAINMENT_TREE_LIMIT: usize = 200;
pub const PROJECT_SCOPE_LIMIT: usize = 200;
pub const PROJECT_MAP_LIMIT: usize = 50;
pub const PROJECT_MAP_ITEM_LIMIT: usize = 20;

pub const CYCLES_LIMIT: usize = 20;
pub const CYCLES_MAX_HOPS: usize = 8;
pub const CYCLES_SEARCH_BUDGET: usize = 5000;

pub const MATCH_NODES_LIMIT: usize = 100;
/// The rounds `communities` runs.
pub const ITERATIONS: usize = 20;
pub const SIMILAR_NODES_LIMIT: usize = 10;
/// `components` and `communities`: how many groups, and how many nodes of each.
pub const CLUSTER_GROUP_LIMIT: usize = 20;
pub const CLUSTER_NODE_LIMIT: usize = 25;
/// `overview` and `facets`; `schema` lists more.
pub const OVERVIEW_LIMIT: usize = 10;
pub const SCHEMA_LIMIT: usize = 50;

pub const NODE_PROFILE_LIMIT: usize = 20;
pub const NODE_PROFILE_DEPTH: usize = 3;
pub const DOMAIN_MATRIX_LIMIT: usize = 100;

pub const RECOMMEND_RELATIONS_LIMIT: usize = 50;
pub const GROWTH_PLAN_LIMIT: usize = 25;
pub const MAINTENANCE_PLAN_LIMIT: usize = 25;
pub const WORKSPACE_BRIEF_LIMIT: usize = 10;

/// `health` has no `limit`: it cuts each of its lists by a limit of its own.
pub const HEALTH_COMPONENT_LIMIT: usize = 5;
pub const HEALTH_NODE_LIMIT: usize = 10;
pub const HEALTH_CYCLE_LIMIT: usize = 5;
pub const HEALTH_RECOMMENDATION_LIMIT: usize = 20;
pub const HEALTH_ORDER_LIMIT: usize = 20;

/// The rows `operation` lists when a call names no `limit`; `None` for an operation that has no
/// `limit` to default. Every operation is named, so a new one cannot be left without an answer.
pub fn default_limit(operation: Operation) -> Option<usize> {
    match operation {
        Operation::Walk(walk) => match walk {
            WalkOperation::Neighbors => Some(NEIGHBORS_LIMIT),
            WalkOperation::ExplainRelation => Some(EXPLAIN_RELATION_LIMIT),
            WalkOperation::PatternWalk => Some(PATTERN_WALK_LIMIT),
            WalkOperation::Reachability => Some(REACHABILITY.limit),
            WalkOperation::Impact | WalkOperation::BlastRadius => Some(DEPENDENCY_IMPACT.limit),
            WalkOperation::Subgraph => Some(SUBGRAPH.limit),
            WalkOperation::Lineage => Some(LINEAGE_LIMIT),
            WalkOperation::ContainmentTree => Some(CONTAINMENT_TREE_LIMIT),
            WalkOperation::ProjectScope => Some(PROJECT_SCOPE_LIMIT),
            WalkOperation::ProjectMap => Some(PROJECT_MAP_LIMIT),
            WalkOperation::Cycles => Some(CYCLES_LIMIT),
            WalkOperation::Path | WalkOperation::RelationCheck => None,
        },
        Operation::Selection(selection) => match selection {
            SelectionOperation::Overview | SelectionOperation::Facets => Some(OVERVIEW_LIMIT),
            SelectionOperation::Schema => Some(SCHEMA_LIMIT),
            SelectionOperation::Components | SelectionOperation::Communities => {
                Some(CLUSTER_GROUP_LIMIT)
            }
            SelectionOperation::SimilarNodes => Some(SIMILAR_NODES_LIMIT),
            SelectionOperation::MatchNodes => Some(MATCH_NODES_LIMIT),
            SelectionOperation::RecommendRelations => Some(RECOMMEND_RELATIONS_LIMIT),
            SelectionOperation::NodeProfile => Some(NODE_PROFILE_LIMIT),
            SelectionOperation::DomainMatrix => Some(DOMAIN_MATRIX_LIMIT),
            SelectionOperation::GrowthPlan => Some(GROWTH_PLAN_LIMIT),
            SelectionOperation::MaintenancePlan => Some(MAINTENANCE_PLAN_LIMIT),
            SelectionOperation::WorkspaceBrief => Some(WORKSPACE_BRIEF_LIMIT),
            SelectionOperation::Health => None,
        },
        Operation::QueryPlan | Operation::AnalysisRecord => None,
        Operation::Pending(PendingOperation::AgentBrief) => None,
    }
}
