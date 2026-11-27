//! The operations that follow edges from one node, between two, or through the whole graph:
//! `neighbors`, `path`, `all_paths`, `cycles`, `topological_order`, the walks that count what a
//! node reaches (`reachability`, `pattern_walk`, `impact`, `blast_radius`, `subgraph`,
//! `builder_context`), the two that compare nodes (`explain_relation`, `relation_check`) and the
//! ones that read containment (`lineage`, `containment_tree`, `project_scope`, `project_map`).
//! Every walk is iterative, or recursive only as deep as the `depth` a call may ask for (at most
//! 20), and every list an answer writes is cut at `limit`.

mod blast_radius;
mod builder_context;
mod builder_focus;
mod containment_tree;
mod dependency_order;
mod dependency_qualification;
mod explain_relation;
mod graph_walk;
mod hop;
mod impact;
mod lineage;
mod neighborhood;
mod neighbors;
mod paths;
mod pattern_walk;
mod project_map;
mod project_scope;
mod reachability;
mod relation_check;
mod row_page;
mod subgraph;

use serde::Serialize;

use crate::compiled_graph::CompiledGraph;
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WalkOperation {
    Neighbors,
    Path,
    AllPaths,
    Cycles,
    TopologicalOrder,
    ExplainRelation,
    Reachability,
    PatternWalk,
    Impact,
    BlastRadius,
    Subgraph,
    BuilderContext,
    ProjectScope,
    ProjectMap,
    RelationCheck,
    Lineage,
    ContainmentTree,
}

impl WalkOperation {
    pub const fn name(self) -> &'static str {
        match self {
            Self::Neighbors => "neighbors",
            Self::Path => "path",
            Self::AllPaths => "all_paths",
            Self::Cycles => "cycles",
            Self::TopologicalOrder => "topological_order",
            Self::ExplainRelation => "explain_relation",
            Self::Reachability => "reachability",
            Self::PatternWalk => "pattern_walk",
            Self::Impact => "impact",
            Self::BlastRadius => "blast_radius",
            Self::Subgraph => "subgraph",
            Self::BuilderContext => "builder_context",
            Self::ProjectScope => "project_scope",
            Self::ProjectMap => "project_map",
            Self::RelationCheck => "relation_check",
            Self::Lineage => "lineage",
            Self::ContainmentTree => "containment_tree",
        }
    }
}

#[allow(
    clippy::large_enum_variant,
    reason = "an answer is built once, written out and dropped; boxing each would only add steps"
)]
#[derive(Serialize)]
#[serde(untagged)]
pub enum WalkAnswer<'a> {
    Neighbors(neighbors::NeighborsAnswer<'a>),
    Path(paths::PathAnswer<'a>),
    AllPaths(paths::AllPathsAnswer<'a>),
    Cycles(dependency_order::CyclesAnswer<'a>),
    TopologicalOrder(dependency_order::TopologicalOrderAnswer<'a>),
    ExplainRelation(explain_relation::ExplainRelationAnswer<'a>),
    Reachability(reachability::ReachabilityAnswer<'a>),
    PatternWalk(pattern_walk::PatternWalkAnswer<'a>),
    Impact(impact::ImpactAnswer<'a>),
    BlastRadius(blast_radius::BlastRadiusAnswer<'a>),
    Subgraph(subgraph::SubgraphAnswer<'a>),
    BuilderContext(builder_context::BuilderContextAnswer<'a>),
    ProjectScope(project_scope::ProjectScopeAnswer<'a>),
    ProjectMap(project_map::ProjectMapAnswer<'a>),
    RelationCheck(relation_check::RelationCheckAnswer<'a>),
    Lineage(lineage::LineageAnswer<'a>),
    ContainmentTree(containment_tree::ContainmentTreeAnswer<'a>),
}

pub fn run<'a>(
    graph: &'a CompiledGraph,
    operation: WalkOperation,
    request: &QueryRequest,
) -> Result<WalkAnswer<'a>, QueryError> {
    Ok(match operation {
        WalkOperation::Neighbors => WalkAnswer::Neighbors(neighbors::neighbors(graph, request)?),
        WalkOperation::Path => WalkAnswer::Path(paths::path(graph, request)?),
        WalkOperation::AllPaths => WalkAnswer::AllPaths(paths::all_paths(graph, request)?),
        WalkOperation::Cycles => WalkAnswer::Cycles(dependency_order::cycles(graph, request)?),
        WalkOperation::TopologicalOrder => {
            WalkAnswer::TopologicalOrder(dependency_order::topological_order(graph, request)?)
        }
        WalkOperation::ExplainRelation => {
            WalkAnswer::ExplainRelation(explain_relation::explain_relation(graph, request)?)
        }
        WalkOperation::Reachability => {
            WalkAnswer::Reachability(reachability::reachability(graph, request)?)
        }
        WalkOperation::PatternWalk => {
            WalkAnswer::PatternWalk(pattern_walk::pattern_walk(graph, request)?)
        }
        WalkOperation::Impact => WalkAnswer::Impact(impact::impact(graph, request)?),
        WalkOperation::BlastRadius => {
            WalkAnswer::BlastRadius(blast_radius::blast_radius(graph, request)?)
        }
        WalkOperation::Subgraph => WalkAnswer::Subgraph(subgraph::subgraph(graph, request)?),
        WalkOperation::BuilderContext => {
            WalkAnswer::BuilderContext(builder_context::builder_context(graph, request)?)
        }
        WalkOperation::ProjectScope => {
            WalkAnswer::ProjectScope(project_scope::project_scope(graph, request)?)
        }
        WalkOperation::ProjectMap => {
            WalkAnswer::ProjectMap(project_map::project_map(graph, request)?)
        }
        WalkOperation::RelationCheck => {
            WalkAnswer::RelationCheck(relation_check::relation_check(graph, request)?)
        }
        WalkOperation::Lineage => WalkAnswer::Lineage(lineage::lineage(graph, request)?),
        WalkOperation::ContainmentTree => {
            WalkAnswer::ContainmentTree(containment_tree::containment_tree(graph, request)?)
        }
    })
}
