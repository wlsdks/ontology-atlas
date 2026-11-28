//! The construction lifecycle: eight phases a plan passes before a write is executable, the
//! admission contract a person reads, and what comes next.

use serde::Serialize;

pub const CONSTRUCTION_LIFECYCLE_CONTRACT: &str = "ontologyConstructionLifecycle:v1";
pub const CONSTRUCTION_ADMISSION_CONTRACT: &str = "ontologyConstructionAdmission:v1";

const PHASES: [&str; 8] = [
    "purpose_authority",
    "approved_cqs",
    "evidence_reuse",
    "small_conceptual_slice",
    "semantic_structural_tests",
    "independent_source_hidden",
    "human_plan_approval",
    "prior_cq_regression",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhaseRow {
    pub id: &'static str,
    pub status: &'static str,
    pub diagnostic_codes: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalCoverage {
    pub status: &'static str,
    pub expected_count: usize,
    pub covered_count: usize,
    pub missing_refs: Vec<String>,
    pub unexpected_refs: Vec<String>,
    pub source_hidden_missing_refs: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Admission {
    pub contract: &'static str,
    pub mode: &'static str,
    pub tier: &'static str,
    pub auto_write_candidate: bool,
    pub human_acceptance_required: bool,
    pub review_items: Vec<String>,
    pub diagnostic_codes: Vec<String>,
}

/// Where a plan stands: the phases, what blocks the write and what to do next.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstructionLifecycle {
    pub contract: &'static str,
    pub qualification_status: &'static str,
    pub write_eligibility: &'static str,
    pub plan_digest: Option<String>,
    pub source_digest: Option<String>,
    pub plan_revision: usize,
    pub first_blocking_phase: &'static str,
    pub phases: Vec<PhaseRow>,
    pub diagnostics: Vec<()>,
    pub required_gap_ids: Vec<String>,
    pub proposal_coverage: ProposalCoverage,
    pub admission: Admission,
    pub next_action: &'static str,
}

impl ConstructionLifecycle {
    /// The lifecycle of an analysis nobody has sent a proposal for: no plan exists, so every
    /// phase waits and the next step is to submit one.
    pub fn without_proposal() -> Self {
        Self {
            contract: CONSTRUCTION_LIFECYCLE_CONTRACT,
            qualification_status: "not_qualified",
            write_eligibility: "blocked",
            plan_digest: None,
            source_digest: None,
            plan_revision: 1,
            first_blocking_phase: "purpose_authority",
            phases: PHASES
                .iter()
                .map(|id| PhaseRow {
                    id,
                    status: if *id == "human_plan_approval" {
                        "awaiting_approval"
                    } else {
                        "blocked"
                    },
                    diagnostic_codes: Vec::new(),
                })
                .collect(),
            diagnostics: Vec::new(),
            required_gap_ids: Vec::new(),
            proposal_coverage: ProposalCoverage {
                status: "not_measured",
                expected_count: 0,
                covered_count: 0,
                missing_refs: Vec::new(),
                unexpected_refs: Vec::new(),
                source_hidden_missing_refs: Vec::new(),
            },
            admission: Admission {
                contract: CONSTRUCTION_ADMISSION_CONTRACT,
                mode: "shadow",
                tier: "human_review_required",
                auto_write_candidate: false,
                human_acceptance_required: true,
                review_items: vec!["missing-review-plan".to_string()],
                diagnostic_codes: Vec::new(),
            },
            next_action: "Submit a complete evidence-backed proposal to produce a non-writing review plan.",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn with_no_proposal_every_phase_waits_and_only_the_person_can_approve() {
        let lifecycle = ConstructionLifecycle::without_proposal();
        assert_eq!(lifecycle.phases.len(), 8);
        assert_eq!(lifecycle.write_eligibility, "blocked");
        assert_eq!(
            lifecycle
                .phases
                .iter()
                .filter(|phase| phase.status == "awaiting_approval")
                .count(),
            1
        );
    }
}
