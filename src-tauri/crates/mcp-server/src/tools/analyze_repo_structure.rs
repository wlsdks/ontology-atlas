//! `analyze_repo_structure`: the breadth map of the repository, the first call of every
//! construction. The map is read once on the shared pool by `repository-survey`; `sourceReads`
//! answer from `source-reads`, the reads alone, as text. The structural analysis
//! (`view: "analysis"`) and the review of a `proposal` or `qualification` are retired: the call is
//! refused by name and points to the tools that write a vault.

use source_reads::{
    fit_source_reads, parse_source_reads, read_source_evidence, render_source_reads,
};

use super::argument_checks::{
    optional_boolean, optional_non_blank_text, optional_non_negative_integer, optional_text_list,
};
use super::import_scan_target::ScanTarget;
use super::kept_survey::kept_survey;
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::ToolError;

const IGNORE_MAX_ITEMS: usize = 200;
const MAX_DEPTH_MAX: f64 = 10.0;

/// An argument that was sent at all, `null` included.
fn is_sent(arguments: &Arguments, name: &str) -> bool {
    arguments.get(name).is_some()
}

/// An argument that was sent and is not `null`.
fn is_set(arguments: &Arguments, name: &str) -> bool {
    arguments
        .get(name)
        .is_some_and(|raw| raw.get().trim() != "null")
}

/// What a call for a retired part is told.
const RETIRED: &str = "view \"analysis\", proposal and qualification are retired: the structural analysis and the review of a proposal no longer exist. Call analyze_repo_structure for the breadth map, read the code with sourceReads, then write what you found with add_concepts and add_relations.";

pub fn call(context: &CallContext<'_>, arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let root_path = optional_non_blank_text(arguments, "rootPath")?;
    if let Some(view) = arguments.read::<serde_json::Value>("view")? {
        if view.as_str() != Some("breadth") && view.as_str() != Some("analysis") {
            return Err(ToolError::invalid(
                "view must be \"breadth\" or \"analysis\".",
            ));
        }
    }
    optional_non_negative_integer(arguments, "maxDepth", Some(MAX_DEPTH_MAX))?;
    let ignore = optional_text_list(arguments, "ignore", IGNORE_MAX_ITEMS)?.unwrap_or_default();
    let source_only = optional_boolean(arguments, "sourceOnly")?.unwrap_or(false);
    if source_only && (is_sent(arguments, "proposal") || is_sent(arguments, "qualification")) {
        return Err(ToolError::invalid(
            "sourceOnly cannot be combined with proposal or qualification; omit sourceOnly for full analysis and lifecycle replay.",
        ));
    }
    if source_only && !is_sent(arguments, "sourceReads") {
        return Err(ToolError::failed(
            "sourceOnly requires sourceReads with 1\u{2013}16 exact selectors.",
        ));
    }
    let wants_analysis = arguments
        .read::<serde_json::Value>("view")?
        .is_some_and(|view| view.as_str() == Some("analysis"));
    if wants_analysis || is_set(arguments, "proposal") || is_set(arguments, "qualification") {
        return Err(ToolError::invalid(RETIRED));
    }
    let target = ScanTarget::allow(context, root_path.as_deref())?;
    if let Some(selectors) = arguments.read::<serde_json::Value>("sourceReads")? {
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
    let survey = kept_survey(context, &target, &ignore);
    Ok(ToolOutput::text(survey.text.clone()))
}
