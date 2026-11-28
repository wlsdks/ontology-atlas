//! The report of the vault's validation, built once for the tools that show it: `validate_vault`
//! pages it and the briefs carry its first page as one more check.
//!
//! A claim about code is made only against a repository that is known: the one the server was
//! started for when it was found, or the `repoRoot` the call names. Without one the report says
//! what was not measured instead of measuring the working directory.

use build_depth::measure_against_survey;
use confined_files::{SourceFiles, VaultRoot};
use hardened_git::RepoPath;
use meaning_findings::WITNESS_TEXT_MAX_BYTES;
use source_scan::place_folder;
use vault_document::{LoadedDocument, ReferenceIndex};
use vault_validation::{
    collect_issues, evidence_drift, list_problems, path_drift, path_drift_unchecked,
    raw_source_kind_issues, summary_freshness, EvidenceHistory, ProblemList, ValidationFrame,
};

use super::import_scan_target::ScanTarget;
use super::kept_survey::survey_from_disk;
use super::vault_repository::{locate, locate_from, Located};
use crate::dispatch::CallContext;
use crate::error::ToolError;

/// Every row of the validation and what surrounds the rows.
pub struct VaultReport {
    pub frame: ValidationFrame,
    pub list: ProblemList,
}

pub fn build_report(
    context: &CallContext<'_>,
    root: &VaultRoot,
    documents: &[LoadedDocument],
    repo_root: Option<&str>,
) -> Result<VaultReport, ToolError> {
    let index = ReferenceIndex::new(documents);
    let config = context.config();
    let grounded = repo_root.is_some() || config.repo_resolution != "process.cwd";
    let target = ScanTarget::allow_named(context, repo_root, "repoRoot")?;
    let source = target.source_with_limit(WITNESS_TEXT_MAX_BYTES);

    let measured = grounded.then(|| {
        let survey = survey_from_disk(context, &target, &[]);
        let reads = context.source_reads().reads_under(target.source_root());
        measure_against_survey(documents, &survey, &reads, &source)
    });
    let (coverage, survey_findings) = match measured {
        Some(measured) => (measured.coverage, measured.findings),
        None => (None, Vec::new()),
    };
    let issues = collect_issues(
        documents,
        &index,
        grounded.then_some(&source as &dyn SourceFiles),
        raw_source_kind_issues(root),
        survey_findings,
    );
    let list = list_problems(&issues.files, issues.by_slug);

    let freshness = match locate(context, "node_revisions")? {
        Located::Found(found) => summary_freshness(
            documents,
            Ok((&found.repository, &found.scope)),
            context.kept_history(),
        ),
        Located::Missing(missing) => {
            summary_freshness(documents, Err(missing.reason()), context.kept_history())
        }
    };

    let (evidence, drift) = if grounded {
        let evidence = match locate_from(context, "path_last_changes", target.root())? {
            Located::Found(found) => {
                let repo_scope = place_folder(&found.top_level, target.root())
                    .map_or_else(|_| RepoPath::root(), |placed| placed.path);
                evidence_drift(
                    documents,
                    Ok(EvidenceHistory {
                        repository: &found.repository,
                        vault_scope: &found.scope,
                        repo_scope: &repo_scope,
                        repo_files: &source,
                        repo_root: target.source_root(),
                        kept: context.kept_history(),
                    }),
                    &found.top_level.to_string_lossy(),
                )
            }
            Located::Missing(missing) => evidence_drift(documents, Err(Some(missing.reason())), ""),
        };
        (evidence, path_drift(documents, &source, &target.label))
    } else {
        (
            evidence_drift(documents, Err(None), ""),
            path_drift_unchecked(config.repo_root.to_string_lossy().into_owned()),
        )
    };

    Ok(VaultReport {
        frame: ValidationFrame {
            scanned: documents.len(),
            coverage,
            summary_freshness: freshness,
            evidence_drift: evidence,
            path_drift: drift,
        },
        list,
    })
}
