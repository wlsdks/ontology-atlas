//! `domain_profile`: one domain and everything under it: its capabilities and elements, its most
//! connected nodes, and the edges that leave it, so an agent reads a responsibility whole.

use serde::Serialize;

use super::graph_summary::{top_hubs_among, DegreeRow};
use super::node_profile::ContainmentRow;
use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::containment_steps::parents;
use crate::query::node_resolution::resolve;
use crate::query::node_summary::NodeSummary;
use crate::query::operation_defaults::{DOMAIN_PROFILE_ITEM_LIMIT, DOMAIN_PROFILE_LIMIT};
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;
use crate::query::scope::{Scope, ScopeEdgeGroup, ScopeEdges};
use crate::query::walks::project_map::DomainSummary;
use crate::query::walks::row_page::NodePage;

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
    capabilities: NodePage<NodeSummary<'a>>,
    elements: NodePage<NodeSummary<'a>>,
    hotspots: Vec<DegreeRow<'a>>,
    edges: DomainEdges<'a>,
}

pub fn domain_profile<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<DomainProfileAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(DOMAIN_PROFILE_LIMIT);
    let item_limit = request.item_limit.unwrap_or(DOMAIN_PROFILE_ITEM_LIMIT);
    let named = request
        .slug
        .as_deref()
        .or(request.selection.arguments.domain.as_deref());
    let domain = resolve_domain(graph, named)?;
    let scope = Scope::of(graph, domain);
    let edges = ScopeEdges::of(graph, &scope);
    let parent_projects: Vec<ContainmentRow<'a>> = parents(graph, domain)
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
        capabilities: NodePage::of_nodes(graph, &scope.of_kind(graph, "capability"), item_limit),
        elements: NodePage::of_nodes(graph, &scope.of_kind(graph, "element"), item_limit),
        hotspots: top_hubs_among(graph, scope.nodes.iter().copied(), item_limit),
        edges: DomainEdges {
            boundary: ScopeEdgeGroup::of(graph, &edges.boundary, &scope, limit),
            external: ScopeEdgeGroup::of(graph, &edges.external, &scope, limit),
            unresolved: ScopeEdgeGroup::of(graph, &edges.unresolved, &scope, limit),
        },
    })
}
