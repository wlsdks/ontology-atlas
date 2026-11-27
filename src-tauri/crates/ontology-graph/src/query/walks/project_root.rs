//! Which project a `project_scope` or `project_map` call means: the one it names, or the only one
//! the graph has.

use answer_format::whitespace::trim;

use super::containment::project_roots;
use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::node_resolution::resolve;
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;

/// The project node the call means. `operation` names the call in the refusals.
pub fn project_root(
    graph: &CompiledGraph,
    request: &QueryRequest,
    operation: &str,
) -> Result<NodeId, QueryError> {
    let named = request
        .slug
        .as_deref()
        .or(request.project.as_deref())
        .filter(|name| !trim(name).is_empty());
    if let Some(name) = named {
        let node = resolve(graph, Some(name), "project")?;
        if graph.node(node).kind() != "project" {
            return Err(QueryError::Invalid(format!(
                "project \"{}\" must resolve to a kind: project node.",
                graph.node(node).slug()
            )));
        }
        return Ok(node);
    }
    let roots = project_roots(graph);
    match roots.as_slice() {
        [only] => Ok(*only),
        [] => Err(QueryError::Invalid(format!(
            "{operation} requires a project slug because the compiled graph has no kind: project root."
        ))),
        many => Err(QueryError::Invalid(format!(
            "{operation} requires a project slug because multiple project roots exist: {}",
            many.iter()
                .map(|&root| graph.node(root).slug())
                .collect::<Vec<_>>()
                .join(", ")
        ))),
    }
}
