//! `blast_radius`: what a change to a node reaches along declared dependencies, grouped by kind and
//! by domain, with the edges that cross from one domain to another.

use indexmap::IndexMap;
use serde::Serialize;

use super::dependency_qualification::{DependencyEdge, EdgeDomains, Qualification};
use super::hop::Hop;
use super::impact::DependencyWalk;
use super::neighborhood::hops_between;
use super::row_page::RowPage;
use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::domain_lookup::DomainLookup;
use crate::query::name_counts::{kind_counts, sorted_counts};
use crate::query::node_summary::NodeSummary;
use crate::query::query_error::QueryError;
use crate::query::request::{Direction, QueryRequest};

#[derive(Serialize)]
struct BlastSummary {
    #[serde(rename = "affectedNodes")]
    affected_nodes: usize,
    #[serde(rename = "affectedEdges")]
    affected_edges: usize,
    #[serde(rename = "affectedKinds")]
    affected_kinds: usize,
    #[serde(rename = "affectedDomains")]
    affected_domains: usize,
    #[serde(rename = "crossDomainEdges")]
    cross_domain_edges: usize,
}

#[derive(Serialize)]
struct AffectedNode<'a> {
    slug: &'a str,
    distance: usize,
    domain: Option<&'a str>,
    node: NodeSummary<'a>,
}

#[derive(Serialize)]
pub struct BlastRadiusAnswer<'a> {
    operation: &'static str,
    center: &'a str,
    node: NodeSummary<'a>,
    direction: Direction,
    depth: usize,
    /// How risky the change is is a judgment the graph cannot make.
    risk: &'static str,
    qualification: Qualification,
    summary: BlastSummary,
    #[serde(rename = "byKind")]
    by_kind: IndexMap<String, usize>,
    #[serde(rename = "byDomain")]
    by_domain: IndexMap<String, usize>,
    nodes: RowPage<AffectedNode<'a>>,
    edges: RowPage<DependencyEdge<'a>>,
}

pub fn blast_radius<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<BlastRadiusAnswer<'a>, QueryError> {
    let walk = DependencyWalk::run(graph, request)?;
    let nearest = walk.neighborhood.nearest_first();
    let affected: Vec<(NodeId, usize)> = nearest
        .iter()
        .filter_map(|&place| walk.neighborhood.reached().get(place))
        .map(|row| (row.node, row.distance))
        .collect();
    let edges: Vec<Hop> = hops_between(graph, walk.neighborhood.hops(), |_| true);

    let mut domains = DomainLookup::new(graph);
    let node_domains: Vec<Option<&str>> = affected
        .iter()
        .map(|&(node, _)| domains.slug_of(node))
        .collect();
    let by_kind = kind_counts(graph, affected.iter().map(|&(node, _)| node));
    let by_domain = sorted_counts(node_domains.iter().copied().flatten());

    let mut cross_domain_edges = 0;
    let mut edge_rows: Vec<DependencyEdge<'a>> = Vec::new();
    for &hop in &edges {
        let edge = graph.edge(hop.edge);
        let ends = EdgeDomains {
            from: domains.slug_of(edge.from),
            to: edge.to().and_then(|to| domains.slug_of(to)),
        };
        if ends.crosses() {
            cross_domain_edges += 1;
        }
        if edge_rows.len() < walk.limit {
            edge_rows.push(DependencyEdge::new(graph, hop, Some(ends)));
        }
    }

    let rows: Vec<AffectedNode<'a>> = affected
        .iter()
        .zip(&node_domains)
        .take(walk.limit)
        .map(|(&(node, distance), &domain)| AffectedNode {
            slug: graph.node(node).slug(),
            distance,
            domain,
            node: NodeSummary::of(graph, node),
        })
        .collect();

    Ok(BlastRadiusAnswer {
        operation: "blast_radius",
        center: graph.node(walk.center).slug(),
        node: NodeSummary::of(graph, walk.center),
        direction: walk.direction,
        depth: walk.depth,
        risk: "unknown",
        qualification: Qualification::of(graph, &edges),
        summary: BlastSummary {
            affected_nodes: affected.len(),
            affected_edges: edges.len(),
            affected_kinds: by_kind.len(),
            affected_domains: by_domain.len(),
            cross_domain_edges,
        },
        by_kind,
        by_domain,
        nodes: RowPage::new(affected.len(), walk.limit, rows),
        edges: RowPage::new(edges.len(), walk.limit, edge_rows),
    })
}
