//! `inspect_architecture`: the source's imports measured against one architecture profile of the
//! vault, answered as a brief an agent plans a change from. Read-only.

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use source_scan::{
    build_architecture_brief, find_architecture_profiles, read_git_source_state,
    ArchitectureProfile, ImportScanOptions, MeasuredStamp, ProfileDocument, ProfileError,
    ProfileErrorKind,
};

use super::argument_checks::{optional_non_blank_text, optional_positive_integer};
use super::import_scan_target::ScanTarget;
use super::read_vault::read_vault;
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::{ErrorCode, ToolError};
use crate::surface::Surface;

const MAX_FILES_MAX: f64 = 50_000.0;

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "the number was checked to be a whole number between one and its maximum"
)]
fn count(number: f64) -> usize {
    number as usize
}

fn profile_failure(error: ProfileError) -> ToolError {
    match error.kind {
        ProfileErrorKind::Invalid => ToolError::invalid(error.message),
        ProfileErrorKind::NotFound => ToolError::new(ErrorCode::NotFound, error.message),
        ProfileErrorKind::Failed => ToolError::failed(error.message),
    }
}

/// The profile `profile_slug` names, or the only one the vault holds. Refuses with a repair hint
/// when there is none, the name is unknown, or several exist and none was named.
fn select_profile<'a>(
    profiles: &'a [ArchitectureProfile],
    profile_slug: Option<&str>,
) -> Result<&'a ArchitectureProfile, ToolError> {
    let slugs = || profiles.iter().map(|profile| profile.slug.clone()).collect();
    match (profiles, profile_slug) {
        ([], _) => Err(ToolError::profile_missing(
            "No architecture-profile/v1 document exists in the active vault. Add a reviewed Markdown profile under architecture/ before inspecting source conformance.",
        )),
        (_, Some(wanted)) => profiles
            .iter()
            .find(|profile| profile.slug == wanted)
            .ok_or_else(|| ToolError::profile_not_found(wanted, slugs())),
        ([only], None) => Ok(only),
        (_, None) => Err(ToolError::profile_required(slugs())),
    }
}

/// When and by what the measurement was made, and the commit it saw; `None` for a folder that is
/// not under git, which has no commit to name.
fn measured_stamp(root: &Path) -> Result<Option<MeasuredStamp>, ToolError> {
    let state = read_git_source_state(root).map_err(|error| ToolError::failed(error.to_string()))?;
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX));
    Ok(state.map(|state| {
        MeasuredStamp::of_git(
            answer_format::iso_time::to_iso_string(now_ms),
            &Surface::embedded().server_version,
            &state,
        )
    }))
}

pub fn call(context: &CallContext<'_>, arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let root_path = optional_non_blank_text(arguments, "rootPath")?;
    let profile_slug = optional_non_blank_text(arguments, "profileSlug")?;
    let max_files =
        optional_positive_integer(arguments, "maxFiles", Some(MAX_FILES_MAX))?.map(count);
    let target = ScanTarget::open(context, root_path.as_deref())?;

    let read = read_vault(context)?;
    let documents: Vec<ProfileDocument<'_>> = read
        .vault
        .documents()
        .iter()
        .map(|document| ProfileDocument {
            slug: document.slug(),
            frontmatter: document.frontmatter(),
        })
        .collect();
    let profiles = find_architecture_profiles(&documents).map_err(profile_failure)?;
    let profile = select_profile(&profiles, profile_slug.as_deref())?;

    let scan = target.scan(&ImportScanOptions {
        max_files,
        ..ImportScanOptions::default()
    });
    let measured = measured_stamp(Path::new(&target.label))?;
    ToolOutput::json(&build_architecture_brief(profile, &scan, measured))
}
