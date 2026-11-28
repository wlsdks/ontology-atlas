//! `connect_project_source`: bind a project node to the code folder it describes and record what a
//! measurement of that folder found. Without `confirm: true` it measures and says what it would
//! bind. `confirm: false` is a refusal to write even after a person accepted the consent card:
//! consent allows the call to stand for the confirmation only when `confirm` was not sent at all.

use project_source::{
    derive_witness_claims, inspect_project_source, mint_source_receipt, read_source_view,
    write_source_binding, ActionRef, BindingWriteFailure, BindingsRead, GapRef, MintInput,
    NewBinding, SourceProbe, SourceReceipt, WitnessSummary, SOURCE_STATE_RELATIVE_PATH,
};
use serde::Serialize;

use super::project_source_selection::{select_source_folder, SourceSelection};
use super::plain_refusal::plain_refusal;
use super::vault_view::VaultView;
use super::write_support::write_permit;
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::audit::{ActivityContent, ConceptEffect, ShareMeasure, WriteDone, WriteRecord};
use crate::error::ToolError;
use crate::write_checkpoint::Permit;

const CONNECT_CONTRACT: &str = "projectSourceConnect:v1";

#[derive(Serialize)]
struct BindingView<'a> {
    #[serde(rename = "rootPath")]
    root_path: &'a str,
    kind: &'static str,
    #[serde(rename = "sourceId")]
    source_id: &'a str,
    dirty: Option<bool>,
    truncated: bool,
    #[serde(rename = "inventoryFiles")]
    inventory_files: usize,
}

#[derive(Serialize)]
struct NextCallArguments<'a> {
    #[serde(rename = "projectSlug")]
    project_slug: &'a str,
    #[serde(rename = "rootPath")]
    root_path: &'a str,
    confirm: bool,
}

#[derive(Serialize)]
struct NextCall<'a> {
    tool: &'static str,
    arguments: NextCallArguments<'a>,
}

#[derive(Serialize)]
struct Connected<'a> {
    ok: bool,
    contract: &'static str,
    #[serde(rename = "projectSlug")]
    project_slug: &'a str,
    mode: &'static str,
    #[serde(rename = "inferredFrom", skip_serializing_if = "Option::is_none")]
    inferred_from: Option<&'static str>,
    binding: BindingView<'a>,
    changed: bool,
    confirmed: bool,
    status: &'a str,
    #[serde(rename = "nextAction")]
    next_action: &'a ActionRef,
    #[serde(rename = "topGap")]
    top_gap: &'a Option<GapRef>,
    #[serde(rename = "witnessSummary")]
    witness_summary: WitnessSummary,
    #[serde(rename = "nextCall", skip_serializing_if = "Option::is_none")]
    next_call: Option<NextCall<'a>>,
}

/// A flag the call sent as the JSON `true` or `false`; any other value is as if it was not sent.
pub fn sent_flag(arguments: &Arguments, key: &str) -> Option<bool> {
    match arguments.get(key)?.get() {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}

/// What a failed binding write tells the agent, in the words of each tool that writes one.
pub fn binding_failure(tool: &str, failure: BindingWriteFailure) -> ToolError {
    plain_refusal(match failure {
        BindingWriteFailure::UnsafePath => format!(
            "{tool} blocked: {SOURCE_STATE_RELATIVE_PATH} is behind an unsafe sidecar path. repair: true cannot bypass a symlink or junction boundary."
        ),
        BindingWriteFailure::Malformed => format!(
            "{tool} blocked: {SOURCE_STATE_RELATIVE_PATH} is malformed. Re-run connect_project_source with repair: true to discard and rewrite it."
        ),
        BindingWriteFailure::Persistence => {
            format!("{tool} could not persist the binding (persistence_failed).")
        }
    })
}

/// The folder measured and the receipt it earned, ready to be stored.
pub struct Measured {
    pub probe: SourceProbe,
    pub receipt: SourceReceipt,
    pub bound_at: String,
}

pub fn measure_source(
    context: &crate::dispatch::CallContext<'_>,
    project_slug: &str,
    graph_hash: &str,
    root: &std::path::Path,
    claims: &[project_source::WitnessClaim],
) -> Result<Measured, project_source::ProbeError> {
    let probe = inspect_project_source(root, Some(&context.config().vault_root))?;
    let measured_at = answer_format::iso_time::to_iso_string(crate::audit::now_ms());
    let receipt = mint_source_receipt(&MintInput {
        project_slug,
        graph_hash,
        probe: &probe,
        claims,
        measured_at: &measured_at,
    });
    Ok(Measured {
        probe,
        receipt,
        bound_at: measured_at,
    })
}

impl Measured {
    pub fn binding(&self, project_slug: &str) -> NewBinding {
        NewBinding {
            project_slug: project_slug.to_string(),
            source_id: self.probe.source_id.clone(),
            root_path: self.probe.root_path.clone(),
            kind: self.probe.kind.word(),
            bound_at: self.bound_at.clone(),
            receipt: self.receipt.clone(),
        }
    }
}

/// The answer, in the order every connect answer lists its parts.
fn connected<'a>(
    slug: &'a str,
    selection: &SourceSelection<'_>,
    measured: &'a Measured,
    changed: bool,
    state: (&'a str, &'a ActionRef, &'a Option<GapRef>),
    next_call: Option<NextCall<'a>>,
) -> Connected<'a> {
    Connected {
        ok: true,
        contract: CONNECT_CONTRACT,
        project_slug: slug,
        mode: selection.mode.word(),
        inferred_from: selection.inferred_from,
        binding: BindingView {
            root_path: &measured.probe.root_path,
            kind: measured.probe.kind.word(),
            source_id: &measured.probe.source_id,
            dirty: measured.probe.dirty,
            truncated: measured.probe.truncated,
            inventory_files: measured.probe.files.len(),
        },
        changed,
        confirmed: changed,
        status: state.0,
        next_action: state.1,
        top_gap: state.2,
        witness_summary: measured.receipt.witness_summary,
        next_call,
    }
}

pub fn call(permit: &Permit<'_>, arguments: &Arguments) -> Result<WriteDone, ToolError> {
    let write = write_permit(permit)?;
    let context = permit.context();
    let view = VaultView::read(permit)?;
    let selection = select_source_folder(context, permit.vault(), view.documents(), arguments)?;
    let repair = sent_flag(arguments, "repair") == Some(true);
    if matches!(selection.bindings, BindingsRead::Malformed) && !repair {
        return Err(plain_refusal(format!(
            "connect_project_source blocked: {SOURCE_STATE_RELATIVE_PATH} is malformed. Inspect it, then re-run with repair: true to discard and rewrite it."
        )));
    }
    let Some(graph_hash) = selection.scope.graph_hash.as_deref() else {
        return Err(plain_refusal(
            "connect_project_source blocked: the project scope is incomplete.",
        ));
    };
    let slug = selection.project_slug.as_str();
    let claims = derive_witness_claims(slug, &selection.scope.documents);
    let measured = measure_source(context, slug, graph_hash, &selection.root, &claims).map_err(|error| {
        plain_refusal(format!(
            "connect_project_source could not measure \"{}\": {error}",
            selection.root.display()
        ))
    })?;
    let confirm = sent_flag(arguments, "confirm");
    let stands_for_confirmation =
        confirm == Some(true) || (write.consented() && confirm != Some(false));

    if !stands_for_confirmation {
        let receipt = &measured.receipt;
        let answer = connected(
            slug,
            &selection,
            &measured,
            false,
            (&receipt.status, &receipt.next_action, &receipt.top_gap),
            Some(NextCall {
                tool: "connect_project_source",
                arguments: NextCallArguments {
                    project_slug: slug,
                    root_path: &measured.probe.root_path,
                    confirm: true,
                },
            }),
        );
        return Ok(WriteDone {
            output: ToolOutput::json(&answer)?,
            record: WriteRecord::Nothing,
        });
    }

    let vault = &context.config().vault_root;
    write_source_binding(vault, &measured.binding(slug), repair)
        .map_err(|failure| binding_failure("connect_project_source", failure))?;
    let written = read_source_view(vault, slug, Some(graph_hash), None);
    let answer = connected(
        slug,
        &selection,
        &measured,
        true,
        (&written.status, &written.next_action, &written.top_gap),
        None,
    );
    Ok(WriteDone {
        output: ToolOutput::json(&answer)?,
        record: WriteRecord::Wrote {
            activity: ActivityContent {
                target: slug.to_string(),
                summary: format!(
                    "connect_project_source {} {}",
                    selection.mode.word(),
                    measured.probe.kind.word()
                ),
                why: None,
                logged_as: None,
            },
            concepts: ConceptEffect::default(),
            share: ShareMeasure::Unchanged,
        },
    })
}
