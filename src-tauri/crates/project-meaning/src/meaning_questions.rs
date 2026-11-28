//! The five questions a project's ontology must answer, in the order they are written, and the
//! names of the contracts the answers and their receipts carry.

pub const COMPETENCY_CONTRACT: &str = "meaningCompetency:v1";
pub const COMPETENCY_EVALUATOR: &str = "meaningProposalValidator:v1";
pub const WITNESS_INVENTORY_CONTRACT: &str = "meaningWitnessInventory:v1";
pub const ASSESSMENT_CONTRACT: &str = "meaningAssessment:v1";
pub const RECEIPT_VERSION: u8 = 1;

/// The kinds of witness an answer may cite, in the order a row lists them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum WitnessKind {
    Concepts,
    Relations,
    Evidence,
    Paths,
}

impl WitnessKind {
    /// The label of the row that lists them.
    pub const fn label(self) -> &'static str {
        match self {
            Self::Concepts => "Concepts",
            Self::Relations => "Relations",
            Self::Evidence => "Evidence",
            Self::Paths => "Paths",
        }
    }
}

pub struct Question {
    pub id: &'static str,
    pub text: &'static str,
    pub required: &'static [WitnessKind],
}

pub const QUESTIONS: [Question; 5] = [
    Question {
        id: "scope",
        text: "What product/system outcome and user problem define the ontology scope?",
        required: &[WitnessKind::Concepts, WitnessKind::Evidence],
    },
    Question {
        id: "domains",
        text: "Which stable business responsibilities or decision boundaries form its domains?",
        required: &[WitnessKind::Concepts, WitnessKind::Relations, WitnessKind::Evidence],
    },
    Question {
        id: "abilities",
        text: "Which observable abilities realize those outcomes inside each domain?",
        required: &[WitnessKind::Concepts, WitnessKind::Relations, WitnessKind::Evidence],
    },
    Question {
        id: "evidence",
        text: "Which source artifacts provide implementation evidence for each ability?",
        required: &[WitnessKind::Concepts, WitnessKind::Evidence, WitnessKind::Paths],
    },
    Question {
        id: "impact",
        text: "Which typed dependencies explain change impact across the model?",
        required: &[WitnessKind::Concepts, WitnessKind::Relations, WitnessKind::Evidence],
    },
];

pub fn question_ids() -> Vec<&'static str> {
    QUESTIONS.iter().map(|question| question.id).collect()
}
