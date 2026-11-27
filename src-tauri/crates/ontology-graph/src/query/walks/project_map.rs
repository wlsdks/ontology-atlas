//! `project_map`: a project's domains, each with its capabilities, elements and most connected
//! nodes, the nodes no domain holds, and the project's most connected nodes.
//!
//! An answer stays within [`MAP_TEXT_CHARS`] characters as the JavaScript server wrote them: when
//! the lists asked for do not fit, every per-domain list is cut to half and the answer says how far.

use serde::Serialize;

use super::project_root::project_root;
use super::row_page::NodePage;
use super::scope::{EdgeCounts, Scope, ScopeEdges};
use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::node_summary::NodeSummary;
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;

/// The characters an answer keeps to, counted in pretty-printed JSON.
const MAP_TEXT_CHARS: usize = 36_000;
const DEFAULT_LIMIT: usize = 50;
const DEFAULT_ITEM_LIMIT: usize = 20;
const DOMAIN_HOTSPOTS_MAX: usize = 5;

/// A node with its total degree, as the most connected nodes of a scope are listed.
#[derive(Serialize)]
struct Hotspot<'a> {
    #[serde(flatten)]
    summary: NodeSummary<'a>,
    degree: u32,
}

/// The most connected `count` of `nodes`: by total degree, then incoming degree, then the order of
/// the graph.
fn most_connected(graph: &CompiledGraph, nodes: &[NodeId], count: usize) -> Vec<NodeId> {
    let mut ranked = nodes.to_vec();
    ranked.sort_by(|&left, &right| {
        let (a, b) = (graph.node(left), graph.node(right));
        b.degree()
            .cmp(&a.degree())
            .then_with(|| b.in_degree.cmp(&a.in_degree))
            .then_with(|| left.cmp(&right))
    });
    ranked.truncate(count);
    ranked
}

fn hotspots<'a>(graph: &'a CompiledGraph, nodes: &[NodeId], count: usize) -> Vec<Hotspot<'a>> {
    nodes
        .iter()
        .take(count)
        .map(|&node| Hotspot {
            summary: NodeSummary::of(graph, node),
            degree: graph.node(node).degree(),
        })
        .collect()
}

#[derive(Serialize)]
struct MapSummary {
    nodes: usize,
    domains: usize,
    capabilities: usize,
    elements: usize,
    #[serde(rename = "unassignedNodes")]
    unassigned_nodes: usize,
    #[serde(flatten)]
    edges: EdgeCounts,
}

#[derive(Serialize)]
struct DomainSummary {
    nodes: usize,
    capabilities: usize,
    elements: usize,
    #[serde(flatten)]
    edges: EdgeCounts,
}

#[derive(Serialize)]
struct DomainRow<'a> {
    slug: &'a str,
    node: NodeSummary<'a>,
    summary: DomainSummary,
    capabilities: NodePage<NodeSummary<'a>>,
    elements: NodePage<NodeSummary<'a>>,
    hotspots: Vec<Hotspot<'a>>,
}

#[derive(Serialize)]
struct NarrowedToFit {
    #[serde(rename = "requestedItemLimit")]
    requested_item_limit: usize,
    #[serde(rename = "itemLimit")]
    item_limit: usize,
    next: String,
}

#[derive(Serialize)]
pub struct ProjectMapAnswer<'a> {
    operation: &'static str,
    project: &'a str,
    node: NodeSummary<'a>,
    summary: MapSummary,
    limited: bool,
    domains: Vec<DomainRow<'a>>,
    unassigned: NodePage<NodeSummary<'a>>,
    hotspots: Vec<Hotspot<'a>>,
    #[serde(rename = "narrowedToFit", skip_serializing_if = "Option::is_none")]
    narrowed_to_fit: Option<NarrowedToFit>,
}

/// A list of nodes of a domain: how many there are and the first of them.
struct Listed {
    total: usize,
    first: Vec<NodeId>,
}

impl Listed {
    fn of(nodes: Vec<NodeId>, kept: usize) -> Self {
        let total = nodes.len();
        Self {
            total,
            first: nodes.into_iter().take(kept).collect(),
        }
    }
}

/// What the answer knows of one domain before its lists are cut.
struct DomainFacts {
    domain: NodeId,
    nodes: usize,
    edges: EdgeCounts,
    capabilities: Listed,
    elements: Listed,
    hotspots: Vec<NodeId>,
}

/// What a project map holds before any list is cut to `item_limit`. Each list is kept at the
/// length asked for, so cutting it again to fit costs no second walk of the graph.
struct MapFacts {
    project: NodeId,
    nodes: usize,
    capabilities: usize,
    elements: usize,
    edges: EdgeCounts,
    domains_total: usize,
    domains: Vec<DomainFacts>,
    unassigned: Listed,
    hotspots: Vec<NodeId>,
}

impl MapFacts {
    fn gather(
        graph: &CompiledGraph,
        project: NodeId,
        limit: usize,
        item_limit: usize,
    ) -> Self {
        let scope = Scope::of(graph, project);
        let of_kind = |kind: &str| -> Vec<NodeId> {
            scope
                .nodes
                .iter()
                .copied()
                .filter(|&node| graph.node(node).kind() == kind)
                .collect()
        };
        let domains = of_kind("domain");
        let under_a_domain = Scope::holding(graph, &domains);
        let unassigned: Vec<NodeId> = scope
            .nodes
            .iter()
            .copied()
            .filter(|&node| node != project && !under_a_domain.contains(node))
            .collect();
        let domain_facts: Vec<DomainFacts> = domains
            .iter()
            .take(limit)
            .map(|&domain| {
                let held = Scope::of(graph, domain);
                let among = |kind: &str| -> Vec<NodeId> {
                    held.nodes
                        .iter()
                        .copied()
                        .filter(|&node| graph.node(node).kind() == kind)
                        .collect()
                };
                DomainFacts {
                    domain,
                    nodes: held.nodes.len(),
                    edges: EdgeCounts::of(&ScopeEdges::of(graph, &held)),
                    capabilities: Listed::of(among("capability"), item_limit),
                    elements: Listed::of(among("element"), item_limit),
                    hotspots: most_connected(graph, &held.nodes, DOMAIN_HOTSPOTS_MAX),
                }
            })
            .collect();
        Self {
            project,
            nodes: scope.nodes.len(),
            capabilities: of_kind("capability").len(),
            elements: of_kind("element").len(),
            edges: EdgeCounts::of(&ScopeEdges::of(graph, &scope)),
            domains_total: domains.len(),
            domains: domain_facts,
            unassigned: Listed::of(unassigned, item_limit),
            hotspots: most_connected(graph, &scope.nodes, item_limit),
        }
    }

    fn render<'a>(
        &self,
        graph: &'a CompiledGraph,
        limit: usize,
        item_limit: usize,
    ) -> ProjectMapAnswer<'a> {
        let page = |listed: &Listed| {
            NodePage::new(
                listed.total,
                item_limit,
                listed
                    .first
                    .iter()
                    .take(item_limit)
                    .map(|&node| NodeSummary::of(graph, node))
                    .collect(),
            )
        };
        ProjectMapAnswer {
            operation: "project_map",
            project: graph.node(self.project).slug(),
            node: NodeSummary::of(graph, self.project),
            summary: MapSummary {
                nodes: self.nodes,
                domains: self.domains_total,
                capabilities: self.capabilities,
                elements: self.elements,
                unassigned_nodes: self.unassigned.total,
                edges: self.edges.clone(),
            },
            limited: self.domains_total > limit,
            domains: self
                .domains
                .iter()
                .map(|facts| DomainRow {
                    slug: graph.node(facts.domain).slug(),
                    node: NodeSummary::of(graph, facts.domain),
                    summary: DomainSummary {
                        nodes: facts.nodes,
                        capabilities: facts.capabilities.total,
                        elements: facts.elements.total,
                        edges: facts.edges.clone(),
                    },
                    capabilities: page(&facts.capabilities),
                    elements: page(&facts.elements),
                    hotspots: hotspots(graph, &facts.hotspots, item_limit.min(DOMAIN_HOTSPOTS_MAX)),
                })
                .collect(),
            unassigned: page(&self.unassigned),
            hotspots: hotspots(graph, &self.hotspots, item_limit),
            narrowed_to_fit: None,
        }
    }

}

fn written_length(answer: &ProjectMapAnswer<'_>) -> usize {
    answer_format::json::to_string_indented(answer, 2)
        .map_or(usize::MAX, |text| answer_format::utf16::len(&text))
}

pub fn project_map<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<ProjectMapAnswer<'a>, QueryError> {
    let requested = request.item_limit.unwrap_or(DEFAULT_ITEM_LIMIT);
    let limit = request.limit.unwrap_or(DEFAULT_LIMIT);
    let project = project_root(graph, request, "project_map")?;
    let facts = MapFacts::gather(graph, project, limit, requested);

    let mut item_limit = requested;
    let mut map = facts.render(graph, limit, item_limit);
    while item_limit > 1 && written_length(&map) > MAP_TEXT_CHARS {
        item_limit = (item_limit / 2).max(1);
        map = facts.render(graph, limit, item_limit);
    }
    if item_limit != requested {
        map.narrowed_to_fit = Some(NarrowedToFit {
            requested_item_limit: requested,
            item_limit,
            next: format!("Lists were cut to {item_limit} per domain to keep this answer under {MAP_TEXT_CHARS} characters; query_ontology({{operation:\"domain_profile\", slug}}) lists one domain in full."),
        });
    }
    Ok(map)
}
