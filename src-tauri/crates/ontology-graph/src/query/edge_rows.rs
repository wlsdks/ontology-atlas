//! An edge as each answer shows it: the way it was walked, the way it stands on a path, or with the
//! public name of its relation.

use serde::Serialize;

use crate::compiled_graph::{CompiledGraph, EdgeId, NodeId};

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
            from: graph.node(edge.from).slug(),
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
            from: graph.node(edge.from).slug(),
            to: name_reached(graph, id),
            via: edge.via,
            rationale: edge.rationale.as_deref(),
            traversed_from: graph.node(entered).slug(),
            traversed_to: graph.node(left).slug(),
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
            from: graph.node(edge.from).slug(),
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
        Some(node) => graph.node(node).slug(),
        None => &edge.reference,
    }
}
