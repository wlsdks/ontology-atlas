//! What an import reconciliation needs of the vault, taken from the compiled graph: its
//! `depends_on` edges, the name each alias reaches, the nodes, and where each node says its
//! implementation lives. This is the one place the reconciliation meets the graph.

use std::collections::{HashMap, HashSet};

use ontology_graph::CompiledGraph;
use source_scan::{VaultEdge, VaultFacts};

/// The frontmatter keys the compiler files a `depends_on:` reference under.
const DEPENDS_ON_KEYS: [&str; 2] = ["dependencies", "depends_on"];

pub fn vault_facts_of(graph: &CompiledGraph) -> VaultFacts {
    let edges = graph
        .edge_ids()
        .filter(|id| DEPENDS_ON_KEYS.contains(&graph.edge(*id).via))
        .map(|id| {
            let view = graph.edge_view(id);
            VaultEdge {
                from: view.from_slug().to_string(),
                to: view.to_name().to_string(),
                reference: graph.edge(id).reference.clone(),
                via: graph.edge(id).via.to_string(),
            }
        })
        .collect();
    let aliases: HashMap<String, String> = graph
        .aliases()
        .iter()
        .map(|alias| (alias.alias.to_string(), alias.slug.to_string()))
        .collect();
    let node_slugs: HashSet<String> = graph
        .nodes()
        .iter()
        .map(|node| node.slug())
        .filter(|slug| !slug.is_empty())
        .map(str::to_string)
        .collect();
    let paths: HashMap<String, String> = graph
        .nodes()
        .iter()
        .filter(|node| !node.slug().is_empty())
        .filter_map(|node| {
            node.path()
                .map(|path| (node.slug().to_string(), path.to_string()))
        })
        .collect();
    VaultFacts {
        edges,
        aliases,
        node_slugs,
        paths,
    }
}
