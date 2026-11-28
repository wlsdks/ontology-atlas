//! `workspace_brief`: the first page of a vault, for an agent that has just arrived: how big it is,
//! whether it is sound, what each project holds, where the connections gather and what to do next.
//! It is the verdicts of `health` and `growth_plan` and a short map of each project, so the first
//! call says where to look and the next ones go there.
//!
//! The vault's own validation report and the project meaning assessment are added to this answer by
//! the tool that serves it, after the graph has answered.

use answer_format::json::RawJson;
use serde::Serialize;

use super::graph_summary::{top_hubs, DegreeRow};
use super::growth_candidates::DanglingReferenceRow;
use super::growth_plan::{growth_plan_with_limit, BodiesLookedAt, GrowthPlanAnswer, GrowthSummary};
use super::health::{health, HealthAnswer, HealthCheck, HealthQuestion};
use super::outside_checks::{AttentionAction, OutsideChecks};
use super::proposed_action::ProposedAction;
use crate::compiled_graph::CompiledGraph;
use crate::query::name_counts::kind_counts;
use crate::query::node_summary::NodeSummary;
use crate::query::operation_defaults::WORKSPACE_BRIEF_LIMIT;
use crate::query::project_root::project_roots;
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;
use crate::query::walks::project_map::{fitted_map, DomainRow, DomainSummary, MapSummary};
use crate::query::walks::row_page::NodePage;

/// A project's page is asked for at most this many items per list.
const PROJECT_ITEM_LIMIT: usize = 20;
/// A next action that shows rows shows at most this many.
const SAMPLE_LIMIT: usize = 3;

#[derive(Serialize)]
pub(super) struct BriefSummary<'a> {
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

impl BriefSummary<'_> {
    pub(super) fn node_count(&self) -> usize {
        self.nodes
    }

    pub(super) fn edge_count(&self) -> usize {
        self.edges
    }

    pub(super) fn project_count(&self) -> usize {
        self.projects
    }

    pub(super) fn domain_count(&self) -> usize {
        self.domains
    }

    pub(super) fn capability_count(&self) -> usize {
        self.capabilities
    }

    pub(super) fn element_count(&self) -> usize {
        self.elements
    }

    pub(super) fn unresolved_count(&self) -> usize {
        self.unresolved_edges
    }

    pub(super) fn external_count(&self) -> usize {
        self.external_edges
    }

    pub(super) fn growth_action_count(&self) -> usize {
        self.growth_actions
    }
}

#[derive(Serialize)]
pub(super) struct BriefHealth {
    pub(super) status: &'static str,
    pub(super) checks: Vec<HealthCheck>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) validation: Option<Box<RawJson>>,
}

#[derive(Serialize)]
struct BriefDomain<'a> {
    slug: &'a str,
    node: NodeSummary<'a>,
    summary: DomainSummary,
}

#[derive(Serialize)]
struct ProjectBrief<'a> {
    project: &'a str,
    node: NodeSummary<'a>,
    summary: MapSummary,
    domains: Vec<BriefDomain<'a>>,
    unassigned: NodePage<NodeSummary<'a>>,
}

#[derive(Serialize)]
struct BriefProjects<'a> {
    total: usize,
    limited: bool,
    maps: Vec<ProjectBrief<'a>>,
}

#[derive(Serialize)]
pub(super) struct HealthCheckAction {
    kind: &'static str,
    severity: &'static str,
    id: &'static str,
    count: usize,
    message: String,
}

#[derive(Serialize)]
pub(super) struct SampledAction<Sample> {
    id: &'static str,
    kind: &'static str,
    severity: &'static str,
    count: usize,
    message: &'static str,
    sample: Vec<Sample>,
}

#[derive(Serialize)]
#[serde(untagged)]
pub(super) enum NextAction<'a> {
    Outside(AttentionAction),
    Check(HealthCheckAction),
    Writes(SampledAction<ProposedAction>),
    References(SampledAction<DanglingReferenceRow<'a>>),
}

#[derive(Serialize)]
pub struct WorkspaceBriefAnswer<'a> {
    operation: &'static str,
    pub(super) status: &'static str,
    /// The verdict before the vault's validation was taken into it.
    #[serde(skip)]
    pub(super) graph_status: &'static str,
    pub(super) summary: BriefSummary<'a>,
    pub(super) health: BriefHealth,
    growth: GrowthSummary,
    projects: BriefProjects<'a>,
    hotspots: Vec<DegreeRow<'a>>,
    #[serde(rename = "nextActions")]
    pub(super) next_actions: Vec<NextAction<'a>>,
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
            sample: dangling_references
                .into_rows()
                .into_iter()
                .take(sample)
                .collect(),
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
    let limit = request.limit.unwrap_or(WORKSPACE_BRIEF_LIMIT);
    workspace_brief_of(graph, request, limit, ProjectMaps::Included)
}

/// Whether the brief carries the short map of each project, which a brief that only reads the
/// counts of this one (`agent_brief`) leaves unbuilt.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ProjectMaps {
    Included,
    Left,
}

pub fn workspace_brief_of<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
    limit: usize,
    project_maps: ProjectMaps,
) -> Result<WorkspaceBriefAnswer<'a>, QueryError> {
    let mut question = HealthQuestion::from_request(request);
    question.component_limit = limit;
    question.cycle_limit = limit;
    question.recommendation_limit = limit;
    question.order_limit = limit;
    question.node_limit = limit;
    question.max_hops = None;
    question.component_types_argument = "componentTypes";
    let HealthAnswer { status, checks, .. } = health(graph, &question)?;
    let graph_status = status;
    let growth = growth_plan_with_limit(graph, request, limit, BodiesLookedAt::No)?;

    let counts = graph.edge_counts();
    let by_kind = kind_counts(graph, graph.node_ids());
    let roots = project_roots(graph);
    let mapped_projects = if project_maps == ProjectMaps::Included {
        limit
    } else {
        0
    };
    let maps: Vec<ProjectBrief<'a>> = roots
        .iter()
        .take(mapped_projects)
        .map(|project| {
            let map = fitted_map(graph, *project, limit, limit.min(PROJECT_ITEM_LIMIT));
            ProjectBrief {
                project: map.project,
                node: map.node,
                summary: map.summary,
                domains: map
                    .domains
                    .into_iter()
                    .map(
                        |DomainRow {
                             slug,
                             node,
                             summary,
                             ..
                         }| BriefDomain {
                            slug,
                            node,
                            summary,
                        },
                    )
                    .collect(),
                unassigned: map.unassigned,
            }
        })
        .collect();
    let growth_actions = growth.summary.total_actions();
    let growth_summary = growth.summary.clone();
    let mut actions = next_actions(&checks, growth, limit);
    let outside = OutsideChecks::of(&request.selection.outside);
    let status = outside.status(status);
    let parts = outside.into_parts();
    let mut checks = checks;
    checks.extend(parts.checks);
    let attention: Vec<NextAction<'a>> =
        parts.actions.into_iter().map(NextAction::Outside).collect();
    actions.splice(0..0, attention);
    actions.truncate(limit);
    Ok(WorkspaceBriefAnswer {
        operation: "workspace_brief",
        status,
        graph_status,
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
        health: BriefHealth {
            status,
            checks,
            validation: parts.validation,
        },
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
