//! `patch_concept`: change the frontmatter keys and the body of one node, and only those.

use vault_edit::Setting;

use super::answer_fields::{output, Fields};
use super::object_checks::plain_object;
use super::patch_document::patch_document;
use super::sent_setting::Sent;
use super::vault_view::VaultView;
use super::write_aftermath::{findings_on_written, measure_coverage, share_counts, source_state};
use super::write_gates::{member, require_not_reserved, require_valid_frontmatter_patch};
use super::write_support::{effect, write_permit};
use crate::arguments::Arguments;
use crate::audit::{ActivityContent, ShareMeasure, WriteDone, WriteRecord};
use crate::error::ToolError;
use crate::tools::argument_checks::{
    argument, optional_non_negative_number, required_non_blank_text,
};
use crate::write_checkpoint::Permit;

pub fn call(permit: &Permit<'_>, arguments: &Arguments) -> Result<WriteDone, ToolError> {
    write_permit(permit)?;
    let slug = required_non_blank_text(arguments, "slug")?;
    let expected_mtime = optional_non_negative_number(arguments, "expected_mtime")?;
    let frontmatter = arguments.read::<Sent>("frontmatter")?.map(|Sent(sent)| sent);
    let body = argument(arguments, "body")?;
    if frontmatter.is_none() && body.is_none() {
        return Err(ToolError::invalid(
            "At least one of `frontmatter` or `body` is required.",
        ));
    }
    let patch: Vec<(String, Setting)> = match &frontmatter {
        Some(sent) => plain_object(sent, "frontmatter")?.to_vec(),
        None => Vec::new(),
    };
    require_valid_frontmatter_patch(&patch)?;
    let body = match body {
        None => None,
        Some(serde_json::Value::String(text)) => Some(text),
        Some(_) => return Err(ToolError::invalid("body must be a string.")),
    };
    match member(&patch, "title") {
        None => {}
        Some(Setting::Null) => {
            return Err(ToolError::invalid(
                "title cannot be deleted from a vault node — pass a new non-empty string instead.",
            ))
        }
        Some(Setting::Text(title)) if !answer_format::whitespace::trim(title).is_empty() => {}
        Some(_) => return Err(ToolError::invalid("title must be a non-empty string.")),
    }

    let context = permit.context();
    let view = VaultView::read(permit)?;
    require_not_reserved(view.document(&slug), "patch_concept")?;
    let patched = patch_document(permit, &view, &slug, &patch, body.as_deref(), expected_mtime)?;

    let findings = findings_on_written(context, std::slice::from_ref(&slug));
    let notice = patched.minted_uid.as_ref().map(|uid| {
        format!(
            "This node had no `uid:` (hand-written in an editor), which stops the whole vault from compiling. This write minted {uid} for it. Tell the human — the node now has a permanent identity."
        )
    });
    let answer = Fields::new()
        .with_bool("ok", true)
        .with_text("slug", &slug)
        .with_bool("changed", true)
        .with_number("mtime", patched.modified_ms)
        .with_some("mintedUid", patched.minted_uid.as_deref().map(Setting::text))
        .with_some("notice", notice.as_deref().map(Setting::text))
        .with_texts_if_any("findings", findings);
    let documents = VaultView::read(permit)?;
    let coverage = measure_coverage(context, documents.documents());
    let counts = share_counts(coverage.as_ref(), source_state(context));
    Ok(WriteDone {
        output: output(answer)?,
        record: WriteRecord::Wrote {
            activity: ActivityContent {
                target: slug.clone(),
                summary: format!("patch_concept {slug}"),
                why: None,
                logged_as: None,
            },
            concepts: effect(&[], &[&slug], &[]),
            share: ShareMeasure::Measure(Box::new(move || counts)),
        },
    })
}
