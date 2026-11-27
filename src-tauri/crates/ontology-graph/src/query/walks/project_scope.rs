//! `project_scope`: every node a project holds, and its edges told apart by where they end.

use indexmap::IndexMap;
use serde::Serialize;

use super::row_page::RowPage;
use crate::compiled_graph::CompiledGraph;
use crate::query::name_counts::{domain_counts, kind_counts};
use crate::query::node_summary::NodeSummary;
use crate::query::project_root::project_root;
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;
use crate::query::scope::{EdgeCounts, Scope, ScopeEdgeGroup, ScopeEdges};

const DEFAULT_LIMIT: usize = 200;

#[derive(Serialize)]
struct ScopeSummary {
    nodes: usize,
    #[serde(flatten)]
    edges: EdgeCounts,
}

#[derive(Serialize)]
struct ScopeEdgeGroups<'a> {
    internal: ScopeEdgeGroup<'a>,
    boundary: ScopeEdgeGroup<'a>,
    external: ScopeEdgeGroup<'a>,
    unresolved: ScopeEdgeGroup<'a>,
}

#[derive(Serialize)]
pub struct ProjectScopeAnswer<'a> {
    operation: &'static str,
    project: &'a str,
    node: NodeSummary<'a>,
    summary: ScopeSummary,
    #[serde(rename = "byKind")]
    by_kind: IndexMap<String, usize>,
    #[serde(rename = "byDomain")]
    by_domain: IndexMap<String, usize>,
    nodes: RowPage<NodeSummary<'a>>,
    edges: ScopeEdgeGroups<'a>,
}

pub fn project_scope<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<ProjectScopeAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(DEFAULT_LIMIT);
    let project = project_root(graph, request, "project_scope")?;
    let scope = Scope::of(graph, project);
    let edges = ScopeEdges::of(graph, &scope);
    Ok(ProjectScopeAnswer {
        operation: "project_scope",
        project: graph.node(project).slug(),
        node: NodeSummary::of(graph, project),
        summary: ScopeSummary {
            nodes: scope.nodes.len(),
            edges: EdgeCounts::of(&edges),
        },
        by_kind: kind_counts(graph, scope.nodes.iter().copied()),
        by_domain: domain_counts(graph, scope.nodes.iter().copied()),
        nodes: RowPage::new(
            scope.nodes.len(),
            limit,
            scope
                .nodes
                .iter()
                .take(limit)
                .map(|&node| NodeSummary::of(graph, node))
                .collect(),
        ),
        edges: ScopeEdgeGroups {
            internal: ScopeEdgeGroup::of(graph, &edges.internal, &scope, limit),
            boundary: ScopeEdgeGroup::of(graph, &edges.boundary, &scope, limit),
            external: ScopeEdgeGroup::of(graph, &edges.external, &scope, limit),
            unresolved: ScopeEdgeGroup::of(graph, &edges.unresolved, &scope, limit),
        },
    })
}
