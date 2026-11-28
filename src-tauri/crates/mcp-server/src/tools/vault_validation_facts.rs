//! What the briefs and the plans take from the vault's validation: the first page of its findings
//! as one more health check (`health`, `workspace_brief`), and the summaries whose membership
//! outran their description (`maintenance_plan`).

use ontology_graph::{StaleSummary, VaultValidationFacts};
use vault_validation::{page_validation, summary_freshness, PageRequest};

use super::read_vault::read_vault;
use super::vault_repository::{locate, Located};
use super::vault_validation_report::build_report;
use crate::dispatch::CallContext;
use crate::error::ToolError;

/// The validation of the vault against the repository the server was started for.
pub fn validation_facts(context: &CallContext<'_>) -> Result<VaultValidationFacts, ToolError> {
    let read = read_vault(context)?;
    let report = build_report(context, &read.root, read.vault.documents(), None)?;
    let page = page_validation(&report.frame, &report.list, &PageRequest::brief());
    let brief =
        answer_format::json::to_raw(&page).map_err(|error| ToolError::failed(error.to_string()))?;
    Ok(VaultValidationFacts {
        brief,
        error_files: report.list.summary.error_files,
        warning_files: report.list.summary.warning_files,
        path_drifts: report.frame.path_drift.drifts.len(),
        paths_checked: report.frame.path_drift.checked,
        repo_root: Some(report.frame.path_drift.repo_root.clone()),
    })
}

/// The summaries `maintenance_plan` lists as behind, none when the vault has no Git history to
/// read: not looking is not finding nothing, and the plan says nothing it did not check.
pub fn stale_summaries(context: &CallContext<'_>) -> Result<Vec<StaleSummary>, ToolError> {
    let read = read_vault(context)?;
    let documents = read.vault.documents();
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
    if !freshness.checked {
        return Ok(Vec::new());
    }
    Ok(freshness
        .stale
        .iter()
        .map(|row| StaleSummary {
            slug: row.slug().to_string(),
            score: row.score(),
            hint: row.hint().to_string(),
        })
        .collect())
}
