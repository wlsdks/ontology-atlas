//! The operations of `query_ontology`, in the order its schema lists them. Each family of
//! operations is an enum of its own, owned by the module that answers it; the operations nobody
//! answers yet are `PendingOperation`, which a slice empties as it ports them.

use crate::query::analysis_operation::AnalysisOperation;
use crate::query::selection::SelectionOperation;
use crate::query::walks::WalkOperation;

/// Operations that no module answers yet.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PendingOperation {
    AgentBrief,
    MeaningRepairReview,
}

impl PendingOperation {
    pub const fn name(self) -> &'static str {
        match self {
            Self::AgentBrief => "agent_brief",
            Self::MeaningRepairReview => "meaning_repair_review",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Operation {
    Walk(WalkOperation),
    Selection(SelectionOperation),
    /// Describes what another operation would cost, and runs none.
    QueryPlan,
    /// Reads the vault's analysis records, not the graph.
    Analysis(AnalysisOperation),
    Pending(PendingOperation),
}

impl Operation {
    /// Every operation, in the order the tool's schema lists them and an error offers them.
    pub const ALL: [Self; 39] = [
        Self::Walk(WalkOperation::Neighbors),
        Self::Walk(WalkOperation::Path),
        Self::Walk(WalkOperation::AllPaths),
        Self::QueryPlan,
        Self::Selection(SelectionOperation::Centrality),
        Self::Selection(SelectionOperation::Communities),
        Self::Selection(SelectionOperation::SimilarNodes),
        Self::Walk(WalkOperation::ExplainRelation),
        Self::Walk(WalkOperation::Reachability),
        Self::Walk(WalkOperation::PatternWalk),
        Self::Walk(WalkOperation::Impact),
        Self::Walk(WalkOperation::BlastRadius),
        Self::Walk(WalkOperation::Subgraph),
        Self::Walk(WalkOperation::BuilderContext),
        Self::Selection(SelectionOperation::Overview),
        Self::Selection(SelectionOperation::Schema),
        Self::Selection(SelectionOperation::Facets),
        Self::Selection(SelectionOperation::MatchNodes),
        Self::Selection(SelectionOperation::MatchEdges),
        Self::Selection(SelectionOperation::NodeProfile),
        Self::Selection(SelectionOperation::DomainProfile),
        Self::Selection(SelectionOperation::DomainMatrix),
        Self::Walk(WalkOperation::ProjectScope),
        Self::Walk(WalkOperation::ProjectMap),
        Self::Walk(WalkOperation::RelationCheck),
        Self::Selection(SelectionOperation::Components),
        Self::Walk(WalkOperation::Lineage),
        Self::Walk(WalkOperation::ContainmentTree),
        Self::Walk(WalkOperation::Cycles),
        Self::Walk(WalkOperation::TopologicalOrder),
        Self::Selection(SelectionOperation::RecommendRelations),
        Self::Selection(SelectionOperation::GrowthPlan),
        Self::Selection(SelectionOperation::MaintenancePlan),
        Self::Pending(PendingOperation::AgentBrief),
        Self::Pending(PendingOperation::MeaningRepairReview),
        Self::Analysis(AnalysisOperation::History),
        Self::Analysis(AnalysisOperation::Record),
        Self::Selection(SelectionOperation::WorkspaceBrief),
        Self::Selection(SelectionOperation::Health),
    ];

    pub const fn name(self) -> &'static str {
        match self {
            Self::Walk(operation) => operation.name(),
            Self::Selection(operation) => operation.name(),
            Self::QueryPlan => "query_plan",
            Self::Analysis(operation) => operation.name(),
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
            Self::QueryPlan
                | Self::Analysis(_)
                | Self::Pending(PendingOperation::MeaningRepairReview)
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
