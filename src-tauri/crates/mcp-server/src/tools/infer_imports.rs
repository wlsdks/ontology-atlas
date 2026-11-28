//! `infer_imports`: the static imports of a repository read from its source, with the vault
//! reconciliation that says which of them the ontology already records. A scan too large to send
//! whole becomes one review packet; a `focusPath` pages through one file's imports. Read-only.

use std::collections::HashSet;

use source_scan::{
    build_import_impact_focus, build_next_relation_review, choose_automatic_import_delivery,
    reconcile_import_edges, resolve_import_review_mode, summarize_reconciliation, Delivery,
    DeliveryRefusal, FocusDirection, FocusRequest, ImportScan, ImportScanOptions, ModeArguments,
    Reconciliation, ReconciliationSummary, ReviewMode, DEFAULT_FOCUS_LIMIT, MAX_FOCUS_LIMIT,
};

use super::argument_checks::{
    optional_boolean, optional_non_blank_text, optional_one_of, optional_positive_integer,
    optional_text_list,
};
use super::import_answers::{
    FocusAnswer, FullEvidenceArguments, FullEvidenceCall, PackageEvidenceSummary, Reconciled,
    ReviewAnswer, ReviewQueueState, ScanSummary, StaleEdgeFollowUp, WholeScan,
};
use super::import_scan_target::ScanTarget;
use super::reply_bytes::reply_bytes;
use super::vault_facts::vault_facts_of;
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::ToolError;

const SOURCE_FOLDER_MAX_ITEMS: usize = 50;
const IGNORE_MAX_ITEMS: usize = 200;
const MAX_FILES_MAX: f64 = 50_000.0;

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "each number was checked to be a whole number between one and its maximum"
)]
fn count(number: f64) -> usize {
    number as usize
}

/// What the call asked, once every argument is checked.
struct Request {
    root_path: Option<String>,
    source_folders: Option<Vec<String>>,
    ignore: Option<Vec<String>>,
    max_files: Option<usize>,
    reconcile: Option<bool>,
    review_mode: Option<ReviewMode>,
    allow_large_response: Option<bool>,
    after_review_id: Option<String>,
    focus_path: Option<String>,
    focus_direction: Option<FocusDirection>,
    focus_limit: Option<usize>,
    focus_after_edge_id: Option<String>,
}

fn read_request(arguments: &Arguments) -> Result<Request, ToolError> {
    Ok(Request {
        root_path: optional_non_blank_text(arguments, "rootPath")?,
        source_folders: optional_text_list(arguments, "sourceFolders", SOURCE_FOLDER_MAX_ITEMS)?,
        ignore: optional_text_list(arguments, "ignore", IGNORE_MAX_ITEMS)?,
        max_files: optional_positive_integer(arguments, "maxFiles", Some(MAX_FILES_MAX))?
            .map(count),
        reconcile: optional_boolean(arguments, "reconcile")?,
        review_mode: optional_one_of(arguments, "reviewMode", &["full", "next", "focus"])?
            .and_then(ReviewMode::parse),
        allow_large_response: optional_boolean(arguments, "allowLargeResponse")?,
        after_review_id: optional_non_blank_text(arguments, "afterReviewId")?,
        focus_path: optional_non_blank_text(arguments, "focusPath")?,
        focus_direction: optional_one_of(
            arguments,
            "focusDirection",
            &["incoming", "outgoing", "both"],
        )?
        .and_then(FocusDirection::parse),
        focus_limit: optional_positive_integer(
            arguments,
            "focusLimit",
            Some(MAX_FOCUS_LIMIT as f64),
        )?
        .map(count),
        focus_after_edge_id: optional_non_blank_text(arguments, "focusAfterEdgeId")?,
    })
}

impl Request {
    fn mode_arguments(&self) -> ModeArguments {
        ModeArguments {
            review_mode: self.review_mode,
            reconcile: self.reconcile,
            allow_large_response: self.allow_large_response,
            has_after_review_id: self.after_review_id.is_some(),
            has_focus_path: self.focus_path.is_some(),
            has_focus_options: self.focus_direction.is_some()
                || self.focus_limit.is_some()
                || self.focus_after_edge_id.is_some(),
        }
    }

    fn scan_options(&self) -> ImportScanOptions {
        ImportScanOptions {
            source_folders: self.source_folders.clone(),
            ignore: self.ignore.clone().unwrap_or_default(),
            max_files: self.max_files,
            workspace_packages: None,
        }
    }
}

/// The values of `names` once, in the order first met.
fn unique(names: &[String]) -> Vec<&str> {
    let mut seen = HashSet::new();
    names
        .iter()
        .map(String::as_str)
        .filter(|name| seen.insert(*name))
        .collect()
}

fn package_evidence<'a>(
    scan: &'a ImportScan,
    request: &'a Request,
) -> Option<PackageEvidenceSummary<'a>> {
    let receipt = scan.package_import_evidence.as_ref()?;
    Some(PackageEvidenceSummary {
        contract: "goPackageImports:v1",
        files_scanned: receipt.files_scanned,
        file_scan_limited: receipt.file_scan_limited,
        package_imports: receipt.package_imports.len(),
        module_edges: receipt.module_edges.len(),
        full_evidence_call: FullEvidenceCall {
            tool: "infer_imports",
            arguments: FullEvidenceArguments {
                root_path: &scan.root_path,
                source_folders: request.source_folders.as_deref().map(unique),
                ignore: request.ignore.as_deref().map(unique),
                max_files: request.max_files,
                review_mode: "full",
                allow_large_response: true,
            },
            purpose: "Read the complete typed Go package-import evidence; focus only contains legacy file edges.",
        },
    })
}

fn focus_answer(scan: &ImportScan, request: &Request) -> Result<ToolOutput, ToolError> {
    let focus_path = request.focus_path.as_deref().unwrap_or_default();
    let mut focus_review = build_import_impact_focus(
        &scan.edges,
        &FocusRequest {
            focus_path,
            direction: request.focus_direction.unwrap_or(FocusDirection::Both),
            limit: request.focus_limit.unwrap_or(DEFAULT_FOCUS_LIMIT),
            after_edge_id: request.focus_after_edge_id.as_deref(),
        },
    )?;
    let package_evidence = package_evidence(scan, request);
    if package_evidence.is_some() {
        focus_review.interpretation.push_str(" This focus response covers legacy file edges only; use the explicit full-evidence call for typed Go package imports.");
    }
    ToolOutput::json(&FocusAnswer {
        contract: "inferImportsFocus:v1",
        root_path: &scan.root_path,
        files_scanned: scan.files_scanned,
        coverage: &scan.coverage,
        scan_summary: ScanSummary::of(scan),
        package_evidence,
        focus_review,
    })
}

/// The vault's `depends_on` edges against the scan's module edges; `None` when no vault can be
/// read, which never fails the scan (a foreign repository has none).
fn reconcile(
    context: &CallContext<'_>,
    scan: &ImportScan,
) -> Option<(Reconciliation, ReconciliationSummary)> {
    let graph = context.compiled_graph().read(context).ok()?;
    let reconciliation = reconcile_import_edges(&scan.module_edges, &vault_facts_of(&graph));
    let summary = summarize_reconciliation(&reconciliation, scan.unresolved.len());
    Some((reconciliation, summary))
}

/// The answer whose JSON text is already written.
fn answer_of_text(text: String) -> Result<ToolOutput, ToolError> {
    let raw = serde_json::value::RawValue::from_string(text)
        .map_err(|error| ToolError::failed(format!("The answer could not be written: {error}")))?;
    ToolOutput::json(&raw)
}

fn delivery_failure(refused: DeliveryRefusal) -> ToolError {
    use source_scan::AUTOMATIC_LIMIT_BYTES as LIMIT;
    match refused {
        DeliveryRefusal::LargeResponseConfirmationRequired { estimated_bytes } => {
            ToolError::large_response(refused.message(), estimated_bytes, LIMIT)
        }
        DeliveryRefusal::CompactNeedsReconciliation { estimated_bytes } => {
            ToolError::compact_unavailable(refused.message(), estimated_bytes, LIMIT)
        }
    }
}

pub fn call(context: &CallContext<'_>, arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let request = read_request(arguments)?;
    let requested_mode = resolve_import_review_mode(&request.mode_arguments())?;
    let target = ScanTarget::open(context, request.root_path.as_deref())?;
    let scan = target.scan(&request.scan_options());

    if requested_mode == Some(ReviewMode::Focus) {
        return focus_answer(&scan, &request);
    }

    let reconciled = if request.reconcile == Some(false) {
        None
    } else {
        Some(reconcile(context, &scan))
    };
    let whole = |scan: &ImportScan| {
        let view = match &reconciled {
            None => Reconciled::NotAsked {},
            Some(None) => Reconciled::NoVault {
                reconciliation: None,
            },
            Some(Some((reconciliation, summary))) => Reconciled::Done {
                reconciliation,
                summary,
            },
        };
        answer_format::json::to_string(&WholeScan {
            scan,
            reconciled: view,
        })
        .map_err(|error| ToolError::failed(format!("The answer could not be written: {error}")))
    };

    let mut mode = requested_mode.unwrap_or(ReviewMode::Full);
    let mut delivery = None;
    let asked_whole_without_confirming =
        request.review_mode == Some(ReviewMode::Full) && request.allow_large_response != Some(true);
    if request.review_mode.is_none() || asked_whole_without_confirming {
        let text = whole(&scan)?;
        let choice = choose_automatic_import_delivery(
            request.review_mode,
            request.reconcile,
            matches!(reconciled, Some(Some(_))),
            reply_bytes(&text),
        )
        .map_err(delivery_failure)?;
        match choice {
            Delivery::Whole => return answer_of_text(text),
            Delivery::Compact(compact) => {
                mode = ReviewMode::Next;
                delivery = Some(compact);
            }
        }
    }

    if mode == ReviewMode::Next {
        let Some(Some((reconciliation, summary))) = &reconciled else {
            return Err(ToolError::failed(
                "reviewMode \"next\" requires a loadable active vault so import candidates can be reconciled against existing ontology nodes.",
            ));
        };
        let next_review = build_next_relation_review(
            reconciliation,
            request.after_review_id.as_deref(),
            &scan.root_path,
        )?;
        return ToolOutput::json(&ReviewAnswer {
            contract: "inferImportsReview:v1",
            delivery,
            root_path: &scan.root_path,
            files_scanned: scan.files_scanned,
            coverage: &scan.coverage,
            scan_summary: ScanSummary::of(&scan),
            package_evidence: package_evidence(&scan, &request),
            reconciliation_summary: summary,
            stale_edge_follow_up: StaleEdgeFollowUp::of(&scan.root_path, reconciliation),
            review_queue: ReviewQueueState {
                total: next_review.as_ref().map_or(0, |review| review.cursor.total),
                returned: usize::from(next_review.is_some()),
                exhausted: next_review.is_none(),
                after_review_id: request.after_review_id.as_deref(),
            },
            next_review,
        });
    }

    answer_of_text(whole(&scan)?)
}
