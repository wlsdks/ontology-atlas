//! `analyze_repo_structure`: the breadth map of the repository, the first call of every
//! construction. The map is read once on the shared pool by `repository-survey`; `sourceReads`
//! answer from `source-reads`, the reads alone, as text. The arguments of the retired structural
//! analysis never reach this file: `retired_arguments` refuses them first.

use source_reads::{
    fit_source_reads, parse_source_reads, read_source_evidence, render_source_reads,
};

use super::argument_checks::{optional_boolean, optional_non_blank_text, optional_text_list};
use super::import_scan_target::ScanTarget;
use super::kept_survey::kept_survey;
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::ToolError;

const IGNORE_MAX_ITEMS: usize = 200;

/// What a `sourceReads` call is told when the app asked for every read to come from its census.
/// The census holds each file's whole text, but the selectors open a file, check it did not
/// change and name the lines it read by the bytes it stood on, and no census run answers those
/// questions yet.
const CENSUS_HOLDS_NO_SELECTED_READS: &str = "sourceReads is not available while the app supplies a census of the repository (OATLAS_CONFINED_SOURCE_READS=1): reading a selected file or symbol would open the file on the disk, which this mode never does. Call analyze_repo_structure without sourceReads for the breadth map.";

pub fn call(context: &CallContext<'_>, arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let root_path = optional_non_blank_text(arguments, "rootPath")?;
    let ignore = optional_text_list(arguments, "ignore", IGNORE_MAX_ITEMS)?.unwrap_or_default();
    let source_only = optional_boolean(arguments, "sourceOnly")?.unwrap_or(false);
    if source_only && arguments.get("sourceReads").is_none() {
        return Err(ToolError::failed(
            "sourceOnly requires sourceReads with 1\u{2013}16 exact selectors.",
        ));
    }
    let target = ScanTarget::allow(context, root_path.as_deref())?;
    if let Some(selectors) = arguments.read::<serde_json::Value>("sourceReads")? {
        if target.reads_census() {
            return Err(ToolError::failed(CENSUS_HOLDS_NO_SELECTED_READS));
        }
        let selectors = parse_source_reads(&selectors).map_err(|refusal| {
            if refusal.names_a_wrong_value {
                ToolError::invalid(refusal.message)
            } else {
                ToolError::failed(refusal.message)
            }
        })?;
        let read = read_source_evidence(target.source_root(), &selectors, &ignore, &|| {
            context.was_cancelled()
        });
        let evidence = fit_source_reads(&target.label, read);
        context
            .source_reads()
            .record(target.source_root(), &evidence);
        return Ok(ToolOutput::text(render_source_reads(
            &target.label,
            &evidence,
        )));
    }
    let survey = kept_survey(context, &target, &ignore)?;
    Ok(ToolOutput::text(survey.text.clone()))
}
