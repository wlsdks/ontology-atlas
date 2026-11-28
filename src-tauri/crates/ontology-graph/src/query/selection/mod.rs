//! The operations that pick nodes out of the graph or summarize it: `overview`, `schema`,
//! `facets`, `components`, `communities`, `similar_nodes`, `match_nodes`, `recommend_relations`,
//! `node_profile`, `growth_plan`, `maintenance_plan`, `health` and `workspace_brief`. What they read about the
//! world beside the graph (the vault's validation, its ignore file, the reads its bodies ask for)
//! reaches them in `QueryRequest::selection`, handed over by the tool layer.

mod clusters;
mod dependency_view;
mod follow_up;
mod graph_summary;
mod growth_candidates;
mod growth_plan;
mod health;
mod ignored_references;
mod maintenance_action;
mod maintenance_plan;
mod match_nodes;
mod node_profile;
mod outside_checks;
mod proposed_action;
mod reference_repair;
mod relation_filter;
mod relation_recommendations;
mod selection_request;
mod similar_nodes;
mod starter_examples;
mod workspace_brief;

pub(in crate::query) use match_nodes::count_matching_nodes;

pub use ignored_references::parse_patterns as parse_ignore_patterns;
pub use selection_request::{
    LineSpan, NodeSort, OutsideFacts, SelectionArguments, SelectionRequest,
    StaleSummary, UncertaintyRead, VaultValidationFacts,
};

use serde::Serialize;

use crate::compiled_graph::CompiledGraph;
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SelectionOperation {
    Overview,
    Schema,
    Facets,
    Components,
    Communities,
    SimilarNodes,
    MatchNodes,
    RecommendRelations,
    NodeProfile,
    GrowthPlan,
    MaintenancePlan,
    Health,
    WorkspaceBrief,
}

impl SelectionOperation {
    pub const fn name(self) -> &'static str {
        match self {
            Self::Overview => "overview",
            Self::Schema => "schema",
            Self::Facets => "facets",
            Self::Components => "components",
            Self::Communities => "communities",
            Self::SimilarNodes => "similar_nodes",
            Self::MatchNodes => "match_nodes",
            Self::RecommendRelations => "recommend_relations",
            Self::NodeProfile => "node_profile",
            Self::GrowthPlan => "growth_plan",
            Self::MaintenancePlan => "maintenance_plan",
            Self::Health => "health",
            Self::WorkspaceBrief => "workspace_brief",
        }
    }
}

#[allow(
    clippy::large_enum_variant,
    reason = "an answer is built once, written out and dropped; boxing each would only add steps"
)]
#[derive(Serialize)]
#[serde(untagged)]
pub enum SelectionAnswer<'a> {
    Overview(graph_summary::OverviewAnswer<'a>),
    Schema(graph_summary::SchemaAnswer<'a>),
    Facets(graph_summary::FacetsAnswer<'a>),
    Components(clusters::ComponentsAnswer<'a>),
    Communities(clusters::CommunitiesAnswer<'a>),
    SimilarNodes(similar_nodes::SimilarNodesAnswer<'a>),
    MatchNodes(match_nodes::MatchNodesAnswer<'a>),
    RecommendRelations(relation_recommendations::RecommendRelationsAnswer<'a>),
    NodeProfile(node_profile::NodeProfileAnswer<'a>),
    GrowthPlan(growth_plan::GrowthPlanAnswer<'a>),
    MaintenancePlan(maintenance_plan::MaintenancePlanAnswer<'a>),
    Health(health::HealthAnswer<'a>),
    WorkspaceBrief(workspace_brief::WorkspaceBriefAnswer<'a>),
}

pub fn run<'a>(
    graph: &'a CompiledGraph,
    operation: SelectionOperation,
    request: &QueryRequest,
) -> Result<SelectionAnswer<'a>, QueryError> {
    Ok(match operation {
        SelectionOperation::Overview => {
            SelectionAnswer::Overview(graph_summary::overview(graph, request)?)
        }
        SelectionOperation::Schema => {
            SelectionAnswer::Schema(graph_summary::schema(graph, request)?)
        }
        SelectionOperation::Facets => {
            SelectionAnswer::Facets(graph_summary::facets(graph, request)?)
        }
        SelectionOperation::Components => {
            SelectionAnswer::Components(clusters::components(graph, request)?)
        }
        SelectionOperation::Communities => {
            SelectionAnswer::Communities(clusters::communities(graph, request)?)
        }
        SelectionOperation::SimilarNodes => {
            SelectionAnswer::SimilarNodes(similar_nodes::similar_nodes(graph, request)?)
        }
        SelectionOperation::MatchNodes => {
            SelectionAnswer::MatchNodes(match_nodes::match_nodes(graph, request)?)
        }
        SelectionOperation::RecommendRelations => SelectionAnswer::RecommendRelations(
            relation_recommendations::recommend_relations(graph, request)?,
        ),
        SelectionOperation::NodeProfile => {
            SelectionAnswer::NodeProfile(node_profile::node_profile(graph, request)?)
        }
        SelectionOperation::GrowthPlan => {
            SelectionAnswer::GrowthPlan(growth_plan::growth_plan(graph, request)?)
        }
        SelectionOperation::MaintenancePlan => {
            SelectionAnswer::MaintenancePlan(maintenance_plan::maintenance_plan(graph, request)?)
        }
        SelectionOperation::Health => SelectionAnswer::Health(
            health::health(graph, &health::HealthQuestion::from_request(request))?.with_outside(
                outside_checks::OutsideChecks::of(&request.selection.outside),
            ),
        ),
        SelectionOperation::WorkspaceBrief => {
            SelectionAnswer::WorkspaceBrief(workspace_brief::workspace_brief(graph, request)?)
        }
    })
}
