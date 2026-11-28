//! `disconnect_project_source`: release a project from the folder it was bound to. A binding can
//! outlive its project node, so a slug that names no node is taken as written, and the call can still
//! clear it. Without `confirm: true` it lists what it would remove.

use project_source::{
    read_source_bindings, read_source_view, remove_source_bindings, ActionRef, BindingWriteFailure,
    BindingsRead, GapRef, Removal, SOURCE_STATE_RELATIVE_PATH,
};
use serde::Serialize;

use super::connect_project_source::sent_flag;
use super::project_source_selection::existing_slug;
use super::plain_refusal::plain_refusal;
use super::vault_view::VaultView;
use super::write_support::write_permit;
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::audit::{ActivityContent, ConceptEffect, ShareMeasure, WriteDone, WriteRecord};
use crate::error::ToolError;
use crate::tools::argument_checks::optional_non_blank_text;
use crate::write_checkpoint::Permit;

const DISCONNECT_CONTRACT: &str = "projectSourceDisconnect:v1";

#[derive(Serialize)]
struct Removable<'a> {
    #[serde(rename = "rootPath")]
    root_path: &'a str,
    kind: &'static str,
    #[serde(rename = "boundAt")]
    bound_at: &'a str,
    #[serde(rename = "measuredAt")]
    measured_at: Option<&'a str>,
}

#[derive(Serialize)]
struct NextCallArguments<'a> {
    #[serde(rename = "projectSlug")]
    project_slug: &'a str,
    confirm: bool,
}

#[derive(Serialize)]
struct NextCall<'a> {
    tool: &'static str,
    arguments: NextCallArguments<'a>,
}

#[derive(Serialize)]
struct Previewed<'a> {
    ok: bool,
    changed: bool,
    confirmed: bool,
    contract: &'static str,
    #[serde(rename = "projectSlug")]
    project_slug: &'a str,
    removed: usize,
    bindings: Vec<Removable<'a>>,
    #[serde(rename = "nextCall")]
    next_call: NextCall<'a>,
}

#[derive(Serialize)]
struct Disconnected<'a> {
    ok: bool,
    changed: bool,
    confirmed: bool,
    contract: &'static str,
    #[serde(rename = "projectSlug")]
    project_slug: &'a str,
    removed: usize,
    bindings: Vec<Removable<'a>>,
    status: &'a str,
    #[serde(rename = "nextAction")]
    next_action: &'a ActionRef,
    #[serde(rename = "topGap")]
    top_gap: &'a Option<GapRef>,
}

fn removal_failure(failure: BindingWriteFailure) -> ToolError {
    plain_refusal(match failure {
        BindingWriteFailure::UnsafePath => format!(
            "disconnect_project_source blocked: {SOURCE_STATE_RELATIVE_PATH} is behind an unsafe sidecar path."
        ),
        BindingWriteFailure::Malformed => format!(
            "disconnect_project_source blocked: {SOURCE_STATE_RELATIVE_PATH} is malformed. Inspect it by hand, or re-connect with repair: true to rewrite it."
        ),
        BindingWriteFailure::Persistence => {
            "disconnect_project_source could not persist the sidecar update.".to_string()
        }
    })
}

pub fn call(permit: &Permit<'_>, arguments: &Arguments) -> Result<WriteDone, ToolError> {
    write_permit(permit)?;
    let Some(name) = optional_non_blank_text(arguments, "projectSlug")? else {
        return Err(plain_refusal("projectSlug is required."));
    };
    let context = permit.context();
    let view = VaultView::read(permit)?;
    let slug = existing_slug(permit.vault(), view.documents(), &name)?.unwrap_or(name);
    let vault = &context.config().vault_root;
    let bindings = read_source_bindings(vault);
    match bindings {
        BindingsRead::UnsafePath => {
            return Err(plain_refusal(format!(
                "disconnect_project_source blocked: {SOURCE_STATE_RELATIVE_PATH} is behind an unsafe sidecar path. Replace the symlink or junction with a real vault-local directory first."
            )))
        }
        BindingsRead::Malformed => return Err(removal_failure(BindingWriteFailure::Malformed)),
        _ => {}
    }
    let held = bindings.bound_to(&slug);
    let removable = || -> Vec<Removable<'_>> {
        held.iter()
            .map(|binding| Removable {
                root_path: &binding.root_path,
                kind: binding.kind.word(),
                bound_at: &binding.bound_at,
                measured_at: binding.measured_at(),
            })
            .collect()
    };

    if sent_flag(arguments, "confirm") != Some(true) {
        let answer = Previewed {
            ok: true,
            changed: false,
            confirmed: false,
            contract: DISCONNECT_CONTRACT,
            project_slug: &slug,
            removed: 0,
            bindings: removable(),
            next_call: NextCall {
                tool: "disconnect_project_source",
                arguments: NextCallArguments {
                    project_slug: &slug,
                    confirm: true,
                },
            },
        };
        return Ok(WriteDone {
            output: ToolOutput::json(&answer)?,
            record: WriteRecord::Nothing,
        });
    }

    let removed = match remove_source_bindings(vault, &slug).map_err(removal_failure)? {
        Removal::Removed(count) => count,
        Removal::NotBound => 0,
    };
    let after = read_source_view(vault, &slug, None, None);
    let answer = Disconnected {
        ok: true,
        changed: removed > 0,
        confirmed: true,
        contract: DISCONNECT_CONTRACT,
        project_slug: &slug,
        removed,
        bindings: removable(),
        status: &after.status,
        next_action: &after.next_action,
        top_gap: &after.top_gap,
    };
    let record = if removed > 0 {
        WriteRecord::Wrote {
            activity: ActivityContent {
                target: slug.clone(),
                summary: format!("disconnect_project_source {removed} removed"),
                why: None,
                logged_as: None,
            },
            concepts: ConceptEffect::default(),
            share: ShareMeasure::Unchanged,
        }
    } else {
        WriteRecord::Nothing
    };
    Ok(WriteDone {
        output: ToolOutput::json(&answer)?,
        record,
    })
}
