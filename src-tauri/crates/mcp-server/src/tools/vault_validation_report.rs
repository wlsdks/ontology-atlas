//! The report of the vault's validation, built once for the tools that show it: `validate_vault`
//! pages it and the briefs carry its first page as one more check.
//!
//! A claim about code is made only against a repository that is known: the one the server was
//! started for when it was found, or the `repoRoot` the call names. Without one the report says
//! what was not measured instead of measuring the working directory.

use build_depth::{
    finalize_gate, measure_against_survey, measure_build_depth, BuildDepthInput, FinalizeBlock,
};
use confined_files::{DiskSource, SourceFiles, VaultRoot};
use hardened_git::RepoPath;
use meaning_findings::WITNESS_TEXT_MAX_BYTES;
use repository_survey::Survey;
use source_reads::ReadsUnder;
use source_scan::place_folder;
use vault_document::{LoadedDocument, ReferenceIndex};
use vault_validation::{
    collect_issues, evidence_drift, evidence_drift_root_missing, list_problems, path_drift,
    path_drift_root_missing, path_drift_unchecked, raw_source_kind_issues, summary_freshness,
    EvidenceDrift, EvidenceHistory, ProblemList, SummaryFreshness, ValidationFrame,
};

use super::import_scan_target::ScanTarget;
use super::kept_survey::{kept_survey, survey_from_disk};
use super::vault_repository::{locate, locate_from, Located};
use crate::dispatch::CallContext;
use crate::error::ToolError;

/// What `finalize_project_meaning` would hold an answered row to, measured against `survey` when
/// the repository has product units, else against the reads alone.
fn gate_of(
    documents: &[LoadedDocument],
    survey: Option<&Survey>,
    reads: &ReadsUnder,
    source: Option<&dyn SourceFiles>,
) -> Vec<FinalizeBlock> {
    let surveyed = survey.filter(|survey| !survey.collection.units.is_empty());
    let depth = measure_build_depth(&BuildDepthInput {
        documents,
        survey: surveyed,
        reads: Some(reads),
        source: surveyed.and(source),
    });
    finalize_gate(documents, &depth)
}

fn finished<T>(handle: std::thread::ScopedJoinHandle<'_, T>) -> T {
    handle
        .join()
        .unwrap_or_else(|panic| std::panic::resume_unwind(panic))
}

/// Whether each summary node was last written before its membership last changed, from the
/// history of the repository the vault lies in.
fn summary_freshness_of(
    context: &CallContext<'_>,
    documents: &[LoadedDocument],
) -> Result<SummaryFreshness, ToolError> {
    Ok(match locate(context, "node_revisions")? {
        Located::Found(found) => summary_freshness(
            documents,
            Ok((&found.repository, &found.scope)),
            context.kept_history(),
        ),
        Located::Missing(missing) => {
            summary_freshness(documents, Err(missing.reason()), context.kept_history())
        }
    })
}

/// Whether the code each concept cites moved after the concept was last written, from the history
/// of the repository `target` lies in; the cited files themselves are read from `disk`.
fn evidence_from_history(
    context: &CallContext<'_>,
    documents: &[LoadedDocument],
    target: &ScanTarget,
    disk: &DiskSource,
) -> Result<EvidenceDrift, ToolError> {
    Ok(
        match locate_from(context, "path_last_changes", target.root())? {
            Located::Found(found) => {
                let repo_scope = place_folder(&found.top_level, target.root())
                    .map_or_else(|_| RepoPath::root(), |placed| placed.path);
                evidence_drift(
                    documents,
                    Ok(EvidenceHistory {
                        repository: &found.repository,
                        vault_scope: &found.scope,
                        repo_scope: &repo_scope,
                        repo_files: disk,
                        repo_root: target.source_root(),
                        kept: context.kept_history(),
                    }),
                    &found.top_level.to_string_lossy(),
                )
            }
            Located::Missing(missing) => evidence_drift(documents, Err(Some(missing.reason())), ""),
        },
    )
}

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
    // Each check below asks for the bodies it needs; with the cache keeping no text, each would
    // read every capability file again.
    let remembering: Vec<LoadedDocument> = documents
        .iter()
        .map(LoadedDocument::remembering_its_body)
        .collect();
    let documents = remembering.as_slice();
    let index = ReferenceIndex::new(documents);
    let config = context.config();
    let named = repo_root.is_some() || config.repo_grounded;
    let target = ScanTarget::allow_named(context, repo_root, "repoRoot")?;
    // A root that is not there is one finding, not one for each path that cites a file under it. Only
    // a root read from the disk can be missing: a census holds what the app listed.
    let disk_source =
        (named && !target.reads_census()).then(|| target.source_with_limit(WITNESS_TEXT_MAX_BYTES));
    let repo_root_missing = disk_source
        .as_ref()
        .is_some_and(|disk| disk.kind(target.root()) == Ok(None));
    let grounded = named && !repo_root_missing;
    // A claim about code is read from the disk, or from the census when the app supplies one: the
    // census holds no Git history, so what only Git can date is then not measured.
    let disk = disk_source.filter(|_| grounded);
    let census = (grounded && target.reads_census())
        .then(|| target.census_run())
        .transpose()?;
    let source: Option<&dyn SourceFiles> = match (&disk, &census) {
        (Some(disk), _) => Some(disk),
        (None, Some(census)) => Some(census),
        (None, None) => None,
    };

    let empty_reads = || ReadsUnder {
        reads: std::collections::HashMap::new(),
        cited: std::collections::HashMap::new(),
    };
    // What the repository holds (read here, the survey) and what its history says (two runs of
    // `git`, which wait on a process) do not depend on each other, so they run together.
    let history_disk = disk.as_ref();
    let (measured, freshness, history_evidence) = std::thread::scope(|scope| {
        let freshness = scope.spawn(|| summary_freshness_of(context, documents));
        let history_evidence = history_disk
            .map(|disk| scope.spawn(|| evidence_from_history(context, documents, &target, disk)));
        let measured = source.map(|source| {
            if target.reads_census() {
                kept_survey(context, &target, &[]).map(|survey| {
                    let no_reads = empty_reads();
                    let measured = measure_against_survey(documents, &survey, &no_reads, source);
                    let gate = gate_of(documents, Some(&survey), &no_reads, Some(source));
                    (measured, gate)
                })
            } else {
                let survey = survey_from_disk(context, &target, &[]);
                let reads = context.source_reads().reads_under(target.source_root());
                let measured = measure_against_survey(documents, &survey, &reads, source);
                let gate = gate_of(documents, Some(&survey), &reads, Some(source));
                Ok((measured, gate))
            }
        });
        (
            measured,
            finished(freshness),
            history_evidence.map(finished),
        )
    });
    let measured = measured.transpose()?;
    // The gate is read against a repository the call or the server names, even one that is gone:
    // with nothing read, a capability's rule has no read lines to cite.
    let (coverage, survey_findings, finalize_gate) = match measured {
        Some((measured, gate)) => (measured.coverage, measured.findings, Some(gate)),
        None if named => (
            None,
            Vec::new(),
            Some(gate_of(documents, None, &empty_reads(), None)),
        ),
        None => (None, Vec::new(), None),
    };
    let issues = collect_issues(
        documents,
        &index,
        source,
        raw_source_kind_issues(root),
        survey_findings,
    );
    let list = list_problems(&issues.files, issues.by_slug);

    let freshness = freshness?;
    let (evidence, drift) = if repo_root_missing {
        (
            evidence_drift_root_missing(),
            path_drift_root_missing(target.label.clone()),
        )
    } else if let Some(source) = source {
        let evidence = match history_evidence {
            Some(from_history) => from_history?,
            None => evidence_drift(documents, Err(Some("census-has-no-git-history")), ""),
        };
        (evidence, path_drift(documents, source, &target.label))
    } else {
        (
            evidence_drift(documents, Err(None), ""),
            path_drift_unchecked(config.repo_root.to_string_lossy().into_owned()),
        )
    };

    Ok(VaultReport {
        frame: ValidationFrame {
            scanned: documents.len(),
            repo_root_missing,
            coverage,
            finalize_gate,
            summary_freshness: freshness,
            evidence_drift: evidence,
            path_drift: drift,
        },
        list,
    })
}
