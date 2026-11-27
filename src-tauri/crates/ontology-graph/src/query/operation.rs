//! The operations of `query_ontology`, in the order its schema lists them. Each family of
//! operations is an enum of its own, owned by the module that answers it; the operations nobody
//! answers yet are `PendingOperation`, which a slice empties as it ports them.

use crate::query::selection::SelectionOperation;
use crate::query::walks::WalkOperation;

/// Operations that no module answers yet.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PendingOperation {
    QueryPlan,
    SimilarNodes,
    ExplainRelation,
    Reachability,
    PatternWalk,
    Impact,
    BlastRadius,
    Subgraph,
    BuilderContext,
    MatchNodes,
    MatchEdges,
    NodeProfile,
    DomainProfile,
    DomainMatrix,
    ProjectScope,
    ProjectMap,
    RelationCheck,
    Lineage,
    ContainmentTree,
    RecommendRelations,
    GrowthPlan,
    MaintenancePlan,
    AgentBrief,
    MeaningRepairReview,
    AnalysisHistory,
    AnalysisRecord,
    WorkspaceBrief,
    Health,
}

impl PendingOperation {
    pub const fn name(self) -> &'static str {
        match self {
            Self::QueryPlan => "query_plan",
            Self::SimilarNodes => "similar_nodes",
            Self::ExplainRelation => "explain_relation",
            Self::Reachability => "reachability",
            Self::PatternWalk => "pattern_walk",
            Self::Impact => "impact",
            Self::BlastRadius => "blast_radius",
            Self::Subgraph => "subgraph",
            Self::BuilderContext => "builder_context",
            Self::MatchNodes => "match_nodes",
            Self::MatchEdges => "match_edges",
            Self::NodeProfile => "node_profile",
            Self::DomainProfile => "domain_profile",
            Self::DomainMatrix => "domain_matrix",
            Self::ProjectScope => "project_scope",
            Self::ProjectMap => "project_map",
            Self::RelationCheck => "relation_check",
            Self::Lineage => "lineage",
            Self::ContainmentTree => "containment_tree",
            Self::RecommendRelations => "recommend_relations",
            Self::GrowthPlan => "growth_plan",
            Self::MaintenancePlan => "maintenance_plan",
            Self::AgentBrief => "agent_brief",
            Self::MeaningRepairReview => "meaning_repair_review",
            Self::AnalysisHistory => "analysis_history",
            Self::AnalysisRecord => "analysis_record",
            Self::WorkspaceBrief => "workspace_brief",
            Self::Health => "health",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Operation {
    Walk(WalkOperation),
    Selection(SelectionOperation),
    Pending(PendingOperation),
}

impl Operation {
    /// Every operation, in the order the tool's schema lists them and an error offers them.
    pub const ALL: [Self; 39] = [
        Self::Walk(WalkOperation::Neighbors),
        Self::Walk(WalkOperation::Path),
        Self::Walk(WalkOperation::AllPaths),
        Self::Pending(PendingOperation::QueryPlan),
        Self::Selection(SelectionOperation::Centrality),
        Self::Selection(SelectionOperation::Communities),
        Self::Pending(PendingOperation::SimilarNodes),
        Self::Pending(PendingOperation::ExplainRelation),
        Self::Pending(PendingOperation::Reachability),
        Self::Pending(PendingOperation::PatternWalk),
        Self::Pending(PendingOperation::Impact),
        Self::Pending(PendingOperation::BlastRadius),
        Self::Pending(PendingOperation::Subgraph),
        Self::Pending(PendingOperation::BuilderContext),
        Self::Selection(SelectionOperation::Overview),
        Self::Selection(SelectionOperation::Schema),
        Self::Selection(SelectionOperation::Facets),
        Self::Pending(PendingOperation::MatchNodes),
        Self::Pending(PendingOperation::MatchEdges),
        Self::Pending(PendingOperation::NodeProfile),
        Self::Pending(PendingOperation::DomainProfile),
        Self::Pending(PendingOperation::DomainMatrix),
        Self::Pending(PendingOperation::ProjectScope),
        Self::Pending(PendingOperation::ProjectMap),
        Self::Pending(PendingOperation::RelationCheck),
        Self::Selection(SelectionOperation::Components),
        Self::Pending(PendingOperation::Lineage),
        Self::Pending(PendingOperation::ContainmentTree),
        Self::Walk(WalkOperation::Cycles),
        Self::Walk(WalkOperation::TopologicalOrder),
        Self::Pending(PendingOperation::RecommendRelations),
        Self::Pending(PendingOperation::GrowthPlan),
        Self::Pending(PendingOperation::MaintenancePlan),
        Self::Pending(PendingOperation::AgentBrief),
        Self::Pending(PendingOperation::MeaningRepairReview),
        Self::Pending(PendingOperation::AnalysisHistory),
        Self::Pending(PendingOperation::AnalysisRecord),
        Self::Pending(PendingOperation::WorkspaceBrief),
        Self::Pending(PendingOperation::Health),
    ];

    pub const fn name(self) -> &'static str {
        match self {
            Self::Walk(operation) => operation.name(),
            Self::Selection(operation) => operation.name(),
            Self::Pending(operation) => operation.name(),
        }
    }

    pub fn parse(name: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|operation| operation.name() == name)
    }

    /// The names of every operation, for the refusal of one that is none.
    pub fn names() -> Vec<&'static str> {
        Self::ALL.into_iter().map(Self::name).collect()
    }

    /// Whether `query_plan` can plan it: all but itself and the three that read other files.
    pub fn can_be_planned(self) -> bool {
        !matches!(
            self,
            Self::Pending(
                PendingOperation::QueryPlan
                    | PendingOperation::MeaningRepairReview
                    | PendingOperation::AnalysisHistory
                    | PendingOperation::AnalysisRecord
            )
        )
    }

    /// The names of the operations `query_plan` can plan.
    pub fn plan_target_names() -> Vec<&'static str> {
        Self::ALL
            .into_iter()
            .filter(|operation| operation.can_be_planned())
            .map(Self::name)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_operation_has_one_name_and_is_found_by_it() {
        let names = Operation::names();
        for operation in Operation::ALL {
            assert_eq!(Operation::parse(operation.name()), Some(operation));
        }
        let mut unique = names.clone();
        unique.sort_unstable();
        unique.dedup();
        assert_eq!(unique.len(), names.len());
        assert_eq!(Operation::plan_target_names().len(), 35);
    }
}
