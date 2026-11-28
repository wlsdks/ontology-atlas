//! `finalize_project_meaning`: judge a project's five competency answers against the ontology and the
//! source folder it is connected to, write the receipt that says which body, ontology and source
//! measurement they were judged against, and return the categorical assessment.
//!
//! Given `answers`, the server renders the section itself and replaces only that section of the
//! body as it is now; without them it checks the body as it stands and refuses a stale
//! `expected_mtime`. Every refusal is made before anything is written, except one that cannot be:
//! once the body is on disk the audit line is left, whatever the receipt write then does.

use std::collections::HashMap;
use std::sync::LazyLock;

use build_depth::{
    competency_depth_refusals, measure_build_depth, not_mapped_lines_refusal, BuildDepthInput,
};
use confined_files::{ModifiedTime, SourceFiles};
use meaning_findings::WITNESS_TEXT_MAX_BYTES;
use project_meaning::{
    finalize_meaning_receipt, parse_competency_markdown, read_meaning_assessment,
    render_competency_answers, structure_readiness, unresolved_competency_rows,
    with_competency_section, AnswerRow, AnswerStatus, AssessedProject, Assessment,
    CompetencyBlock, Inventory, QuestionRow, ReceiptSubject, SourceFacts, UnresolvedRow, ValidationCounts,
    COMPETENCY_CONTRACT, COMPETENCY_EVALUATOR, QUESTIONS,
};
use project_source::{
    read_source_bindings, write_source_binding, BindingsRead, OrderedJson, SourceReceipt,
    WitnessClaim,
};
use regex::Regex;
use repository_survey::Survey;
use serde::Serialize;
use source_reads::ReadsUnder;
use vault_document::LoadedDocument;

use super::connect_project_source::{binding_failure, measure_source, Measured};
use super::patch_document::patch_document;
use super::plain_refusal::plain_refusal;
use crate::tools::project_meaning_context::{meaning_inventory, project_meaning_context};
use super::project_source_selection::{existing_slug, missing_project};
use super::vault_view::VaultView;
use super::write_aftermath::{measure_coverage, share_counts, source_state};
use super::write_gates::require_not_reserved;
use super::concept_effect::effect;
use super::expected_mtime::{modified_ms, require_current};
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::audit::{ActivityContent, ShareMeasure, WriteDone, WriteRecord};
use crate::error::ToolError;
use crate::tools::argument_checks::{optional_non_blank_text, optional_non_negative_number};
use crate::tools::import_scan_target::ScanTarget;
use crate::tools::kept_survey::kept_survey;
use crate::tools::vault_validation_report::build_report;
use crate::write_checkpoint::Permit;
use crate::write_tool::WriteTool;

const RECEIPT_CONTRACT: &str = "projectMeaningReceipt:v1";
const TOOL: &str = "finalize_project_meaning";

/// What an agent is told when the body's section is not in the layout and `answers` was not sent:
/// the whole answer layout, since the server owns the questions and the section.
fn answers_hint() -> String {
    let questions: Vec<String> = QUESTIONS
        .iter()
        .map(|question| {
            let witnesses: Vec<String> = question
                .required
                .iter()
                .map(|kind| kind.label().to_ascii_lowercase())
                .collect();
            format!(
                "- `{}`: {} Answered cites {}.",
                question.id,
                question.text,
                witnesses.join(", ")
            )
        })
        .collect();
    format!(
        "Call finalize_project_meaning again with `answers`; the server writes the `## Competency answers` section itself. One row per question:\n\n{}\n\n{ANSWER_ROW_GUIDE}",
        questions.join("\n")
    )
}

const ANSWER_ROW_GUIDE: &str = "A row is `{id, status, answer, concepts?, relations?, evidence?, paths?, gap?}`:
- `status`: `answered` when the witnesses back the whole answer, else `partial` or `visible-gap` with `gap`: one line naming what is missing.
- `answer`: plain sentences; no heading and no \"- Label:\" line.
- `concepts`: slugs inside this project. `relations`: `{from, to, type}` with the stored key (`domains`, `capabilities`, `elements`, `depends_on`).
- `evidence`, `paths`: repository-relative files or folders, such as `README.md`; line cites go in the answer.

Finalize measures each named file inside the folder `connect_project_source` bound; it never binds one. An answered `abilities`, `evidence` or `impact` row is held to the coverage each write reports: while it names work, do it or mark the row `partial`.

Example: `{\"projectSlug\":\"billing\",\"expected_mtime\":1795104500785.9,\"answers\":[{\"id\":\"scope\",\"status\":\"answered\",\"answer\":\"Billing lets an operator invoice a customer.\",\"concepts\":[\"billing\"],\"evidence\":[\"README.md\"]}, ...one row for each id above]}`";

#[derive(Serialize)]
struct Finalized<'a> {
    ok: bool,
    changed: bool,
    contract: &'static str,
    #[serde(rename = "projectSlug")]
    project_slug: &'a str,
    #[serde(rename = "bodyDigest")]
    body_digest: &'a str,
    #[serde(rename = "graphHash")]
    graph_hash: &'a str,
    #[serde(rename = "sourceFingerprint")]
    source_fingerprint: &'a str,
    #[serde(rename = "measuredAt")]
    measured_at: &'a str,
    #[serde(rename = "meaningAssessment")]
    meaning_assessment: &'a Assessment,
}

/// Whether the receipt measured, for the ontology as it is now, every path an answer cites.
fn receipt_measures_every_claim(receipt: &SourceReceipt, graph_hash: &str, claims: &[WitnessClaim]) -> bool {
    if receipt.graph_hash != graph_hash {
        return false;
    }
    let measured: std::collections::HashSet<&str> = receipt
        .witnesses
        .iter()
        .filter(|witness| {
            claims
                .iter()
                .any(|claim| claim.node_slug == witness.node_slug && claim.path == witness.path)
        })
        .map(|witness| witness.path.as_str())
        .collect();
    claims.iter().all(|claim| measured.contains(claim.path.as_str()))
}

/// Measures again the folder this project is already bound to, as `connect_project_source`
/// without `rootPath` does; it never chooses or infers a folder. A failure is returned, not
/// thrown: the stored receipt may still resolve every answered row.
fn remeasure_bound_source(
    call: &crate::dispatch::CallContext<'_>,
    project_slug: &str,
    graph_hash: &str,
    claims: &[WitnessClaim],
) -> Result<Measured, String> {
    let bindings = read_source_bindings(&call.config().vault_root);
    let held = match &bindings {
        BindingsRead::Ok(_) => bindings.bound_to(project_slug),
        _ => Vec::new(),
    };
    let [only] = held.as_slice() else {
        return Err(format!("\"{project_slug}\" has no single connected source folder"));
    };
    measure_source(call, project_slug, graph_hash, std::path::Path::new(&only.root_path), claims)
        .map_err(|error| format!("the connected source folder could not be measured ({error})"))
}

static UNRESOLVED_ROW: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^no `- (Concepts|Relations|Evidence|Paths):` row")
        .unwrap_or_else(|error| unreachable!("a built-in pattern is invalid: {error}"))
});

/// The fields of `answers[i]` a list of witness problems points at, once each, in the order found.
fn unresolved_fields(problems: &[String]) -> Vec<String> {
    let mut fields: Vec<String> = Vec::new();
    for problem in problems {
        let field = if let Some(found) = UNRESOLVED_ROW.captures(problem) {
            found[1].to_lowercase()
        } else if problem.starts_with("concept ") {
            "concepts".to_string()
        } else if problem.contains("relation") {
            "relations".to_string()
        } else if problem.starts_with("evidence ") {
            "evidence".to_string()
        } else if problem.starts_with("path ") {
            "paths".to_string()
        } else {
            continue;
        };
        if !fields.contains(&field) {
            fields.push(field);
        }
    }
    fields
}

/// Why finalize refuses an answered row whose witnesses do not resolve, one line per row, each
/// naming the field of `answers` to change.
fn competency_refusal(
    rows: &[UnresolvedRow],
    answer_indexes: Option<&HashMap<String, usize>>,
    measurement_failure: Option<&str>,
) -> String {
    let mut message = vec![format!(
        "finalize_project_meaning blocked: {} answered row(s) cite witnesses that do not resolve. Nothing was written.",
        rows.len()
    )];
    if let Some(failure) = measurement_failure {
        message.push(format!("Newly cited files were not measured: {failure}. Call connect_project_source with the folder's rootPath and confirm: true."));
    }
    for row in rows {
        let reasons: Vec<String> = row
            .problems
            .iter()
            .map(|problem| {
                if measurement_failure.is_some() {
                    problem.clone()
                } else {
                    problem.replace(
                        " is not a measured source witness",
                        " is not a file in the connected source folder",
                    )
                }
            })
            .collect();
        let reasons = reasons.join("; ");
        let Some(indexes) = answer_indexes else {
            message.push(format!("- {}: {reasons}. Repair that row, or pass `answers` and finalize rewrites the section.", row.id));
            continue;
        };
        let at = format!("answers[{}]", indexes.get(&row.id).copied().unwrap_or_default());
        let fields: Vec<String> = unresolved_fields(&row.problems)
            .into_iter()
            .map(|field| format!("{at}.{field}"))
            .collect();
        let change = if fields.is_empty() { at.clone() } else { fields.join(" or ") };
        message.push(format!("- {at} {}: {reasons}. Change {change}, or set its status \"partial\" with a gap.", row.id));
    }
    message.join("\n")
}

fn depth_refusal(refusals: &[String], answers_given: bool) -> String {
    let fallback = if answers_given {
        "Make the call each row names and finalize again, or set that row's status \"partial\" with a gap."
    } else {
        "Make the call each row names and finalize again; marking a row partial is the fallback when the map cannot be repaired."
    };
    let mut lines = vec![format!(
        "finalize_project_meaning blocked: {} answered row(s) claim more than the map holds. Nothing was written.",
        refusals.len()
    )];
    lines.extend(refusals.iter().cloned());
    lines.push(fallback.to_string());
    lines.join("\n")
}

/// The refusals an answered row meets in the map's depth and in the project's `Not mapped yet`
/// lines, in one message so a builder repairs them in one round; `None` when every row passes.
fn depth_message(
    call: &crate::dispatch::CallContext<'_>,
    documents: &[LoadedDocument],
    project_slug: &str,
    project_body: &str,
    answered: &[&str],
    answers_given: bool,
) -> Result<Option<String>, ToolError> {
    let config = call.config();
    let target = if !config.repo_grounded {
        None
    } else {
        Some(ScanTarget::allow_named(call, None, "repoRoot")?)
    };
    let disk = target
        .as_ref()
        .filter(|target| !target.reads_census())
        .map(|target| target.source_with_limit(WITNESS_TEXT_MAX_BYTES));
    let census = match &target {
        Some(target) if target.reads_census() => Some(target.census_run()?),
        _ => None,
    };
    let source: Option<&dyn SourceFiles> = match (&disk, &census) {
        (Some(disk), _) => Some(disk),
        (None, Some(census)) => Some(census),
        (None, None) => None,
    };
    let survey: Option<std::sync::Arc<Survey>> = target
        .as_ref()
        .filter(|_| source.is_some())
        .and_then(|target| kept_survey(call, target, &[]).ok());
    let reads: Option<ReadsUnder> = target.as_ref().map(|target| {
        if target.reads_census() {
            ReadsUnder {
                reads: HashMap::new(),
                cited: HashMap::new(),
            }
        } else {
            call.source_reads().reads_under(target.source_root())
        }
    });
    let surveyed = survey
        .as_deref()
        .filter(|survey| !survey.collection.units.is_empty());
    let depth = measure_build_depth(&BuildDepthInput {
        documents,
        survey: surveyed,
        reads: reads.as_ref(),
        source: surveyed.and(source),
    });
    let refusals = competency_depth_refusals(answered, &depth);
    let lines = not_mapped_lines_refusal(project_slug, project_body, &depth);
    if refusals.is_empty() && lines.is_none() {
        return Ok(None);
    }
    let mut message: Vec<String> = Vec::new();
    if !refusals.is_empty() {
        message.push(depth_refusal(&refusals, answers_given));
    }
    message.extend(lines);
    Ok(Some(message.join("\n")))
}

fn answered_ids(rows: &[AnswerRow]) -> Vec<&'static str> {
    rows.iter()
        .filter(|row| row.status == AnswerStatus::Answered)
        .map(|row| row.id)
        .collect()
}

/// The competency block of the rows the body holds, as the inventory it is judged against.
fn competency_of(rows: &[AnswerRow], graph_hash: &str, inventory: &Inventory) -> CompetencyBlock {
    CompetencyBlock {
        contract: COMPETENCY_CONTRACT.to_string(),
        receipt_version: 1,
        evaluator: COMPETENCY_EVALUATOR.to_string(),
        graph_hash: Some(graph_hash.to_string()),
        inventory: Some(inventory.clone()),
        questions: rows.iter().map(QuestionRow::of).collect(),
        body_matches_receipt: None,
    }
}

fn disk_modified(document: &LoadedDocument) -> Option<ModifiedTime> {
    document.modified_ms().map(ModifiedTime::from_milliseconds)
}

fn body_of(document: &LoadedDocument) -> Result<String, ToolError> {
    document
        .body()
        .map(std::borrow::Cow::into_owned)
        .map_err(|error| ToolError::failed(error.to_string()))
}

/// The audit line the written body earns, left the moment the body is on disk.
fn leave_audit_line(
    permit: &Permit<'_>,
    slug: &str,
) -> Result<(), ToolError> {
    let context = permit.context();
    let documents = VaultView::read(permit)?;
    let coverage = measure_coverage(context, documents.documents());
    let counts = share_counts(coverage.as_ref(), source_state(context));
    let record = WriteRecord::Wrote {
        activity: ActivityContent {
            target: slug.to_string(),
            summary: format!("finalize_project_meaning {slug} competency answers"),
            why: None,
            logged_as: None,
        },
        concepts: effect(&[], &[slug], &[]),
        share: ShareMeasure::Measure(Box::new(move || counts)),
    };
    if let Err(error) = context
        .audit()
        .record(WriteTool::FinalizeProjectMeaning, &context.client_name(), record)
    {
        eprintln!("[ontology-atlas-mcp] audit line not written after {TOOL}: {error}");
    }
    Ok(())
}

fn replaced_body_documents(
    documents: &[LoadedDocument],
    project_slug: &str,
    body: &str,
) -> Vec<LoadedDocument> {
    documents
        .iter()
        .map(|document| {
            if document.slug() == project_slug {
                document.with_body(body)
            } else {
                document.clone()
            }
        })
        .collect()
}

#[allow(clippy::too_many_lines, reason = "one ordered flow: every refusal precedes the first write")]
pub fn call(permit: &Permit<'_>, arguments: &Arguments) -> Result<WriteDone, ToolError> {
    let call = permit.context();
    let project_name = optional_non_blank_text(arguments, "projectSlug")?;
    let expected_mtime = optional_non_negative_number(arguments, "expected_mtime")?;
    let Some(project_name) = project_name else {
        return Err(plain_refusal("projectSlug is required."));
    };
    let Some(expected_mtime) = expected_mtime else {
        return Err(plain_refusal("expected_mtime is required."));
    };
    let answers: Option<OrderedJson> = arguments.read("answers")?;
    let rendered = match &answers {
        Some(answers) => Some(render_competency_answers(answers).map_err(plain_refusal)?),
        None => None,
    };
    let answers_given = rendered.is_some();

    let view = VaultView::read(permit)?;
    let Some(slug) = existing_slug(view.root(), view.documents(), &project_name)? else {
        return Err(missing_project(&project_name));
    };
    let Some(project_document) = view
        .document(&slug)
        .filter(|document| document.frontmatter().text("kind") == Some("project"))
    else {
        return Err(plain_refusal(format!(
            "{TOOL} requires a kind: project node; received \"{slug}\"."
        )));
    };
    // With `answers` the server replaces only its own section in the body as it is now, so the
    // caller's view of the file cannot overwrite an edit; a relation write just before this call
    // moves the project's mtime and is no conflict.
    if !answers_given {
        require_current(&slug, Some(expected_mtime), disk_modified(project_document))?;
    } else {
        require_not_reserved(Some(project_document), TOOL)?;
    }

    let report = build_report(call, view.root(), view.documents(), None)?;
    if report.list.summary.error_files > 0 {
        return Err(plain_refusal(format!(
            "{TOOL} blocked: validate_vault found {} file(s) with errors. Repair them before finalizing.",
            report.list.summary.error_files
        )));
    }

    let disk_body = body_of(project_document)?;
    let project_body = match &rendered {
        Some(rendered) => with_competency_section(&disk_body, &rendered.section),
        None => disk_body.clone(),
    };
    let documents = if answers_given {
        replaced_body_documents(view.documents(), &slug, &project_body)
    } else {
        view.documents().to_vec()
    };
    let graph = call
        .compiled_graph()
        .read(call)
        .map_err(|error| ToolError::failed(error.to_string()))?;
    let validation = ValidationCounts {
        error_files: report.list.summary.error_files,
        warning_files: report.list.summary.warning_files,
        path_drifts: report.frame.path_drift.drifts.len(),
    };
    let structure = structure_readiness(&graph, validation);
    let context = project_meaning_context(call, &graph, &documents, &slug, Some(&project_body));
    let inventory = match (&context.graph_hash, &context.inventory) {
        (Some(_), Ok(inventory)) => inventory,
        (_, Err(unavailable)) => {
            return Err(plain_refusal(format!(
                "{TOOL} blocked: current project witness inventory is unavailable ({}).",
                unavailable.reason()
            )))
        }
        (None, Ok(_)) => {
            return Err(plain_refusal(format!(
                "{TOOL} blocked: current project witness inventory is unavailable (invalid_graph_hash)."
            )))
        }
    };
    let Some(graph_hash) = context.graph_hash.clone() else {
        return Err(plain_refusal(format!(
            "{TOOL} blocked: current project witness inventory is unavailable (invalid_graph_hash)."
        )));
    };
    let Some(stored_receipt) = context.view.receipt.as_ref() else {
        return Err(plain_refusal(format!(
            "{TOOL} blocked: a valid project source receipt is required first. Call connect_project_source({{projectSlug:\"{slug}\", confirm:true}})."
        )));
    };
    let competency = parse_competency_markdown(&project_body).map_err(|fault| {
        if answers_given {
            plain_refusal(format!("{TOOL} could not render `answers`: {}", fault.0))
        } else {
            plain_refusal(format!("{}. {}", fault.0, answers_hint()))
        }
    })?;

    let mut remeasured: Option<Measured> = None;
    let mut measurement_failure: Option<String> = None;
    if !receipt_measures_every_claim(stored_receipt, &graph_hash, &context.claims) {
        match remeasure_bound_source(call, &slug, &graph_hash, &context.claims) {
            Ok(measured) => remeasured = Some(measured),
            Err(failure) => measurement_failure = Some(failure),
        }
    }
    let rebuilt: Option<Inventory> = match &remeasured {
        Some(measured) => {
            let built = meaning_inventory(
                call,
                &graph,
                &slug,
                &context.scope,
                Some(&project_body),
                Some(&measured.receipt),
            );
            match built {
                Ok(inventory) => Some(inventory),
                Err(unavailable) => {
                    return Err(plain_refusal(format!(
                        "{TOOL} blocked: the measured witness inventory is unavailable ({}).",
                        unavailable.reason()
                    )))
                }
            }
        }
        None => None,
    };
    let judged_inventory = rebuilt.as_ref().unwrap_or(inventory);

    let answer_indexes: Option<HashMap<String, usize>> = match &answers {
        Some(OrderedJson::List(rows)) => Some(
            rows.iter()
                .enumerate()
                .filter_map(|(index, row)| match row.get("id") {
                    Some(OrderedJson::Text(id)) => Some((id.clone(), index)),
                    _ => None,
                })
                .collect(),
        ),
        _ => None,
    };
    let unresolved = unresolved_competency_rows(&competency_of(&competency, &graph_hash, judged_inventory));
    if !unresolved.is_empty() {
        return Err(plain_refusal(competency_refusal(
            &unresolved,
            answer_indexes.as_ref(),
            measurement_failure.as_deref(),
        )));
    }
    // An `answered` the map contradicts: most entry files never read this session, units or entry
    // points no node places, or almost no dependency recorded.
    if let Some(message) = depth_message(
        call,
        &documents,
        &slug,
        &project_body,
        &answered_ids(&competency),
        answers_given,
    )? {
        return Err(plain_refusal(message));
    }

    let vault = &call.config().vault_root;
    let mut stored_body = project_body.clone();
    if answers_given && project_body != disk_body {
        patch_document(
            permit,
            &view,
            &slug,
            &Vec::new(),
            Some(&project_body),
            modified_ms(project_document.file()),
        )?;
        let after = VaultView::read(permit)?;
        stored_body = after
            .document(&slug)
            .map(body_of)
            .transpose()?
            .unwrap_or_else(|| project_body.clone());
        // The body is on disk whatever the receipt write does, so it is logged here.
        leave_audit_line(permit, &slug)?;
    }
    if let Some(measured) = &remeasured {
        write_source_binding(vault, &measured.binding(&slug), false)
            .map_err(|failure| binding_failure(TOOL, failure))?;
    }
    let source_fingerprint = remeasured
        .as_ref()
        .map_or(stored_receipt.source_fingerprint.as_str(), |measured| {
            measured.receipt.source_fingerprint.as_str()
        })
        .to_string();
    let measured_at = answer_format::iso_time::to_iso_string(crate::audit::now_ms());
    let receipt = finalize_meaning_receipt(
        vault,
        &ReceiptSubject {
            project_slug: &slug,
            project_body: &stored_body,
            graph_hash: &graph_hash,
            source_fingerprint: &source_fingerprint,
            measured_at: &measured_at,
        },
    )
    .map_err(|failure| plain_refusal(failure.0))?;

    let assessment = if remeasured.is_some() {
        let after = VaultView::read(permit)?;
        let fresh = project_meaning_context(call, &graph, after.documents(), &slug, Some(&stored_body));
        let source = SourceFacts::of_view(&fresh.view);
        let inventory = fresh.inventory.as_ref().ok();
        let assessment = read_meaning_assessment(
            vault,
            &AssessedProject {
                project_slug: &slug,
                project_body: Some(&stored_body),
                graph_hash: fresh.graph_hash.as_deref(),
                structure_status: Some(structure),
                source: &source,
                inventory,
            },
        );
        assessment
    } else {
        let source = SourceFacts::of_view(&context.view);
        read_meaning_assessment(
            vault,
            &AssessedProject {
                project_slug: &slug,
                project_body: Some(&stored_body),
                graph_hash: Some(&graph_hash),
                structure_status: Some(structure),
                source: &source,
                inventory: Some(inventory),
            },
        )
    };
    let answer = Finalized {
        ok: true,
        changed: true,
        contract: RECEIPT_CONTRACT,
        project_slug: &slug,
        body_digest: &receipt.body_digest,
        graph_hash: &receipt.graph_hash,
        source_fingerprint: &receipt.source_fingerprint,
        measured_at: &receipt.measured_at,
        meaning_assessment: &assessment,
    };
    Ok(WriteDone {
        output: ToolOutput::json(&answer)?,
        record: WriteRecord::Nothing,
    })
}
