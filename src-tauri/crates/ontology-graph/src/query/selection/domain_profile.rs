//! `domain_profile`: one domain and everything under it: its capabilities and elements, its most
//! connected nodes, and the edges that leave it, so an agent reads a responsibility whole.

use serde::Serialize;

use super::containment::{Containment, Scope};
use super::graph_summary::{top_hubs_among, DegreeRow};
use super::limited_nodes::LimitedNodes;
use super::node_profile::ContainmentRow;
use super::scope_edges::{EdgeTotals, ScopeEdgeGroup, ScopeEdges};
use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::node_resolution::resolve;
use crate::query::node_summary::NodeSummary;
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;

const DEFAULT_LIMIT: usize = 100;
const DEFAULT_ITEM_LIMIT: usize = 20;

/// The domain `name` means, or why it is none.
pub fn resolve_domain(graph: &CompiledGraph, name: Option<&str>) -> Result<NodeId, QueryError> {
    let domain = resolve(graph, name, "domain")?;
    let node = graph.node(domain);
    if node.kind() != "domain" {
        return Err(QueryError::Failed(format!(
            "domain \"{}\" must resolve to a kind: domain node.",
            node.slug()
        )));
    }
    Ok(domain)
}

/// What a domain's scope holds, counted: the summary of a domain in a profile and in a map.
#[derive(Serialize, Clone)]
pub struct DomainSummary {
    nodes: usize,
    capabilities: usize,
    elements: usize,
    #[serde(flatten)]
    edges: EdgeTotals,
}

impl DomainSummary {
    pub fn of(graph: &CompiledGraph, scope: &Scope, edges: &ScopeEdges) -> Self {
        let count = |kind: &str| {
            scope
                .ids()
                .iter()
                .filter(|id| graph.node(**id).kind() == kind)
                .count()
        };
        Self {
            nodes: scope.len(),
            capabilities: count("capability"),
            elements: count("element"),
            edges: EdgeTotals::from(edges),
        }
    }
}

/// The nodes of `scope` of one kind, in slug order.
pub fn of_kind(graph: &CompiledGraph, scope: &Scope, kind: &str) -> Vec<NodeId> {
    scope
        .ids()
        .iter()
        .copied()
        .filter(|id| graph.node(*id).kind() == kind)
        .collect()
}

#[derive(Serialize)]
struct ParentProjects<'a> {
    projects: Vec<ContainmentRow<'a>>,
}

#[derive(Serialize)]
struct DomainEdges<'a> {
    boundary: ScopeEdgeGroup<'a>,
    external: ScopeEdgeGroup<'a>,
    unresolved: ScopeEdgeGroup<'a>,
}

#[derive(Serialize)]
pub struct DomainProfileAnswer<'a> {
    operation: &'static str,
    domain: &'a str,
    node: NodeSummary<'a>,
    parents: ParentProjects<'a>,
    summary: DomainSummary,
    capabilities: LimitedNodes<'a>,
    elements: LimitedNodes<'a>,
    hotspots: Vec<DegreeRow<'a>>,
    edges: DomainEdges<'a>,
}

pub fn domain_profile<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<DomainProfileAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(DEFAULT_LIMIT);
    let item_limit = request
        .selection
        .arguments
        .item_limit
        .unwrap_or(DEFAULT_ITEM_LIMIT);
    let named = request
        .slug
        .as_deref()
        .or(request.selection.arguments.domain.as_deref());
    let domain = resolve_domain(graph, named)?;
    let containment = Containment::of(graph);
    let scope = containment.scope_under(domain);
    let edges = ScopeEdges::of(graph, &scope);
    let parent_projects: Vec<ContainmentRow<'a>> = containment
        .parents(domain)
        .iter()
        .filter(|link| graph.node(link.next).kind() == "project")
        .map(|link| ContainmentRow::of(graph, link.next, link.edge))
        .collect();
    Ok(DomainProfileAnswer {
        operation: "domain_profile",
        domain: graph.node(domain).slug(),
        node: NodeSummary::of(graph, domain),
        parents: ParentProjects {
            projects: parent_projects,
        },
        summary: DomainSummary::of(graph, &scope, &edges),
        capabilities: LimitedNodes::of(graph, &of_kind(graph, &scope, "capability"), item_limit),
        elements: LimitedNodes::of(graph, &of_kind(graph, &scope, "element"), item_limit),
        hotspots: top_hubs_among(graph, scope.ids().iter().copied(), item_limit),
        edges: DomainEdges {
            boundary: ScopeEdgeGroup::of(graph, &scope, &edges.boundary, limit),
            external: ScopeEdgeGroup::of(graph, &scope, &edges.external, limit),
            unresolved: ScopeEdgeGroup::of(graph, &scope, &edges.unresolved, limit),
        },
    })
}
