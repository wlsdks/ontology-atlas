//! The documents a project holds and the hash that dates a source receipt against them. The scope is
//! whole or it is nothing: a hash of part of a project would not see a change in the rest, so a
//! scope past the limit, or a vault that does not compile, yields no hash and every caller refuses.

use std::collections::HashSet;

use ontology_graph::project_scope_slugs;
use project_source::project_graph_hash;
use vault_document::LoadedDocument;

use crate::dispatch::CallContext;

/// Nodes a project may hold for its receipt to cover it.
const PROJECT_SCOPE_LIMIT: usize = 500;

pub struct ProjectScope<'a> {
    /// The project's documents in the order the vault lists them.
    pub documents: Vec<&'a LoadedDocument>,
    /// `None` when the scope is not whole.
    pub graph_hash: Option<String>,
}

pub fn project_scope<'a>(
    context: &CallContext<'_>,
    documents: &'a [LoadedDocument],
    project_slug: &str,
) -> ProjectScope<'a> {
    let slugs = context
        .compiled_graph()
        .read(context)
        .ok()
        .and_then(|graph| project_scope_slugs(&graph, project_slug, PROJECT_SCOPE_LIMIT));
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
