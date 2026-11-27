//! What a dependency edge says for itself: declared with a reason, or declared and still to be
//! reviewed. Atlas holds no source evidence for an edge here, so no edge is source backed.

use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};

use super::hop::Hop;
use crate::compiled_graph::CompiledGraph;
use crate::query::edge_rows::name_reached;

const DECLARED: &str = "declared_with_rationale";
const REVIEW_REQUIRED: &str = "review_required";

fn label(rationale: Option<&str>) -> &'static str {
    if rationale.is_some() {
        DECLARED
    } else {
        REVIEW_REQUIRED
    }
}

/// How well the dependency edges of an answer are backed.
#[derive(Serialize)]
pub struct Qualification {
    status: &'static str,
    basis: &'static str,
    completeness: &'static str,
    #[serde(rename = "sourceBacked")]
    source_backed: bool,
    #[serde(rename = "declaredEdges")]
    declared_edges: usize,
    #[serde(rename = "declaredWithRationaleEdges")]
    declared_with_rationale_edges: usize,
    #[serde(rename = "reviewRequiredEdges")]
    review_required_edges: usize,
    #[serde(rename = "sourceBackedEdges")]
    source_backed_edges: usize,
}

impl Qualification {
    pub fn of(graph: &CompiledGraph, hops: &[Hop]) -> Self {
        let with_reason = hops
            .iter()
            .filter(|hop| graph.edge(hop.edge).rationale.is_some())
            .count();
        let review = hops.len() - with_reason;
        Self {
            status: if hops.is_empty() {
                "unknown"
            } else if review > 0 {
                REVIEW_REQUIRED
            } else {
                DECLARED
            },
            basis: "declared_dependencies",
            completeness: "unknown",
            source_backed: false,
            declared_edges: hops.len(),
            declared_with_rationale_edges: with_reason,
            review_required_edges: review,
            source_backed_edges: 0,
        }
    }
}

/// The domains at the two ends of an edge, and whether they differ.
pub struct EdgeDomains<'a> {
    pub from: Option<&'a str>,
    pub to: Option<&'a str>,
}

impl EdgeDomains<'_> {
    pub fn crosses(&self) -> bool {
        matches!((self.from, self.to), (Some(from), Some(to)) if from != to)
    }
}

/// A dependency edge as impact and blast radius write it: the path row, then the domains it
/// joins when they were asked for, then `rationale` (null when none was declared) and what that
/// makes of the edge.
pub struct DependencyEdge<'a> {
    graph: &'a CompiledGraph,
    hop: Hop,
    domains: Option<EdgeDomains<'a>>,
}

impl<'a> DependencyEdge<'a> {
    pub fn new(graph: &'a CompiledGraph, hop: Hop, domains: Option<EdgeDomains<'a>>) -> Self {
        Self {
            graph,
            hop,
            domains,
        }
    }
}

impl Serialize for DependencyEdge<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let graph = self.graph;
        let edge = graph.edge(self.hop.edge);
        let rationale = edge.rationale.as_deref();
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("id", &graph.edge_view(self.hop.edge).id())?;
        map.serialize_entry("from", graph.node(edge.from).slug())?;
        map.serialize_entry("to", name_reached(graph, self.hop.edge))?;
        map.serialize_entry("via", edge.via)?;
        if let Some(rationale) = rationale {
            map.serialize_entry("rationale", rationale)?;
        }
        map.serialize_entry("traversedFrom", graph.node(self.hop.entered).slug())?;
        map.serialize_entry("traversedTo", graph.node(self.hop.left).slug())?;
        if let Some(domains) = &self.domains {
            map.serialize_entry("fromDomain", &domains.from)?;
            map.serialize_entry("toDomain", &domains.to)?;
            map.serialize_entry("crossDomain", &domains.crosses())?;
        }
        if rationale.is_none() {
            map.serialize_entry("rationale", &None::<&str>)?;
        }
        map.serialize_entry("qualification", label(rationale))?;
        map.end()
    }
}
