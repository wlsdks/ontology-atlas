//! The `depends_on` edges that run from one capability to another, and the capabilities no such
//! edge touches.

use std::collections::HashSet;

use vault_document::LoadedDocument;

use crate::dependency_both_ways::dependency_edges;
use crate::node_fields::kind_of;

pub(crate) struct CapabilityLinks<'a> {
    pub capabilities: usize,
    pub edges: usize,
    /// Capabilities on no capability-to-capability edge, sorted.
    pub alone: Vec<&'a str>,
}

pub(crate) fn capability_links(documents: &[LoadedDocument]) -> CapabilityLinks<'_> {
    let capabilities: HashSet<&str> = documents
        .iter()
        .filter(|document| kind_of(document) == "capability")
        .map(LoadedDocument::slug)
        .collect();
    let between: Vec<(&str, &str)> = dependency_edges(documents)
        .into_iter()
        .filter(|(from, to)| capabilities.contains(from) && capabilities.contains(to))
        .collect();
    let linked: HashSet<&str> = between.iter().flat_map(|(from, to)| [*from, *to]).collect();
    let mut alone: Vec<&str> = capabilities.difference(&linked).copied().collect();
    alone.sort_unstable();
    CapabilityLinks {
        capabilities: capabilities.len(),
        edges: between.len(),
        alone,
    }
}
