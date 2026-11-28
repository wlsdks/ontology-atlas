//! The slugs of every node a project holds, for a reader that needs the whole scope or nothing: a
//! scope past `limit` nodes is not whole, and a hash or receipt made of part of it would hide a
//! change in the rest.

use crate::compiled_graph::CompiledGraph;
use crate::query::scope::Scope;

/// The slugs the project `project_slug` holds, itself included, in graph order; `None` when no node
/// has that slug or the scope holds more than `limit` nodes.
pub fn project_scope_slugs(
    graph: &CompiledGraph,
    project_slug: &str,
    limit: usize,
) -> Option<Vec<String>> {
    let root = graph.node_by_slug(project_slug)?;
    let scope = Scope::of(graph, root);
    (scope.nodes.len() <= limit).then(|| {
        scope
            .nodes
            .iter()
            .map(|&node| graph.node(node).slug().to_string())
            .collect()
    })
}
