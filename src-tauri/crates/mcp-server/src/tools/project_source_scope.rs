//! The documents a project holds and the hash that dates a source receipt against them. The scope is
//! whole or it is nothing: a hash of part of a project would not see a change in the rest, so a
//! scope past the limit, or a vault that does not compile, yields no hash and every caller refuses.

use std::collections::HashSet;

use ontology_graph::{project_scope_slugs, CompiledGraph};
use project_source::project_graph_hash;
use vault_document::LoadedDocument;

/// Nodes a project may hold for its receipt to cover it.
const PROJECT_SCOPE_LIMIT: usize = 500;

/// The slugs the project holds, or `None` when it holds more than a receipt covers.
pub fn scope_slugs(graph: &CompiledGraph, project_slug: &str) -> Option<Vec<String>> {
    project_scope_slugs(graph, project_slug, PROJECT_SCOPE_LIMIT)
}

pub struct ProjectScope<'a> {
    /// The project's documents in the order the vault lists them.
    pub documents: Vec<&'a LoadedDocument>,
    /// `None` when the scope is not whole.
    pub graph_hash: Option<String>,
}

/// The scope of `project_slug` in `graph`; `None` is a vault that did not compile.
pub fn project_scope<'a>(
    graph: Option<&CompiledGraph>,
    documents: &'a [LoadedDocument],
    project_slug: &str,
) -> ProjectScope<'a> {
    let slugs = graph.and_then(|graph| scope_slugs(graph, project_slug));
    let Some(slugs) = slugs else {
        return ProjectScope {
            documents: Vec::new(),
            graph_hash: None,
        };
    };
    let held: HashSet<&str> = slugs.iter().map(String::as_str).collect();
    let scoped: Vec<&LoadedDocument> = documents
        .iter()
        .filter(|document| held.contains(document.slug()))
        .collect();
    let graph_hash = Some(project_graph_hash(project_slug, &scoped));
    ProjectScope {
        documents: scoped,
        graph_hash,
    }
}
