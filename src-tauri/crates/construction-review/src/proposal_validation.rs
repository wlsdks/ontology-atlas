//! The answer to "was a proposal sent, and may it be written": what the analysis reports under
//! `proposalValidation`.

use serde::Serialize;

use crate::construction_lifecycle::ConstructionLifecycle;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub concepts: usize,
    pub relations: usize,
    pub findings: usize,
    pub errors: usize,
    pub warnings: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Gates {
    pub project_defined: bool,
    pub concepts_defined: bool,
    pub citations_resolved: bool,
    pub risky_evidence_controlled: bool,
    pub capability_domains_resolved: bool,
    pub element_domains_resolved: bool,
    pub element_paths_resolved: bool,
    pub relations_resolved: bool,
    pub confidence_valid: bool,
    pub competency_questions_answered: bool,
    pub competency_witnesses_resolved: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalValidation {
    pub status: &'static str,
    pub can_write: bool,
    pub summary: Summary,
    pub gates: Gates,
    pub findings: Vec<()>,
    pub next_step: &'static str,
    pub construction_lifecycle: ConstructionLifecycle,
}

impl ProposalValidation {
    /// The validation of an analysis that was asked for without a proposal.
    pub fn not_provided() -> Self {
        let lifecycle = ConstructionLifecycle::without_proposal();
        Self {
            status: "not-provided",
            can_write: lifecycle.write_eligibility == "executable",
            summary: Summary {
                concepts: 0,
                relations: 0,
                findings: 0,
                errors: 0,
                warnings: 0,
            },
            gates: Gates {
                project_defined: false,
                concepts_defined: false,
                citations_resolved: false,
                risky_evidence_controlled: false,
                capability_domains_resolved: false,
                element_domains_resolved: false,
                element_paths_resolved: false,
                relations_resolved: false,
                confidence_valid: false,
                competency_questions_answered: false,
                competency_witnesses_resolved: false,
            },
            findings: Vec::new(),
            next_step: lifecycle.next_action,
            construction_lifecycle: lifecycle,
        }
    }
}
