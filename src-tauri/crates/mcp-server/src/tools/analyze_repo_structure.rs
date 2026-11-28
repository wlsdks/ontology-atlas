//! `analyze_repo_structure`: the breadth map of the repository, the first call of every
//! construction. The map is read once on the shared pool by `repository-survey`; this file checks
//! the arguments the way the JavaScript server does and refuses, by name, the parts of the tool
//! this build does not answer yet (the structural analysis view, and a proposal or qualification
//! to review). `sourceReads` answer from `source-reads`: the reads alone, as text.

use repository_survey::{build_breadth_map, git_ignored_paths, SurveyFiles, SurveyRequest};
use source_reads::{
    fit_source_reads, parse_source_reads, read_source_evidence, render_source_reads,
};

use super::argument_checks::{
    optional_boolean, optional_non_blank_text, optional_non_negative_integer, optional_text_list,
};
use super::import_scan_target::ScanTarget;
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::ToolError;

const IGNORE_MAX_ITEMS: usize = 200;
const MAX_DEPTH_MAX: f64 = 10.0;
/// A source file over this many bytes is generated or data, never read as code.
const SURVEY_FILE_BYTES: usize = 1024 * 1024;

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

fn not_answered(what: &str) -> ToolError {
    ToolError::failed(format!(
        "{what} is not answered by this build of the server yet; the JavaScript server answers it. Call analyze_repo_structure without it for the breadth map."
    ))
}

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
        return Err(ToolError::failed(
            "sourceOnly cannot be combined with proposal or qualification; omit sourceOnly for full analysis and lifecycle replay.",
        ));
    }
    if source_only && !is_sent(arguments, "sourceReads") {
        return Err(ToolError::failed(
            "sourceOnly requires sourceReads with 1\u{2013}16 exact selectors.",
        ));
    }
    if is_set(arguments, "proposal") || is_set(arguments, "qualification") {
        return Err(not_answered("Reviewing a proposal or a qualification"));
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
    let wants_analysis = arguments
        .read::<serde_json::Value>("view")?
        .is_some_and(|view| view.as_str() == Some("analysis"));
    if wants_analysis {
        return Err(not_answered("The structural analysis view"));
    }
    let source = target.source_with_limit(SURVEY_FILE_BYTES);
    let files = SurveyFiles::new(&source);
    let git_ignored = git_ignored_paths(target.root());
    let survey = build_breadth_map(
        &files,
        &SurveyRequest {
            root_path: &target.label,
            ignore: &ignore,
            vault_exclusion: vault_below(target.root(), &context.config().vault_root),
            git_ignored: &git_ignored,
        },
    );
    Ok(ToolOutput::text(survey.text))
}
