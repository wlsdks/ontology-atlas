//! `query_ontology`: one question put to the compiled graph. A call is a `QueryRequest` the tool
//! layer has read once; `run` hands it to the module of its operation, which answers with a typed
//! value written in the field order agents have always read.
//!
//! The modules `walks` and `selection` each own a family of operations and an answer type; what
//! they share lives here: the request, the error, the names of relations and nodes, and the rows
//! every answer repeats.

mod containment_steps;
mod domain_lookup;
mod edge_rows;
mod name_counts;
mod node_mask;
mod node_resolution;
mod node_summary;
mod operation;
mod operation_defaults;
mod plan;
mod project_root;
mod project_scope_slugs;
mod query_error;
mod relation_set;
mod request;
mod scope;
mod score_rounding;
mod selection;
mod step;
mod walks;

use serde::Serialize;

use crate::compiled_graph::CompiledGraph;

pub use operation::Operation;
pub use project_scope_slugs::project_scope_slugs;
pub use query_error::QueryError;
pub use relation_set::RELATION_TYPE_VALUES;
pub use request::{Direction, QueryRequest, SEARCH_BUDGET_MAX};
pub use selection::{
    is_match_nodes, match_nodes, parse_ignore_patterns, project_holdings, LineSpan, NodeSort,
    OutsideFacts, ProjectHoldings, ProjectMeaningFacts, SelectionArguments, SelectionOperation,
    SelectionRequest, SourceNow, StaleSummary, UncertaintyRead, VaultValidationFacts,
    WitnessesNow,
};
pub use walks::WalkOperation;

/// What one operation answered.
#[derive(Serialize)]
#[serde(untagged)]
pub enum OperationAnswer<'a> {
    Walk(Box<walks::WalkAnswer<'a>>),
    Selection(Box<selection::SelectionAnswer<'a>>),
    Plan(Box<plan::PlanAnswer<'a>>),
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

/// Answers the call from `graph`. The operation that reads an analysis record is refused by name:
/// the tool layer answers it from the vault's files.
pub fn run<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<QueryAnswer<'a>, QueryError> {
    let answer = match request.operation {
        Operation::Walk(operation) => {
            OperationAnswer::Walk(Box::new(walks::run(graph, operation, request)?))
        }
        Operation::Selection(operation) => {
            OperationAnswer::Selection(Box::new(selection::run(graph, operation, request)?))
        }
        Operation::QueryPlan => OperationAnswer::Plan(Box::new(plan::query_plan(graph, request)?)),
        Operation::AnalysisRecord => {
            return Err(QueryError::NotAGraphOperation(
                Operation::AnalysisRecord.name(),
            ));
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
