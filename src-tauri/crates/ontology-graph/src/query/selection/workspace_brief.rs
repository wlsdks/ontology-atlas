//! `workspace_brief`: the first page of a vault, for an agent that has just arrived: how big it is,
//! whether it is sound, what each project holds, where the connections gather and what to do next.
//! It is the verdicts of `health` and `growth_plan` and a short map of each project, so the first
//! call says where to look and the next ones go there.
//!
//! The vault's own validation report and the project meaning assessment are added to this answer by
//! the tool that serves it, after the graph has answered.

use serde::Serialize;

use super::containment::Containment;
use super::graph_summary::{top_hubs, DegreeRow};
use super::growth_candidates::DanglingReferenceRow;
use super::growth_plan::{growth_plan_with_limit, GrowthPlanAnswer, GrowthSummary};
use super::health::{health, HealthAnswer, HealthCheck, HealthQuestion};
use super::limited_nodes::LimitedNodes;
use super::project_map::{DomainMapRow, MapSummary, ProjectMapBase};
use super::proposed_action::ProposedAction;
use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::name_counts::kind_counts;
use crate::query::node_summary::NodeSummary;
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;
use answer_format::utf16;

const DEFAULT_LIMIT: usize = 10;
/// A project's page is asked for at most this many items per list.
const PROJECT_ITEM_LIMIT: usize = 20;
/// A next action that shows rows shows at most this many.
const SAMPLE_LIMIT: usize = 3;

#[derive(Serialize)]
struct BriefSummary<'a> {
    #[serde(rename = "graphHash")]
    graph_hash: &'a str,
    #[serde(rename = "maxMtime")]
    max_mtime: f64,
    nodes: usize,
    edges: usize,
    projects: usize,
    domains: usize,
    capabilities: usize,
    elements: usize,
    #[serde(rename = "externalEdges")]
    external_edges: usize,
    #[serde(rename = "unresolvedEdges")]
    unresolved_edges: usize,
    issues: usize,
    #[serde(rename = "growthActions")]
    growth_actions: usize,
}

#[derive(Serialize)]
struct BriefHealth {
    status: &'static str,
    checks: Vec<HealthCheck>,
}

#[derive(Serialize)]
struct BriefDomain<'a> {
    slug: &'a str,
    node: NodeSummary<'a>,
    summary: super::domain_profile::DomainSummary,
}

#[derive(Serialize)]
struct ProjectBrief<'a> {
    project: &'a str,
    node: NodeSummary<'a>,
    summary: MapSummary,
    domains: Vec<BriefDomain<'a>>,
    unassigned: LimitedNodes<'a>,
}

#[derive(Serialize)]
struct BriefProjects<'a> {
    total: usize,
    limited: bool,
    maps: Vec<ProjectBrief<'a>>,
}

#[derive(Serialize)]
struct HealthCheckAction {
    kind: &'static str,
    severity: &'static str,
    id: &'static str,
    count: usize,
    message: String,
}

#[derive(Serialize)]
struct SampledAction<Sample> {
    id: &'static str,
    kind: &'static str,
    severity: &'static str,
    count: usize,
    message: &'static str,
    sample: Vec<Sample>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum NextAction<'a> {
    Check(HealthCheckAction),
    Writes(SampledAction<ProposedAction>),
    References(SampledAction<DanglingReferenceRow<'a>>),
}

#[derive(Serialize)]
pub struct WorkspaceBriefAnswer<'a> {
    operation: &'static str,
    status: &'static str,
    summary: BriefSummary<'a>,
    health: BriefHealth,
    growth: GrowthSummary,
    projects: BriefProjects<'a>,
    hotspots: Vec<DegreeRow<'a>>,
    #[serde(rename = "nextActions")]
    next_actions: Vec<NextAction<'a>>,
}

/// The project nodes in the order their slugs sort by UTF-16 code unit.
fn project_roots(graph: &CompiledGraph) -> Vec<NodeId> {
    let mut roots: Vec<NodeId> = graph
        .node_ids()
        .filter(|id| graph.node(*id).kind() == "project")
        .collect();
    roots.sort_by(|left, right| {
        utf16::compare(graph.node(*left).slug(), graph.node(*right).slug())
    });
    roots
}

fn next_actions<'a>(
    checks: &[HealthCheck],
    growth: GrowthPlanAnswer<'a>,
    limit: usize,
) -> Vec<NextAction<'a>> {
    let sample = SAMPLE_LIMIT.min(limit);
    let mut actions: Vec<NextAction<'a>> = checks
        .iter()
        .filter(|check| check.status() != "pass")
        .map(|check| {
            NextAction::Check(HealthCheckAction {
                kind: "health_check",
                severity: check.status(),
                id: check.id(),
                count: check.count(),
                message: check.message().to_string(),
            })
        })
        .collect();
    let GrowthPlanAnswer {
        summary,
        relation_recommendations,
        external_element_refs,
        dangling_references,
        ..
    } = growth;
    if summary.recommendations() > 0 {
        actions.push(NextAction::Writes(SampledAction {
            id: "add_missing_relations",
            kind: "add_missing_relations",
            severity: "warn",
            count: summary.recommendations(),
            message: "Add missing domain containment relations before relying on project/domain rollups.",
            sample: relation_recommendations
                .rows()
                .iter()
                .take(sample)
                .map(|row| row.proposed_action.clone())
                .collect(),
        }));
    }
    if summary.dangling() > 0 {
        actions.push(NextAction::References(SampledAction {
            id: "resolve_dangling_references",
            kind: "resolve_dangling_references",
            severity: "warn",
            count: summary.dangling(),
            message: "Resolve dangling graph references or create the missing ontology nodes.",
            sample: dangling_references.rows.into_iter().take(sample).collect(),
        }));
    }
    if summary.external() > 0 {
        actions.push(NextAction::Writes(SampledAction {
            id: "materialize_external_elements",
            kind: "materialize_external_elements",
            severity: "info",
            count: summary.external(),
            message: "Materialize frequently referenced external files as element nodes when they should be first-class.",
            sample: external_element_refs
                .into_rows()
                .into_iter()
                .take(sample)
                .map(|row| row.proposed_action)
                .collect(),
        }));
    }
    actions.truncate(limit);
    actions
}

pub fn workspace_brief<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<WorkspaceBriefAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(DEFAULT_LIMIT);
    let arguments = &request.selection.arguments;
    let mut question = HealthQuestion::from_request(request);
    question.component_limit = arguments.component_limit.unwrap_or(limit);
    question.cycle_limit = arguments.cycle_limit.unwrap_or(limit);
    question.recommendation_limit = arguments.recommendation_limit.unwrap_or(limit);
    question.order_limit = arguments.order_limit.unwrap_or(limit);
    question.node_limit = request.node_limit.unwrap_or(limit);
    question.max_hops = None;
    question.component_types_argument = "componentTypes";
    let HealthAnswer { status, checks, .. } = health(graph, &question)?;
    let growth = growth_plan_with_limit(graph, request, limit)?;

    let counts = graph.edge_counts();
    let by_kind = kind_counts(graph, graph.node_ids());
    let roots = project_roots(graph);
    let containment = Containment::of(graph);
    let maps: Vec<ProjectBrief<'a>> = roots
        .iter()
        .take(limit)
        .map(|project| {
            let base = ProjectMapBase::of(graph, &containment, *project, limit);
            let map = base.fitted(limit.min(PROJECT_ITEM_LIMIT));
            ProjectBrief {
                project: map.project,
                node: map.node,
                summary: map.summary,
                domains: map
                    .domains
                    .into_iter()
                    .map(|DomainMapRow { slug, node, summary, .. }| BriefDomain {
                        slug,
                        node,
                        summary,
                    })
                    .collect(),
                unassigned: map.unassigned,
            }
        })
        .collect();
    let growth_actions = growth.summary.total_actions();
    let growth_summary = growth.summary.clone();
    let actions = next_actions(&checks, growth, limit);
    Ok(WorkspaceBriefAnswer {
        operation: "workspace_brief",
        status,
        summary: BriefSummary {
            graph_hash: graph.graph_hash(),
            max_mtime: graph.max_mtime(),
            nodes: graph.nodes().len(),
            edges: graph.edges().len(),
            projects: roots.len(),
            domains: by_kind.get("domain").copied().unwrap_or(0),
            capabilities: by_kind.get("capability").copied().unwrap_or(0),
            elements: by_kind.get("element").copied().unwrap_or(0),
            external_edges: counts.external,
            unresolved_edges: counts.unresolved,
            issues: graph.issues().len(),
            growth_actions,
        },
        health: BriefHealth { status, checks },
        growth: growth_summary,
        projects: BriefProjects {
            total: roots.len(),
            limited: roots.len() > limit,
            maps,
        },
        hotspots: top_hubs(graph, limit),
        next_actions: actions,
    })
}
