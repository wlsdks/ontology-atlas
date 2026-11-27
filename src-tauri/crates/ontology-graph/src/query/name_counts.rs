//! A count table in the order agents read it: the most frequent key first, and equal counts in
//! the collation order of the key.

use std::collections::HashMap;

use answer_format::collation::compare_text;
use indexmap::IndexMap;

use crate::compiled_graph::{CompiledGraph, NodeId};

/// How often each key occurs: the most frequent first, equal counts in the order of the key's text.
pub fn sorted_counts<'a>(keys: impl IntoIterator<Item = &'a str>) -> IndexMap<String, usize> {
    let mut counts: Vec<(String, usize)> = Vec::new();
    let mut at: HashMap<&str, usize> = HashMap::new();
    for key in keys {
        match at.get(key) {
            Some(index) => {
                if let Some((_, count)) = counts.get_mut(*index) {
                    *count += 1;
                }
            }
            None => {
                at.insert(key, counts.len());
                counts.push((key.to_string(), 1));
            }
        }
    }
    counts.sort_by(|left, right| {
        right
            .1
            .cmp(&left.1)
            .then_with(|| compare_text(&left.0, &right.0))
    });
    counts.into_iter().collect()
}

/// The kinds of `nodes`, counted.
pub fn kind_counts(
    graph: &CompiledGraph,
    nodes: impl IntoIterator<Item = NodeId>,
) -> IndexMap<String, usize> {
    sorted_counts(nodes.into_iter().map(|id| graph.node(id).kind()))
}

/// The domains of `nodes` that have one, counted.
pub fn domain_counts(
    graph: &CompiledGraph,
    nodes: impl IntoIterator<Item = NodeId>,
) -> IndexMap<String, usize> {
    sorted_counts(
        nodes
            .into_iter()
            .filter_map(|id| graph.node(id).domain_name()),
    )
}
