//! A node as the answers show it: the five fields that name it, and as a one-line summary with the
//! degrees the compiler counted.

use std::borrow::Cow;

use serde::Serialize;
use vault_document::frontmatter::Value;

use crate::compiled_graph::{CompiledGraph, NodeId};

/// What names a node. Rows that add their own counts flatten this in, so the five fields are
/// written in one place.
#[derive(Serialize)]
pub struct NodeIdentity<'a> {
    uid: &'a str,
    slug: &'a str,
    kind: &'a str,
    title: Cow<'a, Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    domain: Option<&'a Value>,
}

impl<'a> NodeIdentity<'a> {
    pub fn of(graph: &'a CompiledGraph, id: NodeId) -> Self {
        let node = graph.node(id);
        Self {
            uid: node.uid(),
            slug: node.slug(),
            kind: node.kind(),
            title: node.title(),
            domain: node.domain(),
        }
    }
}

/// A node with the number of edges that leave it and reach it in the compiled graph.
#[derive(Serialize)]
pub struct NodeSummary<'a> {
    #[serde(flatten)]
    identity: NodeIdentity<'a>,
    #[serde(rename = "inDegree")]
    in_degree: u32,
    #[serde(rename = "outDegree")]
    out_degree: u32,
}

impl<'a> NodeSummary<'a> {
    pub fn of(graph: &'a CompiledGraph, id: NodeId) -> Self {
        let node = graph.node(id);
        Self {
            identity: NodeIdentity::of(graph, id),
            in_degree: node.in_degree,
            out_degree: node.out_degree,
        }
    }

    pub fn slug(&self) -> &str {
        self.identity.slug
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
