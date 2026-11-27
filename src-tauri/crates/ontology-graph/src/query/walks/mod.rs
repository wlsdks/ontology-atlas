//! The operations that follow edges from one node, between two, or through the whole graph:
//! `neighbors`, `path`, `all_paths`, `cycles` and `topological_order`. Every walk is iterative or
//! bounded by `maxHops` and a budget of expanded states.

mod dependency_order;
mod graph_walk;
mod neighbors;
mod paths;

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
}

impl WalkOperation {
    pub const fn name(self) -> &'static str {
        match self {
            Self::Neighbors => "neighbors",
            Self::Path => "path",
            Self::AllPaths => "all_paths",
            Self::Cycles => "cycles",
            Self::TopologicalOrder => "topological_order",
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
    })
}
