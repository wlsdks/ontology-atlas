//! Whether the ontology's structure is ready, as the agent brief states it: enough domains,
//! capabilities and elements, linked, with a healthy graph and a vault that validates cleanly. The
//! assessment keeps only `ready` and what is not.

use ontology_graph::{run_query, CompiledGraph, Operation, QueryRequest, SelectionOperation};

/// The nodes a map needs before it is a map at all.
const NODES_TO_BE_SHAPED: usize = 3;

/// What the vault's validation found, which keeps a ready structure from being called ready.
#[derive(Debug, Clone, Copy)]
pub struct ValidationCounts {
    pub error_files: usize,
    pub warning_files: usize,
    pub path_drifts: usize,
}

fn graph_is_healthy(graph: &CompiledGraph) -> bool {
    let request = QueryRequest::new(Operation::Selection(SelectionOperation::Health));
    run_query(graph, &request)
        .ok()
        .and_then(|answer| answer_format::json::to_string(&answer).ok())
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .is_some_and(|answer| {
            answer.get("status").and_then(serde_json::Value::as_str) == Some("healthy")
        })
}

/// `needs_shape`, `needs_attention` or `ready`.
pub fn structure_readiness(graph: &CompiledGraph, validation: ValidationCounts) -> &'static str {
    let meaningful = graph
        .nodes()
        .iter()
        .filter(|node| matches!(node.kind(), "domain" | "capability" | "element"))
        .count();
    if meaningful < NODES_TO_BE_SHAPED {
        return "needs_shape";
    }
    let linked = graph.edges().len() >= meaningful.saturating_sub(1).max(1);
    let validates = validation.error_files + validation.warning_files + validation.path_drifts == 0;
    if linked && validates && graph_is_healthy(graph) {
        "ready"
    } else {
        "needs_attention"
    }
}
