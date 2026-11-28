//! `analyze_repo_structure`: the breadth map of the repository, the first call of every
//! construction. The map is read once on the shared pool by `repository-survey`; this file checks
//! the arguments the way the JavaScript server does and refuses, by name, the parts of the tool
//! this build does not answer yet (exact source reads, and a proposal or qualification to review).
//! `view: "analysis"` is answered by `repository-candidates`.

use construction_review::proposal_validation::ProposalValidation;
use repository_candidates::analysis_view::narrow_to_view;
use repository_candidates::repository_analysis::{
    analyze_repository, AnalysisRefusal, AnalysisRequest, RepositoryAnalysis,
};
use repository_candidates::repository_files::RepositoryFiles;
use repository_survey::{build_breadth_map, git_ignored_paths, SurveyFiles, SurveyRequest};
use serde::Serialize;

use super::argument_checks::{
    optional_boolean, optional_non_blank_text, optional_non_negative_integer, optional_text_list,
};
use super::import_scan_target::ScanTarget;
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::ToolError;
use crate::schema_check::{check_against_schema, review_schemas, Json};

const IGNORE_MAX_ITEMS: usize = 200;
const MAX_DEPTH_MAX: f64 = 10.0;
/// The most a document or source file the analysis reads may weigh and still be opened.
const ANALYSIS_FILE_BYTES: usize = 2 * 1024 * 1024;
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
    // The whole contracts are checked first, as the script server does, so a malformed proposal or
    // qualification is refused with the field to repair; a well-formed one is still not reviewed here.
    for (name, schema) in [
        ("proposal", &review_schemas().proposal),
        ("qualification", &review_schemas().qualification),
    ] {
        if is_set(arguments, name) {
            if let Some(value) = arguments.read::<Json>(name)? {
                check_against_schema(&value, schema, name)?;
            }
        }
    }
    if is_set(arguments, "proposal") || is_set(arguments, "qualification") {
        return Err(not_answered("Reviewing a proposal or a qualification"));
    }
    let target = ScanTarget::allow(context, root_path.as_deref())?;
    if is_sent(arguments, "sourceReads") {
        return Err(not_answered("sourceReads"));
    }
    let wants_analysis = arguments
        .read::<serde_json::Value>("view")?
        .is_some_and(|view| view.as_str() == Some("analysis"));
    if wants_analysis {
        let target = target.require_folder()?;
        return analysis_answer(&target, &ignore);
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

/// The structural analysis with the validation of a proposal nobody sent, and the note a scan
/// without a capability candidate carries.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AnalysisAnswer {
    #[serde(flatten)]
    analysis: RepositoryAnalysis,
    proposal_validation: ProposalValidation,
    #[serde(skip_serializing_if = "Option::is_none")]
    note: Option<String>,
}

fn analysis_answer(target: &ScanTarget, ignore: &[String]) -> Result<ToolOutput, ToolError> {
    let source = target.source_with_limit(ANALYSIS_FILE_BYTES);
    let files = RepositoryFiles::new(&source, &target.label);
    let (mut analysis, _imports) = analyze_repository(&files, &AnalysisRequest { ignore })
        .map_err(|AnalysisRefusal::RustFeatureConfiguration| {
            not_answered("The structural analysis view of a repository with a root Cargo.toml")
        })?;
    let note = narrow_to_view(&mut analysis);
    ToolOutput::json(&AnalysisAnswer {
        analysis,
        proposal_validation: ProposalValidation::not_provided(),
        note,
    })
}
