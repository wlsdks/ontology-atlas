//! The shapes `infer_imports` answers in, beside the whole scan: the compact review of a scan too
//! large to send, and the page of one file's imports. Field order is the key order an agent
//! reads.

use serde::Serialize;

use source_scan::{
    CompactDelivery, ImportCoverage, ImportImpactFocus, ImportScan, NextRelationReview,
    Reconciliation, ReconciliationSummary,
};

/// What the whole scan holds besides the reconciliation, counted.
#[derive(Serialize)]
pub struct ScanSummary {
    #[serde(rename = "fileEdges")]
    file_edges: usize,
    #[serde(rename = "externalImports")]
    external_imports: usize,
    #[serde(rename = "unresolvedImports")]
    unresolved_imports: usize,
    #[serde(rename = "moduleEdges")]
    module_edges: usize,
}

impl ScanSummary {
    pub fn of(scan: &ImportScan) -> Self {
        Self {
            file_edges: scan.edges.len(),
            external_imports: scan.external_imports.len(),
            unresolved_imports: scan.unresolved.len(),
            module_edges: scan.module_edges.len(),
        }
    }
}

/// How the call would be repeated to read the whole Go package-import evidence.
#[derive(Serialize)]
pub struct FullEvidenceArguments<'a> {
    #[serde(rename = "rootPath")]
    pub root_path: &'a str,
    #[serde(rename = "sourceFolders", skip_serializing_if = "Option::is_none")]
    pub source_folders: Option<Vec<&'a str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ignore: Option<Vec<&'a str>>,
    #[serde(rename = "maxFiles", skip_serializing_if = "Option::is_none")]
    pub max_files: Option<usize>,
    #[serde(rename = "reviewMode")]
    pub review_mode: &'static str,
    #[serde(rename = "allowLargeResponse")]
    pub allow_large_response: bool,
}

#[derive(Serialize)]
pub struct FullEvidenceCall<'a> {
    pub tool: &'static str,
    pub arguments: FullEvidenceArguments<'a>,
    pub purpose: &'static str,
}

/// The Go package-import evidence of a scan, counted, with the call that reads it whole.
#[derive(Serialize)]
pub struct PackageEvidenceSummary<'a> {
    pub contract: &'static str,
    #[serde(rename = "filesScanned")]
    pub files_scanned: usize,
    #[serde(rename = "fileScanLimited")]
    pub file_scan_limited: bool,
    #[serde(rename = "packageImports")]
    pub package_imports: usize,
    #[serde(rename = "moduleEdges")]
    pub module_edges: usize,
    #[serde(rename = "fullEvidenceCall")]
    pub full_evidence_call: FullEvidenceCall<'a>,
}

/// The follow-up an agent needs before judging vault edges no import backs.
#[derive(Serialize)]
pub struct StaleEdgeFollowUp<'a> {
    pub status: &'static str,
    pub count: usize,
    #[serde(rename = "nextCall")]
    pub next_call: Option<StaleEdgeCall<'a>>,
}

#[derive(Serialize)]
pub struct StaleEdgeCall<'a> {
    pub tool: &'static str,
    pub arguments: StaleEdgeArguments<'a>,
    pub purpose: &'static str,
}

#[derive(Serialize)]
pub struct StaleEdgeArguments<'a> {
    #[serde(rename = "rootPath")]
    pub root_path: &'a str,
    #[serde(rename = "reviewMode")]
    pub review_mode: &'static str,
    #[serde(rename = "allowLargeResponse")]
    pub allow_large_response: bool,
}

impl<'a> StaleEdgeFollowUp<'a> {
    pub fn of(root_path: &'a str, reconciliation: &Reconciliation) -> Self {
        let count = reconciliation.in_vault_not_in_code.len();
        Self {
            status: if count > 0 {
                "full_follow_up_required"
            } else {
                "not_present"
            },
            count,
            next_call: (count > 0).then_some(StaleEdgeCall {
                tool: "infer_imports",
                arguments: StaleEdgeArguments {
                    root_path,
                    review_mode: "full",
                    allow_large_response: true,
                },
                purpose: "Read full reconciliation before judging stale vault edges; compact delivery omits stale details.",
            }),
        }
    }
}

#[derive(Serialize)]
pub struct ReviewQueueState<'a> {
    pub total: usize,
    pub returned: usize,
    pub exhausted: bool,
    #[serde(rename = "afterReviewId")]
    pub after_review_id: Option<&'a str>,
}

/// The compact review: one packet of the queue, and what else the scan holds.
#[derive(Serialize)]
pub struct ReviewAnswer<'a> {
    pub contract: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delivery: Option<CompactDelivery>,
    #[serde(rename = "rootPath")]
    pub root_path: &'a str,
    #[serde(rename = "filesScanned")]
    pub files_scanned: usize,
    pub coverage: &'a ImportCoverage,
    #[serde(rename = "scanSummary")]
    pub scan_summary: ScanSummary,
    #[serde(
        rename = "packageImportEvidenceSummary",
        skip_serializing_if = "Option::is_none"
    )]
    pub package_evidence: Option<PackageEvidenceSummary<'a>>,
    #[serde(rename = "reconciliationSummary")]
    pub reconciliation_summary: &'a ReconciliationSummary,
    #[serde(rename = "staleEdgeFollowUp")]
    pub stale_edge_follow_up: StaleEdgeFollowUp<'a>,
    #[serde(rename = "reviewQueue")]
    pub review_queue: ReviewQueueState<'a>,
    #[serde(rename = "nextReview")]
    pub next_review: Option<NextRelationReview>,
}

/// The page of one file's imports.
#[derive(Serialize)]
pub struct FocusAnswer<'a> {
    pub contract: &'static str,
    #[serde(rename = "rootPath")]
    pub root_path: &'a str,
    #[serde(rename = "filesScanned")]
    pub files_scanned: usize,
    pub coverage: &'a ImportCoverage,
    #[serde(rename = "scanSummary")]
    pub scan_summary: ScanSummary,
    #[serde(
        rename = "packageImportEvidenceSummary",
        skip_serializing_if = "Option::is_none"
    )]
    pub package_evidence: Option<PackageEvidenceSummary<'a>>,
    #[serde(rename = "focusReview")]
    pub focus_review: ImportImpactFocus,
}

/// What the vault reconciliation added to the whole scan: nothing when it was not asked for,
/// `null` when the vault could not be read, and the diff with its summary otherwise.
#[derive(Serialize)]
#[serde(untagged)]
pub enum Reconciled<'a> {
    NotAsked {},
    NoVault {
        reconciliation: Option<()>,
    },
    Done {
        reconciliation: &'a Reconciliation,
        #[serde(rename = "reconciliationSummary")]
        summary: &'a ReconciliationSummary,
    },
}

/// The whole scan, with its reconciliation after it.
#[derive(Serialize)]
pub struct WholeScan<'a> {
    #[serde(flatten)]
    pub scan: &'a ImportScan,
    #[serde(flatten)]
    pub reconciled: Reconciled<'a>,
}
