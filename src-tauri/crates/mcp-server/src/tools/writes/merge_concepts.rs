//! `merge_concepts`: fold one node into another. Every reference to the absorbed node moves to the
//! survivor, the survivor remembers the absorbed node's identities, and the absorbed file is
//! deleted, in one plan applied all or nothing. Without `confirm: true` it only says what it would do.

use confined_files::PlanEntry;
use vault_document::summary_excerpt;
use vault_edit::{
    edit_frontmatter, merge_identity_history, plan_redirect, KeyChange, NodeFields, Redirect,
    Setting, SourceDocument,
};

use super::answer_fields::{output, Fields};
use super::patch_document::source_refusal;
use super::redirect_support::{backlink_updates, entered, rewrite_entries, warnings};
use super::slug_refusal::slug_refusal;
use super::vault_view::VaultView;
use super::write_aftermath::{counts_after, post_write_maintenance};
use super::write_gates::{require_not_reserved, PreviewState};
use super::write_support::{effect, identity_refusal, require_current};
use crate::arguments::Arguments;
use crate::audit::{ActivityContent, ShareMeasure, WriteDone, WriteRecord};
use crate::error::{ErrorCode, ToolError};
use crate::tools::argument_checks::{
    optional_boolean, optional_non_negative_number, required_non_blank_text,
};
use crate::write_checkpoint::Permit;

const EXCERPT_CHARS: usize = 200;

fn kind_text(fields: &NodeFields) -> String {
    fields
        .text("kind")
        .map(|kind| answer_format::whitespace::trim(kind).to_string())
        .unwrap_or_default()
}

pub fn call(permit: &Permit<'_>, arguments: &Arguments) -> Result<WriteDone, ToolError> {
    let from_name = required_non_blank_text(arguments, "fromSlug")?;
    let into_name = required_non_blank_text(arguments, "intoSlug")?;
    let confirm = optional_boolean(arguments, "confirm")?.unwrap_or(false);
    let expected_from = optional_non_negative_number(arguments, "expected_mtime")?;
    let expected_into = optional_non_negative_number(arguments, "expected_into_mtime")?;
    if from_name == into_name {
        return Err(ToolError::new(
            ErrorCode::Conflict,
            "fromSlug and intoSlug are identical.",
        ));
    }
    let view = VaultView::read(permit)?;
    let Some(from_slug) = view.disk_slug(&from_name) else {
        return Err(view.not_found("fromSlug does not exist in vault", &from_name, false));
    };
    require_not_reserved(view.document(&from_slug), "merge_concepts")?;
    let into_slug = view.disk_slug(&into_name);
    require_not_reserved(into_slug.as_deref().and_then(|slug| view.document(slug)), "merge_concepts")?;
    let Some(into_slug) = into_slug else {
        return Err(view.not_found("intoSlug does not exist in vault", &into_name, false));
    };
    if from_slug == into_slug {
        return Err(ToolError::failed(format!(
            "fromSlug and intoSlug name the same document on disk (\"{from_slug}\") — the spellings differ only in letter case."
        )));
    }
    let from_path = permit.write_path(&from_slug).map_err(|error| slug_refusal(&error))?;
    let into_path = permit.write_path(&into_slug).map_err(|error| slug_refusal(&error))?;
    let from = SourceDocument::read(from_path.as_confined(), &from_slug)
        .map_err(|refusal| source_refusal(&view, &from_slug, refusal))?;
    let into = SourceDocument::read(into_path.as_confined(), &into_slug)
        .map_err(|refusal| source_refusal(&view, &into_slug, refusal))?;
    let from_fields = NodeFields::from_frontmatter(from.document.frontmatter());
    let into_fields = NodeFields::from_frontmatter(into.document.frontmatter());
    let history = merge_identity_history(&from_fields, &into_fields)
        .map_err(|refusal| identity_refusal(&refusal))?;
    require_current(&from_slug, expected_from, from.modified)?;
    require_current(&into_slug, expected_into, into.modified)?;

    let from_kind = kind_text(&from_fields);
    let into_kind = kind_text(&into_fields);
    let differs = !from_kind.is_empty() && !into_kind.is_empty() && from_kind != into_kind;
    let plan = plan_redirect(
        view.documents(),
        &Redirect {
            from: &from_slug,
            to: &into_slug,
            exclude: &[],
            target_kind: differs.then_some(into_kind.as_str()),
        },
    )
    .map_err(|refusal| ToolError::failed(refusal.to_string()))?;
    let notes = warnings(&plan, Some(&into_kind), &from_slug);
    let excerpt = summary_excerpt(&from.body(), EXCERPT_CHARS);
    let state = PreviewState::of(!confirm, true, Vec::new());
    let captured = Fields::new()
        .with("frontmatter", Setting::Map(from_fields.entries().to_vec()))
        .with_text("bodyExcerpt", &excerpt)
        .into_setting();
    let head = |ok: bool, dry: bool, deleted: bool| {
        let mut fields = Fields::new().with_bool("ok", ok).with_bool("dryRun", dry);
        fields = fields
            .with_bool("previewReady", state.preview_ready)
            .with_bool("canConfirm", state.can_confirm)
            .with_bool("wouldChange", state.would_change)
            .with("blockedReasons", Setting::texts(state.blocked_reasons.clone()));
        fields
            .with_some("fromUid", from_fields.text("uid").map(Setting::text))
            .with_some("intoUid", into_fields.text("uid").map(Setting::text))
            .with("absorbedUids", Setting::texts(history.absorbed_uids.clone()))
            .with_text("fromSlug", &from_slug)
            .with_text("intoSlug", &into_slug)
            .with_text("fromPath", &from_path.as_path().display().to_string())
            .with_bool("deleted", deleted)
            .with("backlinkUpdates", backlink_updates(&plan))
            .with_texts_if_any("warnings", notes.clone())
    };
    if !confirm {
        let total = plan.updates.len();
        let answer = head(false, true, false)
            .with("capturedFrom", captured)
            .with_text(
                "message",
                &format!("dry-run — pass confirm:true to redirect {total} backlinks and then permanently delete {from_slug}.md."),
            );
        return Ok(WriteDone {
            output: output(answer)?,
            record: WriteRecord::Nothing,
        });
    }

    let merged_uids = Setting::List(history.merged_uids.iter().map(Setting::text).collect());
    let identity_changes = [
        KeyChange::set("uid", Setting::text(&history.survivor_uid)),
        KeyChange::set("merged_uids", merged_uids),
    ];
    let mut entries: Vec<PlanEntry> = Vec::new();
    entries.extend(rewrite_entries(permit, &view, &plan, &[into_slug.as_str()])?);
    let surviving = plan
        .rewrites
        .iter()
        .find(|rewrite| rewrite.source.slug == into_slug)
        .map_or_else(|| into.raw.clone(), |rewrite| rewrite.text.clone());
    let identity_text = edit_frontmatter(&surviving, &identity_changes)
        .map_err(|refusal| ToolError::failed(refusal.to_string()))?;
    entries.push(entered(
        PlanEntry::write(into_path.clone(), identity_text),
        &into.raw,
        into.modified,
    ));
    entries.push(entered(PlanEntry::delete(from_path.clone()), &from.raw, from.modified));
    permit.apply_requiring_revisions(
        entries,
        confined_files::Reservations::Refuse(&|path, text| vault_edit::reservation_in(path, text)),
    )?;
    let after = post_write_maintenance(permit.context(), std::slice::from_ref(&into_slug));
    let counts = counts_after(permit)?;
    let answer = head(true, false, true)
        .with_bool("changed", true)
        .with("capturedFrom", captured)
        .with("postWriteMaintenance", after);
    Ok(WriteDone {
        output: output(answer)?,
        record: WriteRecord::Wrote {
            activity: ActivityContent {
                target: into_slug.clone(),
                summary: format!("merge {from_slug} → {into_slug}"),
                why: None,
                logged_as: None,
            },
            concepts: effect(&[], &[&into_slug], &[&from_slug]),
            share: ShareMeasure::Measure(Box::new(move || counts)),
        },
    })
}
