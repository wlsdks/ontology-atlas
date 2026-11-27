//! The operations of `query_ontology` that read the compiled graph alone. Each operation is a
//! function from the graph and the call's arguments to a typed answer, written in the field order
//! agents have always read.

mod centrality;
mod clusters;
mod dependency_order;
mod graph_summary;
mod graph_walk;
mod neighbors;
mod node_resolution;
mod paths;
mod query_error;
mod relation_set;
mod request;
mod views;

use serde::Serialize;

use crate::compiled_graph::CompiledGraph;

pub use query_error::QueryError;
pub use relation_set::RELATION_TYPE_VALUES;
pub use request::{Direction, QueryRequest};

/// What one operation answered.
#[allow(
    clippy::large_enum_variant,
    reason = "an answer is built once, written out and dropped; boxing each would only add steps"
)]
#[derive(Serialize)]
#[serde(untagged)]
pub enum OperationAnswer<'a> {
    Overview(graph_summary::OverviewAnswer<'a>),
    Schema(graph_summary::SchemaAnswer<'a>),
    Facets(graph_summary::FacetsAnswer<'a>),
    Neighbors(neighbors::NeighborsAnswer<'a>),
    Path(paths::PathAnswer<'a>),
    AllPaths(paths::AllPathsAnswer<'a>),
    Cycles(dependency_order::CyclesAnswer<'a>),
    TopologicalOrder(dependency_order::TopologicalOrderAnswer<'a>),
    Components(clusters::ComponentsAnswer<'a>),
    Communities(clusters::CommunitiesAnswer<'a>),
    Centrality(centrality::CentralityAnswer<'a>),
}

/// The counts of the graph an answer was read from, which close every answer.
#[derive(Serialize)]
pub struct CompiledSummary<'a> {
    nodes: usize,
    edges: usize,
    #[serde(rename = "graphHash")]
    graph_hash: &'a str,
    #[serde(rename = "maxMtime")]
    max_mtime: f64,
    #[serde(rename = "resolvedEdges")]
    resolved_edges: usize,
    #[serde(rename = "externalEdges")]
    external_edges: usize,
    #[serde(rename = "unresolvedEdges")]
    unresolved_edges: usize,
    issues: usize,
}

#[derive(Serialize)]
pub struct QueryAnswer<'a> {
    #[serde(flatten)]
    operation: OperationAnswer<'a>,
    #[serde(rename = "compiledSummary")]
    compiled_summary: CompiledSummary<'a>,
}

/// The operations this crate answers, in the order the schema lists them.
pub const ANSWERED_OPERATIONS: [&str; 11] = [
    "neighbors",
    "path",
    "all_paths",
    "centrality",
    "communities",
    "overview",
    "schema",
    "facets",
    "components",
    "cycles",
    "topological_order",
];

/// Answers `operation` from `graph`. An operation this crate does not answer yet is a failure that
/// says so.
pub fn run<'a>(
    graph: &'a CompiledGraph,
    operation: &str,
    request: &QueryRequest,
) -> Result<QueryAnswer<'a>, QueryError> {
    let answer = match operation {
        "overview" => OperationAnswer::Overview(graph_summary::overview(graph, request)?),
        "schema" => OperationAnswer::Schema(graph_summary::schema(graph, request)?),
        "facets" => OperationAnswer::Facets(graph_summary::facets(graph, request)?),
        "neighbors" => OperationAnswer::Neighbors(neighbors::neighbors(graph, request)?),
        "path" => OperationAnswer::Path(paths::path(graph, request)?),
        "all_paths" => OperationAnswer::AllPaths(paths::all_paths(graph, request)?),
        "cycles" => OperationAnswer::Cycles(dependency_order::cycles(graph, request)?),
        "topological_order" => {
            OperationAnswer::TopologicalOrder(dependency_order::topological_order(graph, request)?)
        }
        "components" => OperationAnswer::Components(clusters::components(graph, request)?),
        "communities" => OperationAnswer::Communities(clusters::communities(graph, request)?),
        "centrality" => OperationAnswer::Centrality(centrality::centrality(graph, request)?),
        other => {
            return Err(QueryError::Failed(format!(
                "The query_ontology operation \"{other}\" is not answered by this server yet."
            )))
        }
    };
    let counts = graph.edge_counts();
    Ok(QueryAnswer {
        operation: answer,
        compiled_summary: CompiledSummary {
            nodes: graph.nodes().len(),
            edges: graph.edges().len(),
            graph_hash: graph.graph_hash(),
            max_mtime: graph.max_mtime(),
            resolved_edges: counts.resolved,
            external_edges: counts.external,
            unresolved_edges: counts.unresolved,
            issues: graph.issues().len(),
        },
    })
}
