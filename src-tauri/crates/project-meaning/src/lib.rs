//! What a project's five competency answers claim and whether its measured source and ontology back
//! them. See `README.md`.

mod competency_answers;
mod competency_markdown;
mod meaning_assessment;
mod meaning_inventory;
mod meaning_questions;
mod meaning_receipt;
mod stored_name_shapes;

pub use competency_answers::{
    render_competency_answers, with_competency_section, RenderedAnswers,
    COMPETENCY_ROW_WITNESSES_MAX,
};
pub use competency_markdown::{
    parse_competency_markdown, render_competency_markdown, AnswerRow, AnswerStatus, MarkdownFault,
    RelationWitness, Witnesses,
};
pub use meaning_assessment::{
    derive_meaning_assessment, unresolved_competency_rows, Assessment, AssessmentInput,
    CompetencyBlock, QuestionRow, SourceFacts, UnresolvedRow,
};
pub use meaning_inventory::{
    build_meaning_inventory, Inventory, InventoryInput, InventoryRelation, InventoryUnavailable,
};
pub use meaning_questions::{
    question_ids, Question, WitnessKind, ASSESSMENT_CONTRACT, COMPETENCY_CONTRACT,
    COMPETENCY_EVALUATOR, QUESTIONS, RECEIPT_VERSION, WITNESS_INVENTORY_CONTRACT,
};
pub use meaning_receipt::{
    body_digest, finalize_meaning_receipt, read_meaning_assessment, AssessedProject,
    MeaningReceipt, ReceiptSubject, ReceiptWriteFailure, MEANING_STATE_RELATIVE_PATH,
};
pub use stored_name_shapes::{safe_graph_hash, safe_vault_slug, SLUG_MAX_UNITS};
