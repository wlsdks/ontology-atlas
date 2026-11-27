//! `growth_plan`: what the vault should add, repair or read next, grouped so an agent works
//! through one kind of gap at a time. It only lists candidates; each write waits for a person.

use serde::Serialize;

use super::growth_candidates::{
    dangling_references, empty_domains, external_elements, unassigned_nodes, DanglingReferenceRow,
    ExternalElements, NodeCandidate,
};
use super::relation_recommendations::{recommend, RecommendRelationsAnswer};
use super::selection_request::UncertaintyRead;
use crate::compiled_graph::CompiledGraph;
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;
use crate::query::walks::row_page::RowPage;

const DEFAULT_LIMIT: usize = 25;

/// The reads the vault's own uncertainty sections ask for. `no_bodies` says the vault holds no
/// document, so an empty list is never taken for "nothing to read". The reads themselves come from
/// outside the graph (`OutsideFacts::next_reads`): finding them means reading the prose of each
/// uncertainty section, which belongs to the meaning slice, and ordering them means looking at the
/// source files, which belongs to the source scan.
#[derive(Serialize)]
pub struct NextReads {
    total: usize,
    limited: bool,
    rows: Vec<UncertaintyRead>,
    reason: Option<&'static str>,
}

impl NextReads {
    fn of(vault_has_documents: bool, reads: Option<&[UncertaintyRead]>, limit: usize) -> Self {
        if !vault_has_documents {
            return Self {
                total: 0,
                limited: false,
                rows: Vec::new(),
                reason: Some("no_bodies"),
            };
        }
        let all = reads.unwrap_or_default();
        Self {
            total: all.len(),
            limited: all.len() > limit,
            rows: all.iter().take(limit).cloned().collect(),
            reason: None,
        }
    }
}

#[derive(Serialize, Clone)]
pub struct GrowthSummary {
    #[serde(rename = "relationRecommendations")]
    relation_recommendations: usize,
    #[serde(rename = "externalElementRefs")]
    external_element_refs: usize,
    #[serde(rename = "externalElementRefsIgnored")]
    external_element_refs_ignored: usize,
    #[serde(rename = "danglingReferences")]
    dangling_references: usize,
    #[serde(rename = "unassignedNodes")]
    unassigned_nodes: usize,
    #[serde(rename = "emptyDomains")]
    empty_domains: usize,
    #[serde(rename = "nextReads")]
    next_reads: usize,
    /// The writes waiting. A next read is not a write, so it is not counted here.
    #[serde(rename = "totalActions")]
    total_actions: usize,
}

impl GrowthSummary {
    pub fn recommendations(&self) -> usize {
        self.relation_recommendations
    }

    pub fn dangling(&self) -> usize {
        self.dangling_references
    }

    pub fn external(&self) -> usize {
        self.external_element_refs
    }

    pub fn total_actions(&self) -> usize {
        self.total_actions
    }
}

#[derive(Serialize)]
pub struct GrowthPlanAnswer<'a> {
    operation: &'static str,
    pub(super) summary: GrowthSummary,
    #[serde(rename = "relationRecommendations")]
    pub(super) relation_recommendations: RecommendRelationsAnswer<'a>,
    #[serde(rename = "externalElementRefs")]
    pub(super) external_element_refs: ExternalElements<'a>,
    #[serde(rename = "danglingReferences")]
    pub(super) dangling_references: RowPage<DanglingReferenceRow<'a>>,
    #[serde(rename = "unassignedNodes")]
    unassigned_nodes: RowPage<NodeCandidate<'a>>,
    #[serde(rename = "emptyDomains")]
    empty_domains: RowPage<NodeCandidate<'a>>,
    #[serde(rename = "nextReads")]
    next_reads: NextReads,
}

pub fn growth_plan<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<GrowthPlanAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(DEFAULT_LIMIT);
    growth_plan_with_limit(graph, request, limit)
}

/// The plan with `limit` rows per group, which `workspace_brief` asks for with its own limit.
pub fn growth_plan_with_limit<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
    limit: usize,
) -> Result<GrowthPlanAnswer<'a>, QueryError> {
    let outside = &request.selection.outside;
    let recommendations = RecommendRelationsAnswer::of(recommend(graph, None, limit), limit);
    let external = external_elements(graph, &outside.ignore_patterns, limit);
    let dangling = dangling_references(graph, limit);
    let unassigned = unassigned_nodes(graph, limit);
    let empty = empty_domains(graph, limit);
    let next_reads = NextReads::of(
        !graph.nodes().is_empty(),
        outside.next_reads.as_deref(),
        limit,
    );
    let summary = GrowthSummary {
        relation_recommendations: recommendations.total(),
        external_element_refs: external.total(),
        external_element_refs_ignored: external.ignored(),
        dangling_references: dangling.total(),
        unassigned_nodes: unassigned.total(),
        empty_domains: empty.total(),
        next_reads: next_reads.total,
        total_actions: recommendations.total() + external.total() + dangling.total(),
    };
    Ok(GrowthPlanAnswer {
        operation: "growth_plan",
        summary,
        relation_recommendations: recommendations,
        external_element_refs: external,
        dangling_references: dangling,
        unassigned_nodes: unassigned,
        empty_domains: empty,
        next_reads,
    })
}
