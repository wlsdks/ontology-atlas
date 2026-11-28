//! The survey of the repository a tool call is about, kept by the session until the repository
//! changes: `analyze_repo_structure` and `validate_vault` ask the same question and share the
//! answer.

use std::sync::Arc;

use repository_survey::{survey_of_census, Survey, SurveyAsked, SurveyFiles};

use super::import_scan_target::ScanTarget;
use crate::dispatch::CallContext;
use crate::error::ToolError;

/// A source file over this many bytes is generated or data, never read as code.
const SURVEY_FILE_BYTES: usize = 1024 * 1024;

/// The folder the vault lies in below `root`, `/`-separated; `None` when the vault is the root or
/// outside it.
fn vault_below(root: &std::path::Path, vault_root: &std::path::Path) -> Option<String> {
    let below = vault_root.strip_prefix(root).ok()?;
    let parts: Vec<String> = below
        .components()
        .map(|part| part.as_os_str().to_string_lossy().into_owned())
        .collect();
    (!parts.is_empty()).then(|| parts.join("/"))
}

fn asked_of(context: &CallContext<'_>, target: &ScanTarget, ignore: &[String]) -> SurveyAsked {
    SurveyAsked {
        label: target.label.clone(),
        ignore: ignore.to_vec(),
        vault_exclusion: vault_below(target.root(), &context.config().vault_root),
    }
}

/// The survey of the target. Read from the census it is made anew from the census alone, never
/// kept, and a census that is missing or unusable refuses the call.
pub fn kept_survey(
    context: &CallContext<'_>,
    target: &ScanTarget,
    ignore: &[String],
) -> Result<Arc<Survey>, ToolError> {
    if target.reads_census() {
        let reading = target.census_run()?;
        let imports = target.census_run()?;
        return Ok(Arc::new(survey_of_census(
            &SurveyFiles::new(&reading),
            &imports,
            &asked_of(context, target, ignore),
        )));
    }
    Ok(survey_from_disk(context, target, ignore))
}

/// The survey of the target read from the disk and kept by the session. `validate_vault` asks for
/// it whatever the census says: it measures the vault's evidence against the repository's files.
pub fn survey_from_disk(
    context: &CallContext<'_>,
    target: &ScanTarget,
    ignore: &[String],
) -> Arc<Survey> {
    let source = target.source_with_limit(SURVEY_FILE_BYTES);
    let files = SurveyFiles::new(&source);
    context.survey_cache().survey(
        target.source_root(),
        &files,
        &asked_of(context, target, ignore),
    )
}
