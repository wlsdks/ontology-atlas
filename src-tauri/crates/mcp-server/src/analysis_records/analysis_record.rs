//! An analysis record that passed every check of the format `atlas-analysis/v1`: a run, which keeps
//! what one question was asked and answered from, or a review, which keeps what a person decided
//! about one finding of a run. The format is the app's: it writes the files, so a record is judged
//! by its rules and never repaired.

use std::collections::HashSet;

use super::field_checks::{
    digest, field, fields, list, nullable_text, object, one_of, strings, text, timestamp, uuid,
    Row, LIST_MAX, TEXT_MAX,
};
use super::record_fault::RecordFault;
use super::record_value::RecordValue;

pub const ANALYSIS_SCHEMA: &str = "atlas-analysis/v1";

const RUN_KEYS: [&str; 17] = [
    "schema",
    "recordType",
    "id",
    "createdAt",
    "mode",
    "scope",
    "request",
    "origin",
    "basis",
    "evidence",
    "observations",
    "profileSnapshot",
    "toolReads",
    "sourceAccess",
    "findings",
    "qualification",
    "answer",
];
const REVIEW_KEYS: [&str; 9] = [
    "schema",
    "recordType",
    "id",
    "createdAt",
    "runId",
    "findingId",
    "disposition",
    "actor",
    "rationale",
];
/// The body of a run is its answer and the body of a review its rationale; both are the file's text
/// after the metadata.
const RUN_ANSWER_MAX: usize = 1_500_000;
const EVIDENCE_BODY_MAX: usize = 500_000;
const SOURCE_LIST_MAX: usize = 5000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecordKind {
    Run,
    Review,
}

/// The modes a run may be recorded under.
const ANALYSIS_MODES: [&str; 2] = ["meaning", "architecture"];

/// A record that passed its checks: the fields as the file wrote them, in file order.
#[derive(Debug, Clone)]
pub struct AnalysisRecord {
    kind: RecordKind,
    fields: Row,
}

impl AnalysisRecord {
    pub fn kind(&self) -> RecordKind {
        self.kind
    }

    /// A text field every record of its kind has; the checks said so.
    pub fn text_of(&self, key: &str) -> &str {
        field(&self.fields, key).as_text().unwrap_or_default()
    }

    pub fn id(&self) -> &str {
        self.text_of("id")
    }

    pub fn created_at(&self) -> &str {
        self.text_of("createdAt")
    }

    /// A field of the record, `null` where it has none.
    pub fn at(&self, key: &str) -> &RecordValue {
        field(&self.fields, key)
    }

    /// The record as one JSON value, its fields in file order.
    pub fn into_value(self) -> RecordValue {
        RecordValue::Object(self.fields)
    }
}

/// Checks a record, naming the first rule it breaks. The rules run in the order the writer
/// lists its fields, so the sentence is the same whatever else is wrong.
pub fn validate(row: Row) -> Result<AnalysisRecord, RecordFault> {
    one_of(field(&row, "schema"), &[ANALYSIS_SCHEMA], "analysis schema")?;
    one_of(field(&row, "recordType"), &["run", "review"], "record type")?;
    uuid(field(&row, "id"), "record id")?;
    timestamp(field(&row, "createdAt"))?;
    if field(&row, "recordType").as_text() == Some("review") {
        check_review(&row)?;
        return Ok(AnalysisRecord {
            kind: RecordKind::Review,
            fields: row,
        });
    }
    check_run(&row)?;
    Ok(AnalysisRecord {
        kind: RecordKind::Run,
        fields: row,
    })
}

fn check_review(row: &Row) -> Result<(), RecordFault> {
    fields(row, &REVIEW_KEYS, "review")?;
    uuid(field(row, "runId"), "review run id")?;
    text(field(row, "findingId"), "finding id", false, 200)?;
    one_of(
        field(row, "disposition"),
        &["retain", "dismiss"],
        "review disposition",
    )?;
    one_of(field(row, "actor"), &["user-action"], "review actor")?;
    text(field(row, "rationale"), "review rationale", true, TEXT_MAX)?;
    Ok(())
}

fn check_run(row: &Row) -> Result<(), RecordFault> {
    fields(row, &RUN_KEYS, "run")?;
    one_of(field(row, "mode"), &ANALYSIS_MODES, "analysis mode")?;
    check_scope(object(field(row, "scope"), "scope")?)?;
    let request = object(field(row, "request"), "request")?;
    fields(request, &["id", "text", "parentRunId"], "request")?;
    text(field(request, "id"), "request id", false, 200)?;
    text(field(request, "text"), "request text", true, TEXT_MAX)?;
    if !field(request, "parentRunId").is_null() {
        uuid(field(request, "parentRunId"), "parent run id")?;
    }
    let origin = object(field(row, "origin"), "origin")?;
    check_origin(origin)?;
    let basis = object(field(row, "basis"), "basis")?;
    check_basis(basis)?;
    let evidence = check_evidence(field(row, "evidence"))?;
    let profile_hash = field(basis, "profileHash");
    check_profile_snapshot(field(row, "profileSnapshot"), profile_hash)?;
    check_observations(field(row, "observations"))?;
    let completed_reads = check_tool_reads(field(row, "toolReads"))?;
    one_of(
        field(row, "sourceAccess"),
        &["atlas-only", "source-included", "unproven"],
        "source access",
    )?;
    let qualification = object(field(row, "qualification"), "qualification")?;
    fields(qualification, &["status", "reasons"], "qualification")?;
    one_of(
        field(qualification, "status"),
        &["grounded", "unverified"],
        "qualification status",
    )?;
    let reasons = strings(
        field(qualification, "reasons"),
        "qualification reasons",
        LIST_MAX,
    )?;
    let grounded = field(qualification, "status").as_text() == Some("grounded");
    check_findings(field(row, "findings"), grounded, &evidence.slugs)?;
    if grounded {
        check_grounded(
            row,
            origin,
            basis,
            request,
            &evidence,
            &completed_reads,
            reasons.is_empty(),
        )?;
    }
    text(field(row, "answer"), "answer", true, RUN_ANSWER_MAX)?;
    Ok(())
}

fn check_scope(scope: &Row) -> Result<(), RecordFault> {
    fields(
        scope,
        &["projectSlug", "projectUid", "targetSlugs", "profileSlug"],
        "scope",
    )?;
    nullable_text(field(scope, "projectSlug"), "project slug")?;
    if !field(scope, "projectUid").is_null() {
        uuid(field(scope, "projectUid"), "project uid")?;
    }
    strings(
        field(scope, "targetSlugs"),
        "scope targets",
        SOURCE_LIST_MAX,
    )?;
    nullable_text(field(scope, "profileSlug"), "profile slug")
}

fn check_origin(origin: &Row) -> Result<(), RecordFault> {
    fields(
        origin,
        &[
            "surface",
            "runtimeId",
            "sessionId",
            "userEventId",
            "answerEventId",
            "startedAt",
            "stopReason",
            "outcome",
        ],
        "origin",
    )?;
    one_of(
        field(origin, "surface"),
        &["map", "analysis", "architecture"],
        "origin surface",
    )?;
    text(field(origin, "runtimeId"), "runtime id", false, 200)?;
    nullable_text(field(origin, "sessionId"), "session id")?;
    text(field(origin, "userEventId"), "user event id", false, 200)?;
    nullable_text(field(origin, "answerEventId"), "answer event id")?;
    timestamp(field(origin, "startedAt"))?;
    nullable_text(field(origin, "stopReason"), "stop reason")?;
    one_of(
        field(origin, "outcome"),
        &["completed", "cancelled", "failed"],
        "turn outcome",
    )
}

fn check_basis(basis: &Row) -> Result<(), RecordFault> {
    fields(
        basis,
        &["graphHash", "sourceFingerprint", "profileHash", "documents"],
        "basis",
    )?;
    if !field(basis, "graphHash").is_null() {
        digest(field(basis, "graphHash"), "graph hash")?;
    }
    nullable_text(field(basis, "sourceFingerprint"), "source fingerprint")?;
    if !field(basis, "profileHash").is_null() {
        digest(field(basis, "profileHash"), "profile hash")?;
    }
    let mut seen: HashSet<&str> = HashSet::new();
    for item in list(
        field(basis, "documents"),
        "basis documents",
        SOURCE_LIST_MAX,
    )? {
        let document = object(item, "basis document")?;
        fields(document, &["slug", "digest"], "basis document")?;
        let slug = text(field(document, "slug"), "basis slug", false, 1024)?;
        digest(field(document, "digest"), "basis document digest")?;
        if !seen.insert(slug) {
            return Err(RecordFault::new("Duplicate basis document."));
        }
    }
    Ok(())
}

/// The slugs and tool calls the evidence of a run names.
struct EvidenceNames<'a> {
    slugs: Vec<&'a str>,
    calls: Vec<&'a str>,
}

fn check_evidence(evidence: &RecordValue) -> Result<EvidenceNames<'_>, RecordFault> {
    let mut names = EvidenceNames {
        slugs: Vec::new(),
        calls: Vec::new(),
    };
    for item in list(evidence, "evidence", LIST_MAX)? {
        let node = object(item, "evidence")?;
        fields(
            node,
            &[
                "slug",
                "uid",
                "title",
                "kind",
                "body",
                "frontmatter",
                "digest",
                "toolCallId",
            ],
            "evidence",
        )?;
        let slug = text(field(node, "slug"), "evidence slug", false, 1024)?;
        if !field(node, "uid").is_null() {
            uuid(field(node, "uid"), "evidence uid")?;
        }
        text(field(node, "title"), "evidence title", false, TEXT_MAX)?;
        text(field(node, "kind"), "evidence kind", false, 100)?;
        text(
            field(node, "body"),
            "evidence body",
            true,
            EVIDENCE_BODY_MAX,
        )?;
        object(field(node, "frontmatter"), "evidence frontmatter")?;
        digest(field(node, "digest"), "evidence digest")?;
        let call = text(
            field(node, "toolCallId"),
            "evidence tool call id",
            false,
            200,
        )?;
        if names.slugs.contains(&slug) {
            return Err(RecordFault::new("Duplicate evidence slug."));
        }
        names.slugs.push(slug);
        if !names.calls.contains(&call) {
            names.calls.push(call);
        }
    }
    Ok(names)
}

fn check_profile_snapshot(
    snapshot: &RecordValue,
    profile_hash: &RecordValue,
) -> Result<(), RecordFault> {
    if snapshot.is_null() {
        return Ok(());
    }
    let snapshot = object(snapshot, "profile snapshot")?;
    fields(
        snapshot,
        &["slug", "digest", "markdown"],
        "profile snapshot",
    )?;
    text(
        field(snapshot, "slug"),
        "profile snapshot slug",
        false,
        1024,
    )?;
    digest(field(snapshot, "digest"), "profile snapshot digest")?;
    text(
        field(snapshot, "markdown"),
        "profile snapshot markdown",
        false,
        EVIDENCE_BODY_MAX,
    )?;
    if profile_hash != field(snapshot, "digest") {
        return Err(RecordFault::new(
            "Profile snapshot and basis digest disagree.",
        ));
    }
    Ok(())
}

fn check_observations(observations: &RecordValue) -> Result<(), RecordFault> {
    for item in list(observations, "observations", 20)? {
        let observation = object(item, "observation")?;
        fields(
            observation,
            &["toolCallId", "name", "digest", "result"],
            "observation",
        )?;
        text(
            field(observation, "toolCallId"),
            "observation call id",
            false,
            200,
        )?;
        one_of(
            field(observation, "name"),
            &["inspect_architecture"],
            "observation tool",
        )?;
        digest(field(observation, "digest"), "observation digest")?;
        let result = object(field(observation, "result"), "observation result")?;
        if field(result, "contract").as_text() != Some("architectureBrief:v1") {
            return Err(RecordFault::new(
                "Observation must be an architecture brief.",
            ));
        }
    }
    Ok(())
}

/// The ids of the full-body reads that completed.
fn check_tool_reads(reads: &RecordValue) -> Result<Vec<&str>, RecordFault> {
    let mut completed: Vec<&str> = Vec::new();
    for item in list(reads, "tool reads", 1000)? {
        let read = object(item, "tool read")?;
        fields(read, &["id", "name", "status"], "tool read")?;
        let id = text(field(read, "id"), "tool read id", false, 200)?;
        let name = text(field(read, "name"), "tool name", false, 200)?;
        let status = text(field(read, "status"), "tool status", false, 100)?;
        if status == "completed" && ["get_concept", "get_concepts"].contains(&name) {
            completed.push(id);
        }
    }
    Ok(completed)
}

fn check_findings(
    findings: &RecordValue,
    grounded: bool,
    evidence_slugs: &[&str],
) -> Result<(), RecordFault> {
    let mut ids: Vec<&str> = Vec::new();
    for item in list(findings, "findings", 100)? {
        let finding = object(item, "finding")?;
        fields(
            finding,
            &[
                "id",
                "category",
                "title",
                "detail",
                "targetSlugs",
                "evidenceSlugs",
                "roleIds",
                "relation",
                "suggestedAction",
            ],
            "finding",
        )?;
        let id = text(field(finding, "id"), "finding id", false, 200)?;
        if ids.contains(&id) {
            return Err(RecordFault::new("Duplicate finding id."));
        }
        ids.push(id);
        one_of(
            field(finding, "category"),
            &[
                "definition",
                "boundary",
                "relation",
                "evidence",
                "architecture",
            ],
            "finding category",
        )?;
        text(field(finding, "title"), "finding title", false, 500)?;
        text(field(finding, "detail"), "finding detail", false, TEXT_MAX)?;
        strings(field(finding, "targetSlugs"), "finding targets", LIST_MAX)?;
        let references = strings(
            field(finding, "evidenceSlugs"),
            "finding evidence",
            LIST_MAX,
        )?;
        strings(field(finding, "roleIds"), "finding roles", LIST_MAX)?;
        text(
            field(finding, "suggestedAction"),
            "suggested action",
            true,
            TEXT_MAX,
        )?;
        if !field(finding, "relation").is_null() {
            let relation = object(field(finding, "relation"), "finding relation")?;
            fields(relation, &["from", "to", "type"], "finding relation")?;
            for key in ["from", "to", "type"] {
                text(
                    field(relation, key),
                    &format!("relation {key}"),
                    false,
                    1024,
                )?;
            }
        }
        if grounded
            && (references.is_empty()
                || references.iter().any(|slug| !evidence_slugs.contains(slug)))
        {
            return Err(RecordFault::new(
                "A grounded finding requires its full-body evidence.",
            ));
        }
    }
    Ok(())
}

/// What a run that calls itself grounded has to show: a finished turn, full-body reads of all it
/// cites, no reason left to doubt it, and the basis its mode needs.
fn check_grounded(
    row: &Row,
    origin: &Row,
    basis: &Row,
    request: &Row,
    evidence: &EvidenceNames<'_>,
    completed_reads: &[&str],
    no_reasons: bool,
) -> Result<(), RecordFault> {
    let turn_finished = field(origin, "outcome").as_text() == Some("completed");
    let reads_complete = evidence
        .calls
        .iter()
        .all(|call| completed_reads.contains(call));
    if !turn_finished || evidence.slugs.is_empty() || !reads_complete {
        return Err(RecordFault::new(
            "Grounded evidence requires a completed turn and completed full-body reads.",
        ));
    }
    let mode = field(row, "mode").as_text();
    let basis_fits = match mode {
        Some("meaning") => field(row, "sourceAccess").as_text() == Some("atlas-only"),
        Some("architecture") => {
            !field(basis, "sourceFingerprint").is_null()
                && !field(basis, "profileHash").is_null()
                && !field(row, "profileSnapshot").is_null()
                && field(row, "observations")
                    .as_list()
                    .is_some_and(|observations| !observations.is_empty())
        }
        _ => true,
    };
    let answered = field(row, "answer")
        .as_text()
        .is_some_and(|answer| !answer.is_empty());
    let complete = no_reasons
        && field(origin, "stopReason").as_text() == Some("end_turn")
        && answered
        && field(request, "id") == field(origin, "userEventId")
        && basis_fits;
    if complete {
        Ok(())
    } else {
        Err(RecordFault::new(
            "Grounded analysis has an incomplete or contradictory qualification basis.",
        ))
    }
}
