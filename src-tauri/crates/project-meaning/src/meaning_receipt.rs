//! `.ontology-atlas/project-meaning.json`: the receipt `finalize_project_meaning` leaves for each
//! project, which says which body, which ontology and which source measurement the five answers
//! were judged against. A later assessment compares them to what is there now.
//!
//! The file is read strictly: one key more or less, a time in another spelling or a repeated
//! project makes it malformed, and a malformed file is never replaced as if it were empty.

use std::path::Path;

use answer_format::collation::compare_text;
use confined_files::{sha256_hex, Revision, SidecarError, VaultSidecar};
use serde::Serialize;
use serde_json::Value;

use crate::competency_markdown::parse_competency_markdown;
use crate::meaning_assessment::{
    derive_meaning_assessment, Assessment, AssessmentInput, CompetencyBlock, QuestionRow,
    SourceFacts,
};
use crate::meaning_inventory::Inventory;
use crate::meaning_questions::{
    COMPETENCY_CONTRACT, COMPETENCY_EVALUATOR, RECEIPT_VERSION,
};
use crate::stored_name_shapes::{
    pattern, safe_graph_hash, safe_measured_at, safe_opaque, safe_vault_slug,
    PROJECT_SLUG_MAX_UNITS,
};

pub const MEANING_STATE_RELATIVE_PATH: &str = ".ontology-atlas/project-meaning.json";
const MEANING_STATE_FILENAME: &str = "project-meaning.json";
const MARKDOWN_CONTRACT: &str = "projectCompetencyMarkdown:v1";
const STATE_MAX_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MeaningReceipt {
    pub version: u8,
    pub evaluator: &'static str,
    #[serde(rename = "markdownContract")]
    pub markdown_contract: &'static str,
    #[serde(rename = "projectSlug")]
    pub project_slug: String,
    #[serde(rename = "bodyDigest")]
    pub body_digest: String,
    #[serde(rename = "graphHash")]
    pub graph_hash: String,
    #[serde(rename = "sourceFingerprint")]
    pub source_fingerprint: String,
    #[serde(rename = "measuredAt")]
    pub measured_at: String,
}

#[derive(Serialize)]
struct State<'a> {
    version: u8,
    receipts: &'a [MeaningReceipt],
}

/// `sha256:` and the digest of the body's UTF-8 bytes.
pub fn body_digest(body: &str) -> String {
    format!("sha256:{}", sha256_hex(body.as_bytes()))
}

enum StateRead {
    UnsafePath(String),
    Malformed,
    Missing,
    Current(Vec<MeaningReceipt>),
}

struct Snapshot {
    read: StateRead,
    revision: Option<Revision>,
}

fn text_of<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key)?.as_str()
}

fn is_one(value: Option<&Value>) -> bool {
    value.and_then(Value::as_f64) == Some(f64::from(RECEIPT_VERSION))
}

fn strict_receipt(value: &Value) -> Option<MeaningReceipt> {
    let members = value.as_object()?;
    let mut keys: Vec<&str> = members.keys().map(String::as_str).collect();
    keys.sort_unstable();
    let expected = [
        "bodyDigest",
        "evaluator",
        "graphHash",
        "markdownContract",
        "measuredAt",
        "projectSlug",
        "sourceFingerprint",
        "version",
    ];
    if keys != expected || !is_one(value.get("version")) {
        return None;
    }
    let digest = pattern(r"^sha256:[a-f0-9]{64}$");
    let body = text_of(value, "bodyDigest").filter(|text| digest.is_match(text))?;
    let project = text_of(value, "projectSlug")
        .filter(|slug| safe_vault_slug(slug, PROJECT_SLUG_MAX_UNITS))?;
    let graph = text_of(value, "graphHash").filter(|hash| safe_graph_hash(hash))?;
    let fingerprint = text_of(value, "sourceFingerprint").filter(|text| safe_opaque(text))?;
    let measured = text_of(value, "measuredAt").filter(|text| safe_measured_at(text))?;
    (text_of(value, "evaluator") == Some(COMPETENCY_EVALUATOR)
        && text_of(value, "markdownContract") == Some(MARKDOWN_CONTRACT))
    .then(|| MeaningReceipt {
        version: RECEIPT_VERSION,
        evaluator: COMPETENCY_EVALUATOR,
        markdown_contract: MARKDOWN_CONTRACT,
        project_slug: project.to_string(),
        body_digest: body.to_string(),
        graph_hash: graph.to_string(),
        source_fingerprint: fingerprint.to_string(),
        measured_at: measured.to_string(),
    })
}

fn strict_state(text: &str) -> Option<Vec<MeaningReceipt>> {
    let value: Value = serde_json::from_str(text).ok()?;
    let members = value.as_object()?;
    let mut keys: Vec<&str> = members.keys().map(String::as_str).collect();
    keys.sort_unstable();
    if keys != ["receipts", "version"] || !is_one(value.get("version")) {
        return None;
    }
    let receipts: Vec<MeaningReceipt> = value
        .get("receipts")?
        .as_array()?
        .iter()
        .map(strict_receipt)
        .collect::<Option<Vec<_>>>()?;
    let mut slugs: Vec<&str> = receipts.iter().map(|receipt| receipt.project_slug.as_str()).collect();
    slugs.sort_unstable();
    slugs.dedup();
    (slugs.len() == receipts.len()).then_some(receipts)
}

fn snapshot(vault: &Path) -> Snapshot {
    let sidecar = VaultSidecar::new(vault.to_path_buf());
    let stored = match sidecar.read_text(MEANING_STATE_FILENAME, STATE_MAX_BYTES) {
        Ok(stored) => stored,
        Err(SidecarError::Unsafe(unsafe_path)) => {
            return Snapshot {
                read: StateRead::UnsafePath(unsafe_path.to_string()),
                revision: None,
            }
        }
        Err(_) => {
            return Snapshot {
                read: StateRead::Malformed,
                revision: None,
            }
        }
    };
    let Some(stored) = stored else {
        return Snapshot {
            read: StateRead::Missing,
            revision: None,
        };
    };
    let read = match strict_state(&stored.text) {
        Some(receipts) => StateRead::Current(receipts),
        None => StateRead::Malformed,
    };
    Snapshot {
        read,
        revision: Some(stored.revision),
    }
}

/// Why the receipt was not written, in the sentence the agent is given.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReceiptWriteFailure(pub String);

/// What a receipt is written for.
pub struct ReceiptSubject<'a> {
    pub project_slug: &'a str,
    pub project_body: &'a str,
    pub graph_hash: &'a str,
    pub source_fingerprint: &'a str,
    pub measured_at: &'a str,
}

/// Replaces this project's receipt and keeps every other.
pub fn finalize_meaning_receipt(
    vault: &Path,
    subject: &ReceiptSubject<'_>,
) -> Result<MeaningReceipt, ReceiptWriteFailure> {
    let failure = |message: &str| ReceiptWriteFailure(message.to_string());
    if !safe_vault_slug(subject.project_slug, PROJECT_SLUG_MAX_UNITS) {
        return Err(failure("projectSlug is invalid"));
    }
    if !safe_graph_hash(subject.graph_hash) {
        return Err(failure("graphHash is invalid"));
    }
    if !safe_opaque(subject.source_fingerprint) {
        return Err(failure("sourceFingerprint is invalid"));
    }
    if !safe_measured_at(subject.measured_at) {
        return Err(failure("measuredAt is invalid"));
    }
    parse_competency_markdown(subject.project_body).map_err(|fault| ReceiptWriteFailure(fault.0))?;

    let existing = snapshot(vault);
    let retained = match existing.read {
        StateRead::UnsafePath(message) => return Err(ReceiptWriteFailure(message)),
        StateRead::Malformed => return Err(failure("Existing project meaning receipt is malformed")),
        StateRead::Missing => Vec::new(),
        StateRead::Current(receipts) => receipts,
    };
    let receipt = MeaningReceipt {
        version: RECEIPT_VERSION,
        evaluator: COMPETENCY_EVALUATOR,
        markdown_contract: MARKDOWN_CONTRACT,
        project_slug: subject.project_slug.to_string(),
        body_digest: body_digest(subject.project_body),
        graph_hash: subject.graph_hash.to_string(),
        source_fingerprint: subject.source_fingerprint.to_string(),
        measured_at: subject.measured_at.to_string(),
    };
    let mut receipts: Vec<MeaningReceipt> = retained
        .into_iter()
        .filter(|held| held.project_slug != subject.project_slug)
        .collect();
    receipts.push(receipt.clone());
    receipts.sort_by(|left, right| compare_text(&left.project_slug, &right.project_slug));
    let text = answer_format::json::to_string_indented(
        &State {
            version: RECEIPT_VERSION,
            receipts: &receipts,
        },
        2,
    )
    .map_err(|error| ReceiptWriteFailure(error.to_string()))?;
    VaultSidecar::new(vault.to_path_buf())
        .replace_text(MEANING_STATE_FILENAME, &format!("{text}\n"), existing.revision)
        .map_err(|error| ReceiptWriteFailure(error.to_string()))?;
    Ok(receipt)
}

/// What the assessment of one project is read from.
pub struct AssessedProject<'a> {
    pub project_slug: &'a str,
    /// The project's body as the assessment should judge it.
    pub project_body: Option<&'a str>,
    pub graph_hash: Option<&'a str>,
    pub structure_status: Option<&'a str>,
    pub source: &'a SourceFacts,
    pub inventory: Option<&'a Inventory>,
}

fn broken_competency(project: &AssessedProject<'_>) -> CompetencyBlock {
    CompetencyBlock {
        contract: "projectMeaningReceipt:invalid".to_string(),
        receipt_version: u32::from(RECEIPT_VERSION),
        evaluator: COMPETENCY_EVALUATOR.to_string(),
        graph_hash: project.graph_hash.map(str::to_string),
        inventory: project.inventory.cloned(),
        questions: Vec::new(),
        body_matches_receipt: None,
    }
}

/// The assessment of `project` against the receipt this vault holds for it.
pub fn read_meaning_assessment(vault: &Path, project: &AssessedProject<'_>) -> Assessment {
    let judge = |competency: Option<&CompetencyBlock>| {
        derive_meaning_assessment(&AssessmentInput {
            project_slug: project.project_slug,
            graph_hash: project.graph_hash,
            structure_status: project.structure_status,
            source: project.source,
            competency,
        })
    };
    let receipts = match snapshot(vault).read {
        StateRead::UnsafePath(_) | StateRead::Malformed => return judge(Some(&broken_competency(project))),
        StateRead::Missing => Vec::new(),
        StateRead::Current(receipts) => receipts,
    };
    let Some(receipt) = receipts
        .iter()
        .find(|held| held.project_slug == project.project_slug)
    else {
        return judge(None);
    };
    let Some(parsed) = project
        .project_body
        .and_then(|body| parse_competency_markdown(body).ok())
    else {
        return judge(Some(&broken_competency(project)));
    };
    let inventory = project.inventory.map(|held| {
        let mut held = held.clone();
        if safe_opaque(&held.source_fingerprint) {
            held.source_fingerprint = receipt.source_fingerprint.clone();
        }
        held
    });
    judge(Some(&CompetencyBlock {
        contract: COMPETENCY_CONTRACT.to_string(),
        receipt_version: u32::from(RECEIPT_VERSION),
        evaluator: receipt.evaluator.to_string(),
        graph_hash: Some(receipt.graph_hash.clone()),
        inventory,
        questions: parsed.iter().map(QuestionRow::of).collect(),
        body_matches_receipt: project
            .project_body
            .map(|body| receipt.body_digest == body_digest(body)),
    }))
}

#[cfg(test)]
#[allow(
    clippy::disallowed_methods,
    reason = "a test builds its folders with the standard library"
)]
mod tests {
    use super::*;

    const HASH: &str = "project-graph-v1:0badf00d";
    const BODY: &str = "# Shop\n";

    fn subject<'a>(body: &'a str, measured_at: &'a str) -> ReceiptSubject<'a> {
        ReceiptSubject {
            project_slug: "shop",
            project_body: body,
            graph_hash: HASH,
            source_fingerprint: "sha256:abc",
            measured_at,
        }
    }

    #[test]
    fn a_receipt_is_refused_for_a_body_without_the_exact_section_and_nothing_is_written() {
        let vault = tempfile::tempdir().expect("vault");
        let refused = finalize_meaning_receipt(vault.path(), &subject(BODY, "2026-11-28T10:00:00.000Z"))
            .expect_err("no section");
        assert_eq!(
            refused.0,
            "Invalid project competency Markdown: exactly one Competency answers section is required"
        );
        assert!(!vault.path().join(MEANING_STATE_RELATIVE_PATH).exists());
    }

    #[test]
    fn a_state_file_with_one_key_too_many_is_malformed_and_is_not_overwritten() {
        let text = r#"{"version":1,"receipts":[],"extra":true}"#;
        assert!(strict_state(text).is_none());
        assert_eq!(strict_state(r#"{"version":1,"receipts":[]}"#), Some(Vec::new()));
        let vault = tempfile::tempdir().expect("vault");
        std::fs::create_dir_all(vault.path().join(".ontology-atlas")).expect("folder");
        std::fs::write(vault.path().join(MEANING_STATE_RELATIVE_PATH), text).expect("file");
        assert!(matches!(snapshot(vault.path()).read, StateRead::Malformed));
    }
}
