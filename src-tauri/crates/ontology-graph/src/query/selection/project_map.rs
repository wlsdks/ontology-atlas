//! A project and its domains on one page: how many nodes and edges each holds, a few of its
//! capabilities and elements, and its most connected nodes. The page answers within a character
//! bound, so a large project is shown with shorter lists rather than as an answer too long to read.

use std::collections::HashSet;

use answer_format::utf16;
use serde::Serialize;

use super::containment::{Containment, Scope};
use super::domain_profile::{of_kind, DomainSummary};
use super::graph_summary::{top_hubs_among, DegreeRow};
use super::limited_nodes::LimitedNodes;
use super::scope_edges::{EdgeTotals, ScopeEdges};
use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::node_summary::NodeSummary;

/// The most characters the pretty-printed page may hold before its lists are cut.
const TEXT_CHARS: usize = 36_000;
/// A domain row names its most connected nodes up to this many, whatever the list limit.
const DOMAIN_HOTSPOTS: usize = 5;

#[derive(Serialize, Clone)]
pub struct MapSummary {
    nodes: usize,
    domains: usize,
    capabilities: usize,
    elements: usize,
    #[serde(rename = "unassignedNodes")]
    unassigned_nodes: usize,
    #[serde(flatten)]
    edges: EdgeTotals,
}

#[derive(Serialize)]
pub struct DomainMapRow<'a> {
    pub(super) slug: &'a str,
    pub(super) node: NodeSummary<'a>,
    pub(super) summary: DomainSummary,
    capabilities: LimitedNodes<'a>,
    elements: LimitedNodes<'a>,
    hotspots: Vec<DegreeRow<'a>>,
}

#[derive(Serialize)]
pub struct ProjectMap<'a> {
    operation: &'static str,
    pub(super) project: &'a str,
    pub(super) node: NodeSummary<'a>,
    pub(super) summary: MapSummary,
    limited: bool,
    pub(super) domains: Vec<DomainMapRow<'a>>,
    pub(super) unassigned: LimitedNodes<'a>,
    hotspots: Vec<DegreeRow<'a>>,
}

/// What does not change as the lists are cut: the scopes and counts of one project, found once.
struct DomainBase {
    domain: NodeId,
    scope: Scope,
    summary: DomainSummary,
}

pub struct ProjectMapBase<'a> {
    graph: &'a CompiledGraph,
    project: NodeId,
    scope: Scope,
    domain_total: usize,
    rows: Vec<DomainBase>,
    row_limit: usize,
    unassigned: Vec<NodeId>,
    summary: MapSummary,
}

impl<'a> ProjectMapBase<'a> {
    /// Reads the project's scope, then each domain's scope inside it. A domain's counts are worked
    /// out only for the `limit` rows the page shows; the others are only walked, to know which
    /// nodes no domain holds.
    pub fn of(
        graph: &'a CompiledGraph,
        containment: &Containment<'_>,
        project: NodeId,
        limit: usize,
    ) -> Self {
        let scope = containment.scope_under(project);
        let domains = of_kind(graph, &scope, "domain");
        let mut covered: HashSet<NodeId> = HashSet::from([project]);
        let mut rows = Vec::new();
        for (index, domain) in domains.iter().enumerate() {
            let domain_scope = containment.scope_under(*domain).intersect(&scope);
            covered.extend(domain_scope.ids().iter().copied());
            if index < limit {
                let edges = ScopeEdges::of(graph, &domain_scope);
                rows.push(DomainBase {
                    domain: *domain,
                    summary: DomainSummary::of(graph, &domain_scope, &edges),
                    scope: domain_scope,
                });
            }
        }
        let unassigned: Vec<NodeId> = scope
            .ids()
            .iter()
            .copied()
            .filter(|id| !covered.contains(id))
            .collect();
        let edges = ScopeEdges::of(graph, &scope);
        let summary = MapSummary {
            nodes: scope.len(),
            domains: domains.len(),
            capabilities: of_kind(graph, &scope, "capability").len(),
            elements: of_kind(graph, &scope, "element").len(),
            unassigned_nodes: unassigned.len(),
            edges: EdgeTotals::from(&edges),
        };
        Self {
            graph,
            project,
            scope,
            domain_total: domains.len(),
            rows,
            row_limit: limit,
            unassigned,
            summary,
        }
    }

    /// The page with lists cut to `item_limit`.
    fn page(&self, item_limit: usize) -> ProjectMap<'a> {
        let graph = self.graph;
        ProjectMap {
            operation: "project_map",
            project: graph.node(self.project).slug(),
            node: NodeSummary::of(graph, self.project),
            summary: self.summary.clone(),
            limited: self.domain_total > self.row_limit,
            domains: self
                .rows
                .iter()
                .map(|row| DomainMapRow {
                    slug: graph.node(row.domain).slug(),
                    node: NodeSummary::of(graph, row.domain),
                    summary: row.summary.clone(),
                    capabilities: LimitedNodes::of(
                        graph,
                        &of_kind(graph, &row.scope, "capability"),
                        item_limit,
                    ),
                    elements: LimitedNodes::of(
                        graph,
                        &of_kind(graph, &row.scope, "element"),
                        item_limit,
                    ),
                    hotspots: top_hubs_among(
                        graph,
                        row.scope.ids().iter().copied(),
                        item_limit.min(DOMAIN_HOTSPOTS),
                    ),
                })
                .collect(),
            unassigned: LimitedNodes::of(graph, &self.unassigned, item_limit),
            hotspots: top_hubs_among(graph, self.scope.ids().iter().copied(), item_limit),
        }
    }

    /// The page with the longest lists, up to `requested`, that keep its pretty-printed text within
    /// the bound: the limit is halved until it fits or reaches one, so at most log2 of it builds.
    pub fn fitted(&self, requested: usize) -> ProjectMap<'a> {
        let mut item_limit = requested;
        let mut page = self.page(item_limit);
        while item_limit > 1 && written_length(&page) > TEXT_CHARS {
            item_limit = (item_limit / 2).max(1);
            page = self.page(item_limit);
        }
        page
    }
}

/// How many UTF-16 code units `JSON.stringify(page, null, 2)` would write.
fn written_length(page: &ProjectMap<'_>) -> usize {
    answer_format::json::to_string_indented(page, 2)
        .map(|text| utf16::len(&text))
        .unwrap_or(0)
}
