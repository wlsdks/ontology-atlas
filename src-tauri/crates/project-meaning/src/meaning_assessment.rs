//! The assessment of a project's meaning, deliberately without a score: structural readiness,
//! competency evidence and source currentness stay separate, so one healthy dimension cannot hide
//! another's gap. It reads versioned receipts only; unknown fields of its input are never copied,
//! so a private source coordinate cannot leak through the answer.

use std::collections::{HashMap, HashSet};

use project_source::{
    is_gap_id, is_persistable_evidence_reference, is_persistable_path_witness,
    parse_source_range_citation,
};
use serde::Serialize;

use crate::competency_markdown::{AnswerRow, AnswerStatus, RelationWitness};
use crate::meaning_inventory::{relation_key, Inventory, InventoryRelation};
use crate::meaning_questions::{
    COMPETENCY_CONTRACT, COMPETENCY_EVALUATOR, QUESTIONS, ASSESSMENT_CONTRACT,
    WITNESS_INVENTORY_CONTRACT,
};
use crate::stored_name_shapes::{
    inventory_entry_is_safe, safe_graph_hash, safe_measured_at, safe_opaque, safe_vault_slug,
    PROJECT_SLUG_MAX_UNITS, SLUG_MAX_UNITS,
};

const SOURCE_STATUSES: [&str; 5] = [
    "not_measured",
    "needs_evidence",
    "review_required",
    "invalid",
    "verified_current",
];
const SOURCE_CURRENTNESS: [&str; 3] = ["current", "stale", "unavailable"];
/// Containment written as `contains` or as its typed key is one edge, so a witness row may cite
/// either spelling.
const CONTAINMENT_TYPES: [&str; 4] = ["contains", "domains", "capabilities", "elements"];

/// The structural status as the brief words it, and the three words the assessment keeps.
fn normalized_structure_status(raw: Option<&str>) -> &'static str {
    match raw {
        Some("ready") => "ready",
        Some("needs_structure" | "needs_attention" | "needs_shape" | "needs-links" | "needs-shape") => {
            "needs_structure"
        }
        _ => "invalid",
    }
}

fn structure_status_is_known(raw: Option<&str>) -> bool {
    matches!(
        raw,
        Some(
            "ready"
                | "needs_structure"
                | "needs_attention"
                | "needs_shape"
                | "needs-links"
                | "needs-shape"
                | "invalid"
        )
    )
}

/// What the stored source receipt says, as far as the assessment reads it.
#[derive(Debug, Clone, Default)]
pub struct SourceFacts {
    pub status: Option<String>,
    pub currentness: Option<String>,
    pub top_gap_id: Option<String>,
    pub receipt_contract_version: Option<u8>,
    pub graph_hash: Option<String>,
    pub source_id: Option<String>,
    pub source_revision: Option<String>,
    pub source_fingerprint: Option<String>,
    pub measured_at: Option<String>,
}

/// One row of the competency answers as the assessment judges it.
#[derive(Debug, Clone)]
pub struct QuestionRow {
    pub id: String,
    pub status: AnswerStatus,
    pub concepts: Vec<String>,
    pub relations: Vec<RelationWitness>,
    pub evidence: Vec<String>,
    pub paths: Vec<String>,
    pub unresolved: Vec<String>,
}

impl QuestionRow {
    pub fn of(row: &AnswerRow) -> Self {
        Self {
            id: row.id.to_string(),
            status: row.status,
            concepts: row.witnesses.concepts.clone(),
            relations: row.witnesses.relations.clone(),
            evidence: row.witnesses.evidence.clone(),
            paths: row.witnesses.paths.clone(),
            unresolved: if row.gap.is_some() {
                vec!["declared_gap".to_string()]
            } else {
                Vec::new()
            },
        }
    }
}

/// The competency block of an assessment input.
#[derive(Debug, Clone)]
pub struct CompetencyBlock {
    pub contract: String,
    pub receipt_version: u32,
    pub evaluator: String,
    pub graph_hash: Option<String>,
    pub inventory: Option<Inventory>,
    pub questions: Vec<QuestionRow>,
    /// `Some(false)` when the body is not the one the receipt was written for.
    pub body_matches_receipt: Option<bool>,
}

pub struct AssessmentInput<'a> {
    pub project_slug: &'a str,
    pub graph_hash: Option<&'a str>,
    /// The structural status the brief gives, as the brief words it.
    pub structure_status: Option<&'a str>,
    pub source: &'a SourceFacts,
    /// `None` when the project never ran `finalize_project_meaning`.
    pub competency: Option<&'a CompetencyBlock>,
}

struct Normalized<'a> {
    graph_hash: Option<&'a str>,
    source_fingerprint: Option<&'a str>,
    concepts: HashSet<&'a str>,
    relations: HashSet<String>,
    containment: HashSet<(&'a str, &'a str)>,
    evidence: HashSet<&'a str>,
    paths: HashSet<&'a str>,
    valid: bool,
}

fn normalize_inventory(inventory: Option<&Inventory>) -> Normalized<'_> {
    let empty = Normalized {
        graph_hash: None,
        source_fingerprint: None,
        concepts: HashSet::new(),
        relations: HashSet::new(),
        containment: HashSet::new(),
        evidence: HashSet::new(),
        paths: HashSet::new(),
        valid: false,
    };
    let Some(inventory) = inventory else {
        return empty;
    };
    let distinct = |values: &[String]| values.iter().collect::<HashSet<_>>().len() == values.len();
    let relation_keys: HashSet<String> = inventory.relations.iter().map(relation_key).collect();
    let relation_is_safe = |relation: &InventoryRelation| {
        safe_vault_slug(&relation.from, SLUG_MAX_UNITS)
            && safe_vault_slug(&relation.to, SLUG_MAX_UNITS)
            && safe_opaque(&relation.kind)
    };
    let valid = inventory.contract == WITNESS_INVENTORY_CONTRACT
        && safe_graph_hash(&inventory.graph_hash)
        && safe_opaque(&inventory.source_fingerprint)
        && inventory.concepts.iter().all(|slug| safe_vault_slug(slug, SLUG_MAX_UNITS))
        && distinct(&inventory.concepts)
        && inventory.relations.iter().all(relation_is_safe)
        && relation_keys.len() == inventory.relations.len()
        && inventory.evidence.iter().all(|value| inventory_entry_is_safe(value))
        && distinct(&inventory.evidence)
        && inventory.paths.iter().all(|value| inventory_entry_is_safe(value))
        && distinct(&inventory.paths)
        && inventory
            .kinds
            .iter()
            .all(|(slug, kind)| safe_vault_slug(slug, SLUG_MAX_UNITS) && safe_opaque(kind));
    if !valid {
        return empty;
    }
    Normalized {
        graph_hash: Some(&inventory.graph_hash),
        source_fingerprint: Some(&inventory.source_fingerprint),
        concepts: inventory.concepts.iter().map(String::as_str).collect(),
        relations: relation_keys,
        containment: inventory
            .relations
            .iter()
            .filter(|relation| CONTAINMENT_TYPES.contains(&relation.kind.as_str()))
            .map(|relation| (relation.from.as_str(), relation.to.as_str()))
            .collect(),
        evidence: inventory.evidence.iter().map(String::as_str).collect(),
        paths: inventory.paths.iter().map(String::as_str).collect(),
        valid: true,
    }
}

fn witness_row_text(kind: crate::meaning_questions::WitnessKind) -> &'static str {
    kind.label()
}

/// Every reason one row's witnesses fail, each naming the witness and the form that would resolve,
/// so a refusal can be repaired in one patch instead of by guessing.
fn witness_problems(
    question: &crate::meaning_questions::Question,
    row: &QuestionRow,
    inventory: &Normalized<'_>,
) -> Vec<String> {
    use crate::meaning_questions::WitnessKind;
    let mut out: Vec<String> = Vec::new();
    for kind in question.required {
        let empty = match kind {
            WitnessKind::Concepts => row.concepts.is_empty(),
            WitnessKind::Relations => row.relations.is_empty(),
            WitnessKind::Evidence => row.evidence.is_empty(),
            WitnessKind::Paths => row.paths.is_empty(),
        };
        if empty {
            let needs: Vec<&str> = question.required.iter().map(|name| witness_row_text(*name)).collect();
            out.push(format!(
                "no `- {}:` row; this question needs {}",
                witness_row_text(*kind),
                needs.join(", ")
            ));
        }
    }
    if question.id == "impact" && !row.relations.iter().any(|relation| relation.kind == "depends_on") {
        out.push(
            "no `--depends_on-->` relation; an answered impact row cites at least one declared dependency"
                .to_string(),
        );
    }
    for slug in &row.concepts {
        if !inventory.concepts.contains(slug.as_str()) {
            out.push(format!("concept `{slug}` is not in this project's containment graph"));
        }
    }
    for relation in &row.relations {
        let key = format!("{}\0{}\0{}", relation.from, relation.to, relation.kind);
        let contained = CONTAINMENT_TYPES.contains(&relation.kind.as_str())
            && inventory
                .containment
                .contains(&(relation.from.as_str(), relation.to.as_str()));
        if !inventory.relations.contains(&key) && !contained {
            out.push(format!(
                "relation `{}` --{}--> `{}` is not declared in frontmatter",
                relation.from, relation.kind, relation.to
            ));
        }
    }
    for reference in &row.evidence {
        if inventory.evidence.contains(reference.as_str()) {
            continue;
        }
        out.push(match parse_source_range_citation(reference) {
            Some(citation) if inventory.evidence.contains(citation.path.as_str()) => format!(
                "evidence `{reference}` no longer matches `{}`; read it again with analyze_repo_structure sourceReads and cite the new sha256, or cite the plain path",
                citation.path
            ),
            Some(citation) => format!(
                "evidence `{reference}`: `{}` is not a measured source witness",
                citation.path
            ),
            None => format!("evidence `{reference}` is not a measured source witness"),
        });
    }
    for path in &row.paths {
        if !inventory.paths.contains(path.as_str()) {
            out.push(format!("path `{path}` is not a measured source witness"));
        }
    }
    if !row.unresolved.is_empty() {
        let named: Vec<String> = row.unresolved.iter().map(|value| format!("`{value}`")).collect();
        out.push(format!("unresolved witnesses {}", named.join(", ")));
    }
    out
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct QuestionState {
    pub id: String,
    pub status: &'static str,
    #[serde(rename = "witnessStatus")]
    pub witness_status: &'static str,
}

struct NormalizedQuestions<'a> {
    malformed: bool,
    absent: bool,
    inventory: Normalized<'a>,
    problems: HashMap<String, Vec<String>>,
    questions: Vec<QuestionState>,
}

fn row_shape_is_valid(row: &QuestionRow) -> bool {
    let relation_ok = |relation: &RelationWitness| {
        safe_vault_slug(&relation.from, SLUG_MAX_UNITS)
            && safe_vault_slug(&relation.to, SLUG_MAX_UNITS)
            && safe_opaque(&relation.kind)
    };
    row.concepts.iter().all(|slug| safe_vault_slug(slug, SLUG_MAX_UNITS))
        && row.relations.iter().all(relation_ok)
        && row.evidence.iter().all(|value| is_persistable_evidence_reference(value))
        && row.paths.iter().all(|value| is_persistable_path_witness(value))
        && row.unresolved.iter().all(|value| safe_opaque(value))
}

fn status_word(status: AnswerStatus) -> &'static str {
    status.word()
}

fn normalize_questions(competency: Option<&CompetencyBlock>) -> NormalizedQuestions<'_> {
    let absent = competency.is_none();
    let inventory = normalize_inventory(competency.and_then(|block| block.inventory.as_ref()));
    let mut malformed = competency.is_none_or(|block| {
        block.contract != COMPETENCY_CONTRACT
            || block.receipt_version != 1
            || block.evaluator != COMPETENCY_EVALUATOR
            || !block.graph_hash.as_deref().is_some_and(safe_graph_hash)
    }) || !inventory.valid;
    let mut by_id: HashMap<&str, QuestionState> = HashMap::new();
    let mut problems: HashMap<String, Vec<String>> = HashMap::new();
    for row in competency.map_or(&[][..], |block| block.questions.as_slice()) {
        let contract = QUESTIONS.iter().find(|question| question.id == row.id);
        let Some(contract) = contract.filter(|_| !by_id.contains_key(row.id.as_str()) && row_shape_is_valid(row))
        else {
            malformed = true;
            continue;
        };
        let held = witness_problems(contract, row, &inventory);
        let witness_status = if held.is_empty() { "resolved" } else { "missing" };
        problems.insert(row.id.clone(), held);
        by_id.insert(
            contract.id,
            QuestionState {
                id: row.id.clone(),
                status: status_word(row.status),
                witness_status,
            },
        );
    }
    let questions = QUESTIONS
        .iter()
        .map(|question| {
            by_id.remove(question.id).unwrap_or_else(|| QuestionState {
                id: question.id.to_string(),
                status: "unassessed",
                witness_status: "unavailable",
            })
        })
        .collect();
    NormalizedQuestions {
        malformed,
        absent,
        inventory,
        problems,
        questions,
    }
}

/// An answered row and why its witnesses do not resolve.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnresolvedRow {
    pub id: String,
    pub problems: Vec<String>,
}

/// Why each answered competency row does not resolve, for the finalize refusal; empty when every
/// answered row resolves.
pub fn unresolved_competency_rows(competency: &CompetencyBlock) -> Vec<UnresolvedRow> {
    let mut normalized = normalize_questions(Some(competency));
    normalized
        .questions
        .iter()
        .filter(|row| row.status == "answered" && row.witness_status != "resolved")
        .map(|row| UnresolvedRow {
            id: row.id.clone(),
            problems: normalized.problems.remove(&row.id).unwrap_or_default(),
        })
        .collect()
}

fn source_receipt_malformed(source: &SourceFacts) -> bool {
    let status = source.status.as_deref();
    let known = status.is_some_and(|word| SOURCE_STATUSES.contains(&word))
        && source
            .currentness
            .as_deref()
            .is_some_and(|word| SOURCE_CURRENTNESS.contains(&word));
    if !known {
        return true;
    }
    if source.top_gap_id.as_deref().is_some_and(|gap| !is_gap_id(gap)) {
        return true;
    }
    if source.receipt_contract_version.is_some_and(|version| version != 1) {
        return true;
    }
    if status == Some("verified_current") && source.top_gap_id.is_some() {
        return true;
    }
    if status == Some("review_required") && source.top_gap_id.is_none() {
        return true;
    }
    if !matches!(status, Some("verified_current" | "review_required")) {
        return false;
    }
    let opaque = |value: &Option<String>| value.as_deref().is_some_and(safe_opaque);
    source.receipt_contract_version != Some(1)
        || !source.graph_hash.as_deref().is_some_and(safe_graph_hash)
        || !opaque(&source.source_id)
        || !opaque(&source.source_revision)
        || !opaque(&source.source_fingerprint)
        || !source.measured_at.as_deref().is_some_and(safe_measured_at)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Structure {
    pub status: &'static str,
    pub basis: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CompetencyDimension {
    pub status: &'static str,
    pub questions: Vec<QuestionState>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SourceDimension {
    pub status: String,
    pub currentness: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Dimensions {
    pub structure: Structure,
    pub competency: CompetencyDimension,
    pub source: SourceDimension,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TopGap {
    pub dimension: &'static str,
    pub id: String,
    #[serde(rename = "questionId", skip_serializing_if = "Option::is_none")]
    pub question_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NextActionId {
    pub id: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Provenance {
    pub evaluator: &'static str,
    #[serde(rename = "graphHash")]
    pub graph_hash: Option<String>,
    #[serde(rename = "competencyContract")]
    pub competency_contract: Option<&'static str>,
    #[serde(rename = "competencyEvaluator")]
    pub competency_evaluator: Option<&'static str>,
    #[serde(rename = "competencyGraphHash")]
    pub competency_graph_hash: Option<String>,
    #[serde(rename = "witnessInventoryContract")]
    pub witness_inventory_contract: Option<&'static str>,
    #[serde(rename = "witnessInventoryGraphHash")]
    pub witness_inventory_graph_hash: Option<String>,
    #[serde(rename = "witnessInventorySourceFingerprint")]
    pub witness_inventory_source_fingerprint: Option<String>,
    #[serde(rename = "sourceGraphHash")]
    pub source_graph_hash: Option<String>,
    #[serde(rename = "sourceReceiptContractVersion")]
    pub source_receipt_contract_version: Option<u8>,
    #[serde(rename = "sourceId")]
    pub source_id: Option<String>,
    #[serde(rename = "sourceRevision")]
    pub source_revision: Option<String>,
    #[serde(rename = "sourceFingerprint")]
    pub source_fingerprint: Option<String>,
    #[serde(rename = "sourceMeasuredAt")]
    pub source_measured_at: Option<String>,
    #[serde(rename = "sourceGapId")]
    pub source_gap_id: Option<String>,
}

/// The assessment: one categorical status, the gap that decides it and the one next action.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Assessment {
    pub contract: &'static str,
    #[serde(rename = "projectSlug")]
    pub project_slug: Option<String>,
    pub status: &'static str,
    pub dimensions: Dimensions,
    #[serde(rename = "topGap")]
    pub top_gap: Option<TopGap>,
    #[serde(rename = "nextAction")]
    pub next_action: NextActionId,
    pub provenance: Provenance,
}

fn kept(value: &Option<String>, valid: impl Fn(&str) -> bool) -> Option<String> {
    value.clone().filter(|text| valid(text))
}

fn assessed(
    input: &AssessmentInput<'_>,
    normalized: &NormalizedQuestions<'_>,
    status: &'static str,
    top_gap: Option<TopGap>,
    next_action: NextActionId,
) -> Assessment {
    let source = input.source;
    let source_status = source
        .status
        .as_deref()
        .filter(|word| SOURCE_STATUSES.contains(word))
        .unwrap_or("invalid")
        .to_string();
    let currentness = source
        .currentness
        .as_deref()
        .filter(|word| SOURCE_CURRENTNESS.contains(word))
        .unwrap_or("unavailable")
        .to_string();
    let answered = normalized
        .questions
        .iter()
        .all(|row| row.status == "answered" && row.witness_status == "resolved");
    let competency = input.competency;
    let inventory = competency.and_then(|block| block.inventory.as_ref());
    Assessment {
        contract: ASSESSMENT_CONTRACT,
        project_slug: safe_vault_slug(input.project_slug, PROJECT_SLUG_MAX_UNITS)
            .then(|| input.project_slug.to_string()),
        status,
        dimensions: Dimensions {
            structure: Structure {
                status: normalized_structure_status(input.structure_status),
                basis: "structure_only",
            },
            competency: CompetencyDimension {
                status: if answered { "answered" } else { "needs_evidence" },
                questions: normalized.questions.clone(),
            },
            source: SourceDimension {
                status: source_status,
                currentness,
            },
        },
        top_gap,
        next_action,
        provenance: Provenance {
            evaluator: ASSESSMENT_CONTRACT,
            graph_hash: input.graph_hash.filter(|hash| safe_graph_hash(hash)).map(str::to_string),
            competency_contract: competency
                .is_some_and(|block| block.contract == COMPETENCY_CONTRACT)
                .then_some(COMPETENCY_CONTRACT),
            competency_evaluator: competency
                .is_some_and(|block| block.evaluator == COMPETENCY_EVALUATOR)
                .then_some(COMPETENCY_EVALUATOR),
            competency_graph_hash: competency
                .and_then(|block| block.graph_hash.clone())
                .filter(|hash| safe_graph_hash(hash)),
            witness_inventory_contract: inventory
                .is_some_and(|held| held.contract == WITNESS_INVENTORY_CONTRACT)
                .then_some(WITNESS_INVENTORY_CONTRACT),
            witness_inventory_graph_hash: inventory
                .map(|held| held.graph_hash.clone())
                .filter(|hash| safe_graph_hash(hash)),
            witness_inventory_source_fingerprint: inventory
                .map(|held| held.source_fingerprint.clone())
                .filter(|value| safe_opaque(value)),
            source_graph_hash: kept(&source.graph_hash, safe_graph_hash),
            source_receipt_contract_version: (source.receipt_contract_version == Some(1)).then_some(1),
            source_id: kept(&source.source_id, safe_opaque),
            source_revision: kept(&source.source_revision, safe_opaque),
            source_fingerprint: kept(&source.source_fingerprint, safe_opaque),
            source_measured_at: kept(&source.measured_at, safe_measured_at),
            source_gap_id: source.top_gap_id.clone().filter(|gap| is_gap_id(gap)),
        },
    }
}

fn gap(dimension: &'static str, id: impl Into<String>) -> Option<TopGap> {
    Some(TopGap {
        dimension,
        id: id.into(),
        question_id: None,
    })
}

fn action(id: &'static str) -> NextActionId {
    NextActionId { id, target: None }
}

/// A categorical assessment from versioned evidence receipts.
#[allow(clippy::too_many_lines, reason = "one ordered decision list: the first failing rule names the gap")]
pub fn derive_meaning_assessment(input: &AssessmentInput<'_>) -> Assessment {
    let normalized = normalize_questions(input.competency);
    let source = input.source;
    let source_status = source.status.as_deref();
    let currentness = source.currentness.as_deref();
    let structure_status = normalized_structure_status(input.structure_status);

    let input_broken = !safe_vault_slug(input.project_slug, PROJECT_SLUG_MAX_UNITS)
        || !input.graph_hash.is_some_and(safe_graph_hash)
        || !structure_status_is_known(input.structure_status)
        || source_receipt_malformed(source);
    let judged = |status: &'static str, top_gap: Option<TopGap>, next: NextActionId| {
        assessed(input, &normalized, status, top_gap, next)
    };

    // Another defect is reported first: "not written yet" must not mask it.
    if input_broken || (normalized.malformed && !normalized.absent) {
        return judged(
            "invalid",
            gap("assessment", "assessment_input_invalid"),
            action("repair_assessment_input"),
        );
    }
    if normalized.absent {
        return judged(
            "invalid",
            gap("competency", "competency_not_authored"),
            action("author_competency_answers"),
        );
    }
    if structure_status == "invalid" || source_status == Some("invalid") {
        let structure_is_it = structure_status == "invalid";
        return judged(
            "invalid",
            if structure_is_it {
                gap("structure", "structure_not_ready")
            } else {
                gap("source", "source_receipt_invalid")
            },
            action(if structure_is_it {
                "repair_ontology_structure"
            } else {
                "repair_source_receipt"
            }),
        );
    }
    let source_gap = |fallback: &str| source.top_gap_id.clone().unwrap_or_else(|| fallback.to_string());
    if matches!(source_status, Some("not_measured" | "needs_evidence")) {
        return judged(
            "needs_evidence",
            gap("source", source_gap("source_evidence_missing")),
            action("measure_source"),
        );
    }
    if source.graph_hash.as_deref() != input.graph_hash {
        return judged("review_required", gap("source", "ontology_changed"), action("remeasure_source"));
    }
    if currentness == Some("stale") {
        return judged(
            "review_required",
            gap("source", source_gap("source_changed")),
            action("remeasure_source"),
        );
    }
    if currentness == Some("unavailable") {
        return judged(
            "review_required",
            gap("source", "source_currentness_unavailable"),
            action("verify_source_currentness"),
        );
    }
    if source_status == Some("review_required") {
        return judged(
            "review_required",
            gap("source", source_gap("source_review_required")),
            action("review_source_evidence"),
        );
    }
    let Some(competency) = input.competency else {
        return judged("invalid", gap("assessment", "assessment_input_invalid"), action("repair_assessment_input"));
    };
    if competency.body_matches_receipt == Some(false) {
        return judged(
            "review_required",
            gap("competency", "competency_body_changed"),
            action("reevaluate_competency"),
        );
    }
    if competency.graph_hash.as_deref() != input.graph_hash
        || normalized.inventory.graph_hash != input.graph_hash
    {
        return judged(
            "review_required",
            gap("competency", "competency_ontology_changed"),
            action("reevaluate_competency"),
        );
    }
    if normalized.inventory.source_fingerprint != source.source_fingerprint.as_deref() {
        return judged(
            "review_required",
            gap("competency", "competency_source_changed"),
            action("reevaluate_competency"),
        );
    }
    if let Some(incomplete) = normalized
        .questions
        .iter()
        .find(|row| row.status != "answered" || row.witness_status != "resolved")
    {
        return judged(
            "needs_evidence",
            Some(TopGap {
                dimension: "competency",
                id: "competency_question_incomplete".to_string(),
                question_id: Some(incomplete.id.clone()),
            }),
            NextActionId {
                id: "resolve_competency_question",
                target: Some(incomplete.id.clone()),
            },
        );
    }
    if structure_status != "ready" {
        return judged(
            "needs_evidence",
            gap("structure", "structure_not_ready"),
            action("repair_ontology_structure"),
        );
    }
    judged("verified_current", None, action("use_current_evidence"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::meaning_inventory::Inventory;

    const HASH: &str = "project-graph-v1:0badf00d";

    fn inventory() -> Inventory {
        Inventory {
            contract: WITNESS_INVENTORY_CONTRACT,
            graph_hash: HASH.to_string(),
            source_fingerprint: "sha256:abc".to_string(),
            concepts: vec!["shop".to_string()],
            kinds: vec![("shop".to_string(), "project".to_string())],
            relations: Vec::new(),
            evidence: vec!["README.md".to_string()],
            paths: vec!["README.md".to_string()],
        }
    }

    fn source() -> SourceFacts {
        SourceFacts {
            status: Some("verified_current".to_string()),
            currentness: Some("current".to_string()),
            top_gap_id: None,
            receipt_contract_version: Some(1),
            graph_hash: Some(HASH.to_string()),
            source_id: Some("sha256:id".to_string()),
            source_revision: Some("sha256:rev".to_string()),
            source_fingerprint: Some("sha256:abc".to_string()),
            measured_at: Some("2026-11-28T10:00:00.000Z".to_string()),
        }
    }

    fn block(rows: Vec<QuestionRow>) -> CompetencyBlock {
        CompetencyBlock {
            contract: COMPETENCY_CONTRACT.to_string(),
            receipt_version: 1,
            evaluator: COMPETENCY_EVALUATOR.to_string(),
            graph_hash: Some(HASH.to_string()),
            inventory: Some(inventory()),
            questions: rows,
            body_matches_receipt: Some(true),
        }
    }

    fn row(id: &str, concepts: &[&str], evidence: &[&str]) -> QuestionRow {
        QuestionRow {
            id: id.to_string(),
            status: AnswerStatus::Answered,
            concepts: concepts.iter().map(|value| (*value).to_string()).collect(),
            relations: Vec::new(),
            evidence: evidence.iter().map(|value| (*value).to_string()).collect(),
            paths: Vec::new(),
            unresolved: Vec::new(),
        }
    }

    #[test]
    fn an_answered_row_that_cites_what_the_project_does_not_hold_says_each_witness_to_change() {
        let competency = block(vec![row("scope", &["ghost"], &["src/gone.ts"])]);
        let unresolved = unresolved_competency_rows(&competency);
        assert_eq!(unresolved.len(), 1);
        assert_eq!(
            unresolved[0].problems,
            [
                "concept `ghost` is not in this project's containment graph",
                "evidence `src/gone.ts` is not a measured source witness",
            ]
        );
    }

    #[test]
    fn a_project_that_never_finalized_is_not_authored_and_not_called_broken() {
        let source = source();
        let assessment = derive_meaning_assessment(&AssessmentInput {
            project_slug: "shop",
            graph_hash: Some(HASH),
            structure_status: Some("ready"),
            source: &source,
            competency: None,
        });
        assert_eq!(assessment.status, "invalid");
        assert_eq!(assessment.top_gap.map(|gap| gap.id), Some("competency_not_authored".to_string()));
    }

    #[test]
    fn a_source_that_moved_since_the_receipt_asks_for_a_new_measurement_before_anything_else() {
        let mut source = source();
        source.graph_hash = Some("project-graph-v1:00000000".to_string());
        let competency = block(Vec::new());
        let assessment = derive_meaning_assessment(&AssessmentInput {
            project_slug: "shop",
            graph_hash: Some(HASH),
            structure_status: Some("ready"),
            source: &source,
            competency: Some(&competency),
        });
        assert_eq!(assessment.status, "review_required");
        assert_eq!(assessment.next_action.id, "remeasure_source");
    }
}
