//! Which project a call means: the one it names, or the only one the graph has.

use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::node_resolution::resolve;
use crate::query::query_error::QueryError;

/// The project `name` means. With no name the graph's only project is meant, and a graph with none
/// or several asks for one, saying which exist.
pub fn resolve_project(graph: &CompiledGraph, name: Option<&str>) -> Result<NodeId, QueryError> {
    if name.is_some_and(|text| !answer_format::whitespace::trim(text).is_empty()) {
        let project = resolve(graph, name, "project")?;
        let node = graph.node(project);
        if node.kind() != "project" {
            return Err(QueryError::Failed(format!(
                "project \"{}\" must resolve to a kind: project node.",
                node.slug()
            )));
        }
        return Ok(project);
    }
    let roots: Vec<NodeId> = graph
        .node_ids()
        .filter(|id| graph.node(*id).kind() == "project")
        .collect();
    match roots.as_slice() {
        [only] => Ok(*only),
        [] => Err(QueryError::Failed("project_scope requires a project slug because the compiled graph has no kind: project root."
                .to_string())),
        many => {
            let mut slugs: Vec<&str> = many.iter().map(|id| graph.node(*id).slug()).collect();
            slugs.sort_unstable_by(|left, right| {
                left.encode_utf16().cmp(right.encode_utf16())
            });
            Err(QueryError::Failed(format!(
                "project_scope requires a project slug because multiple project roots exist: {}",
                slugs.join(", ")
            )))
        }
    }
}
