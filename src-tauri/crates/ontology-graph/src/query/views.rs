//! The small shapes the operations repeat: a node as a one-line summary, an edge as each operation
//! shows it, and a count table in the order agents read it.

use std::collections::HashMap;

use answer_format::collation::compare_text;
use serde::Serialize;
use vault_document::frontmatter::Value;

use crate::compiled_graph::{CompiledGraph, EdgeId, NodeId};
use crate::object_map::ObjectMap;

#[derive(Serialize)]
pub struct NodeSummary<'a> {
    uid: &'a str,
    slug: &'a str,
    kind: &'a str,
    title: &'a Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    domain: Option<&'a Value>,
    #[serde(rename = "inDegree")]
    in_degree: u32,
    #[serde(rename = "outDegree")]
    out_degree: u32,
}

impl<'a> NodeSummary<'a> {
    pub fn of(graph: &'a CompiledGraph, id: NodeId) -> Self {
        let node = graph.node(id);
        Self {
            uid: &node.uid,
            slug: &node.slug,
            kind: &node.kind,
            title: &node.title,
            domain: node.domain.as_ref(),
            in_degree: node.in_degree,
            out_degree: node.out_degree,
        }
    }
}

pub fn summaries(
    graph: &CompiledGraph,
    ids: impl IntoIterator<Item = NodeId>,
) -> Vec<NodeSummary<'_>> {
    ids.into_iter()
        .map(|id| NodeSummary::of(graph, id))
        .collect()
}

/// An edge with the way it was walked, as `neighbors` lists it.
#[derive(Serialize)]
pub struct DirectedEdge<'a> {
    direction: &'static str,
    id: String,
    from: &'a str,
    to: &'a str,
    via: &'static str,
    #[serde(rename = "ref")]
    reference: &'a str,
    resolved: bool,
    external: bool,
}

impl<'a> DirectedEdge<'a> {
    pub fn of(graph: &'a CompiledGraph, id: EdgeId, direction: &'static str) -> Self {
        let view = graph.edge_view(id);
        let edge = graph.edge(id);
        Self {
            direction,
            id: view.id(),
            from: graph.node(edge.from).slug.as_str(),
            to: name_reached(graph, id),
            via: edge.via,
            reference: &edge.reference,
            resolved: edge.is_resolved(),
            external: edge.is_external(),
        }
    }
}

/// An edge on a path: which end it was entered from and which it left by.
#[derive(Serialize)]
pub struct PathEdge<'a> {
    id: String,
    from: &'a str,
    to: &'a str,
    via: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    rationale: Option<&'a str>,
    #[serde(rename = "traversedFrom")]
    traversed_from: &'a str,
    #[serde(rename = "traversedTo")]
    traversed_to: &'a str,
}

impl<'a> PathEdge<'a> {
    pub fn of(graph: &'a CompiledGraph, id: EdgeId, entered: NodeId, left: NodeId) -> Self {
        let edge = graph.edge(id);
        Self {
            id: graph.edge_view(id).id(),
            from: graph.node(edge.from).slug.as_str(),
            to: name_reached(graph, id),
            via: edge.via,
            rationale: edge.rationale.as_deref(),
            traversed_from: graph.node(entered).slug.as_str(),
            traversed_to: graph.node(left).slug.as_str(),
        }
    }
}

/// An edge with the public name of its relation, as the cycle and community answers show it.
#[derive(Serialize)]
pub struct CompiledEdge<'a> {
    id: String,
    from: &'a str,
    to: &'a str,
    via: &'static str,
    #[serde(rename = "relationType")]
    relation_type: &'static str,
    #[serde(rename = "ref")]
    reference: &'a str,
    resolved: bool,
    external: bool,
}

impl<'a> CompiledEdge<'a> {
    pub fn of(graph: &'a CompiledGraph, id: EdgeId) -> Self {
        let edge = graph.edge(id);
        Self {
            id: graph.edge_view(id).id(),
            from: graph.node(edge.from).slug.as_str(),
            to: name_reached(graph, id),
            via: edge.via,
            relation_type: crate::query::relation_set::public_relation_type(edge.via),
            reference: &edge.reference,
            resolved: edge.is_resolved(),
            external: edge.is_external(),
        }
    }
}

/// The slug an edge reaches, or the reference as written when no node has it.
pub fn name_reached(graph: &CompiledGraph, id: EdgeId) -> &str {
    let edge = graph.edge(id);
    match edge.to() {
        Some(node) => graph.node(node).slug.as_str(),
        None => &edge.reference,
    }
}

/// How often each key occurs: the most frequent first, equal counts in the order of the key's text.
pub fn sorted_counts<'a>(keys: impl IntoIterator<Item = &'a str>) -> ObjectMap<usize> {
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
    ObjectMap(counts)
}

/// The kinds of `nodes`, counted.
pub fn kind_counts(
    graph: &CompiledGraph,
    nodes: impl IntoIterator<Item = NodeId>,
) -> ObjectMap<usize> {
    sorted_counts(nodes.into_iter().map(|id| graph.node(id).kind.as_str()))
}

/// The domains of `nodes` that have one, counted.
pub fn domain_counts(
    graph: &CompiledGraph,
    nodes: impl IntoIterator<Item = NodeId>,
) -> ObjectMap<usize> {
    sorted_counts(
        nodes
            .into_iter()
            .filter_map(|id| graph.node(id).domain_name()),
    )
}
