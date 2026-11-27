//! `node_profile`: everything around one node in one answer: its edges both ways, what sits over
//! and under it, and the ancestors and descendants out to a depth. It spares an agent the five
//! calls that would otherwise build the same picture.

use indexmap::IndexMap;
use serde::Serialize;

use super::containment::{Containment, Lineage, LineageDirection, LineageStep};
use super::relation_filter::edge_passes;
use crate::compiled_graph::{CompiledGraph, EdgeId, NodeId};
use crate::query::edge_rows::CompiledEdge;
use crate::query::name_counts::sorted_counts;
use crate::query::node_resolution::resolve;
use crate::query::node_summary::NodeSummary;
use crate::query::query_error::QueryError;
use crate::query::relation_set::{public_relation_type, RelationSet};
use crate::query::request::QueryRequest;

const DEFAULT_LIMIT: usize = 20;
const DEFAULT_DEPTH: usize = 3;

#[derive(Serialize)]
struct Degree {
    #[serde(rename = "in")]
    incoming: u32,
    out: u32,
    total: u32,
}

#[derive(Serialize)]
struct ProfileEdge<'a> {
    #[serde(flatten)]
    edge: CompiledEdge<'a>,
    #[serde(rename = "otherNode")]
    other_node: Option<NodeSummary<'a>>,
    #[serde(rename = "otherKind")]
    other_kind: &'a str,
}

#[derive(Serialize)]
struct ProfileEdgeGroup<'a> {
    total: usize,
    #[serde(rename = "byRelation")]
    by_relation: IndexMap<String, usize>,
    #[serde(rename = "byRelationType")]
    by_relation_type: IndexMap<String, usize>,
    limited: bool,
    edges: Vec<ProfileEdge<'a>>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Side {
    Incoming,
    Outgoing,
}

impl<'a> ProfileEdgeGroup<'a> {
    fn of(graph: &'a CompiledGraph, ids: &[EdgeId], side: Side, limit: usize) -> Self {
        let edges = ids
            .iter()
            .take(limit)
            .map(|id| {
                let edge = graph.edge(*id);
                let other = match side {
                    Side::Incoming => Some(edge.from),
                    Side::Outgoing => edge.to(),
                };
                ProfileEdge {
                    edge: CompiledEdge::of(graph, *id),
                    other_node: other.map(|node| NodeSummary::of(graph, node)),
                    other_kind: match other {
                        Some(node) => match graph.node(node).kind() {
                            "" => "unknown",
                            kind => kind,
                        },
                        None if edge.is_external() => "external",
                        None => "unresolved",
                    },
                }
            })
            .collect();
        Self {
            total: ids.len(),
            by_relation: sorted_counts(ids.iter().map(|id| graph.edge(*id).via)),
            by_relation_type: sorted_counts(
                ids.iter()
                    .map(|id| public_relation_type(graph.edge(*id).via)),
            ),
            limited: ids.len() > limit,
            edges,
        }
    }
}

#[derive(Serialize)]
struct ProfileEdges<'a> {
    incoming: ProfileEdgeGroup<'a>,
    outgoing: ProfileEdgeGroup<'a>,
}

/// A node on the other end of a containment link, with the relation that links it.
#[derive(Serialize)]
pub struct ContainmentRow<'a> {
    slug: &'a str,
    via: &'static str,
    node: NodeSummary<'a>,
}

impl<'a> ContainmentRow<'a> {
    pub fn of(graph: &'a CompiledGraph, next: NodeId, edge: EdgeId) -> Self {
        Self {
            slug: graph.node(next).slug(),
            via: graph.edge(edge).via,
            node: NodeSummary::of(graph, next),
        }
    }
}

#[derive(Serialize)]
struct ProfileContainment<'a> {
    parents: Vec<ContainmentRow<'a>>,
    #[serde(rename = "parentLimited")]
    parent_limited: bool,
    children: Vec<ContainmentRow<'a>>,
    #[serde(rename = "childLimited")]
    child_limited: bool,
}

#[derive(Serialize)]
struct LineageRow<'a> {
    slug: &'a str,
    distance: usize,
    via: &'static str,
    node: NodeSummary<'a>,
}

#[derive(Serialize)]
struct LineageGroup<'a> {
    total: usize,
    limited: bool,
    nodes: Vec<LineageRow<'a>>,
}

impl<'a> LineageGroup<'a> {
    fn of(graph: &'a CompiledGraph, lineage: Lineage) -> Self {
        Self {
            total: lineage.steps.len(),
            limited: lineage.limited,
            nodes: lineage
                .steps
                .iter()
                .map(|LineageStep { node, distance, via }| LineageRow {
                    slug: graph.node(*node).slug(),
                    distance: *distance,
                    via,
                    node: NodeSummary::of(graph, *node),
                })
                .collect(),
        }
    }
}

#[derive(Serialize)]
struct ProfileLineage<'a> {
    depth: usize,
    ancestors: LineageGroup<'a>,
    descendants: LineageGroup<'a>,
}

#[derive(Serialize)]
pub struct NodeProfileAnswer<'a> {
    operation: &'static str,
    center: &'a str,
    node: NodeSummary<'a>,
    aliases: Vec<&'a str>,
    degree: Degree,
    edges: ProfileEdges<'a>,
    containment: ProfileContainment<'a>,
    lineage: ProfileLineage<'a>,
}

/// The edges of `ids` the call's filters let through, in edge order.
fn filtered(
    graph: &CompiledGraph,
    ids: &[EdgeId],
    types: Option<&RelationSet>,
    include_external: bool,
    include_unresolved: bool,
) -> Vec<EdgeId> {
    ids.iter()
        .copied()
        .filter(|id| edge_passes(types, include_external, include_unresolved, graph.edge(*id)))
        .collect()
}

fn rows<'a>(
    graph: &'a CompiledGraph,
    links: &[super::containment::Link],
    limit: usize,
) -> (Vec<ContainmentRow<'a>>, bool) {
    (
        links
            .iter()
            .take(limit)
            .map(|link| ContainmentRow::of(graph, link.next, link.edge))
            .collect(),
        links.len() > limit,
    )
}

pub fn node_profile<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<NodeProfileAnswer<'a>, QueryError> {
    let center = resolve(graph, request.slug.as_deref(), "slug")?;
    let limit = request.limit.unwrap_or(DEFAULT_LIMIT);
    let depth = request.depth.unwrap_or(DEFAULT_DEPTH);
    let include_external = request.include_external.unwrap_or(true);
    let include_unresolved = request.include_unresolved.unwrap_or(true);
    let types = RelationSet::parse(request.types.as_deref(), "types")?;
    let node = graph.node(center);
    let containment = Containment::of(graph);
    let outgoing = filtered(
        graph,
        graph.outgoing(center),
        types.as_ref(),
        include_external,
        include_unresolved,
    );
    let incoming = filtered(
        graph,
        graph.incoming(center),
        types.as_ref(),
        include_external,
        include_unresolved,
    );
    let (parents, parent_limited) = rows(graph, &containment.parents(center), limit);
    let (children, child_limited) = rows(graph, &containment.children(center), limit);
    Ok(NodeProfileAnswer {
        operation: "node_profile",
        center: node.slug(),
        node: NodeSummary::of(graph, center),
        aliases: graph
            .aliases()
            .iter()
            .filter(|entry| entry.slug == node.slug())
            .map(|entry| entry.alias)
            .collect(),
        degree: Degree {
            incoming: node.in_degree,
            out: node.out_degree,
            total: node.degree(),
        },
        edges: ProfileEdges {
            incoming: ProfileEdgeGroup::of(graph, &incoming, Side::Incoming, limit),
            outgoing: ProfileEdgeGroup::of(graph, &outgoing, Side::Outgoing, limit),
        },
        containment: ProfileContainment {
            parents,
            parent_limited,
            children,
            child_limited,
        },
        lineage: ProfileLineage {
            depth,
            ancestors: LineageGroup::of(
                graph,
                containment.lineage(center, LineageDirection::Ancestors, depth, limit),
            ),
            descendants: LineageGroup::of(
                graph,
                containment.lineage(center, LineageDirection::Descendants, depth, limit),
            ),
        },
    })
}
