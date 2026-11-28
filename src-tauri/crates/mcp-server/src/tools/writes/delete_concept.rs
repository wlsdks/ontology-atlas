//! `delete_concept`: remove a node's file. A node others point at is deleted only with `force: true`,
//! which leaves them dangling; `merge_concepts` moves the references first. Without `confirm: true`
//! it only says what it would do.

use confined_files::PlanEntry;
use vault_document::{find_backlinks, summary_excerpt, AmbiguousReferences, Backlink, ReferenceIndex};
use vault_edit::{NodeFields, Setting, SourceDocument};

use super::answer_fields::{output, Fields};
use super::patch_document::source_refusal;
use super::redirect_support::entered;
use super::slug_refusal::slug_refusal;
use super::vault_view::VaultView;
use super::write_aftermath::{counts_after, post_write_maintenance};
use super::write_gates::{require_not_reserved, PreviewState};
use super::write_support::{effect, require_current, write_permit};
use crate::arguments::Arguments;
use crate::audit::{ActivityContent, ShareMeasure, WriteDone, WriteRecord};
use crate::error::ToolError;
use crate::tools::argument_checks::{
    optional_boolean, optional_non_negative_number, required_non_blank_text,
};
use crate::write_checkpoint::Permit;

const EXCERPT_CHARS: usize = 200;

/// One referrer as a delete reports it: which node, and through what.
fn referrer_row(backlink: &Backlink<'_>) -> Setting {
    Fields::new()
        .with_text("slug", backlink.slug)
        .with_some("kind", backlink.kind.map(Setting::text))
        .with_some(
            "matchedKeys",
            backlink
                .matched_keys
                .as_ref()
                .map(|keys| Setting::texts(keys.iter().copied())),
        )
        .with_some("matchedInBody", backlink.matched_in_body.map(Setting::Bool))
        .with_some("ambiguousTail", backlink.ambiguous_tail.map(Setting::Bool))
        .into_setting()
}

pub fn call(permit: &Permit<'_>, arguments: &Arguments) -> Result<WriteDone, ToolError> {
    write_permit(permit)?;
    let name = required_non_blank_text(arguments, "slug")?;
    let confirm = optional_boolean(arguments, "confirm")?.unwrap_or(false);
    let force = optional_boolean(arguments, "force")?.unwrap_or(false);
    let expected = optional_non_negative_number(arguments, "expected_mtime")?;
    let write = write_permit(permit)?;
    write.write_path(&name).map_err(|error| slug_refusal(&error))?;
    let view = VaultView::read(permit)?;
    let Some(slug) = view.disk_slug(&name) else {
        return Err(view.not_found("Doc not found", &name, false));
    };
    let path = write.write_path(&slug).map_err(|error| slug_refusal(&error))?;
    let source = SourceDocument::read(path.as_confined(), &slug)
        .map_err(|refusal| source_refusal(&view, &slug, refusal))?;
    require_not_reserved(view.document(&slug), "delete_concept")?;
    let index = ReferenceIndex::new(view.documents());
    let backlinks = find_backlinks(view.documents(), &index, &slug, AmbiguousReferences::Count)
        .map_err(|error| ToolError::failed(error.to_string()))?;
    let rows = Setting::List(backlinks.iter().map(referrer_row).collect());
    let fields = NodeFields::from_frontmatter(source.document.frontmatter());
    let uid = fields.text("uid").map(Setting::text);
    let file_path = path.as_path().display().to_string();
    let head = |ok: bool, dry: bool, state: &PreviewState| {
        Fields::new()
            .with_bool("ok", ok)
            .with_bool("dryRun", dry)
            .with_bool("previewReady", state.preview_ready)
            .with_bool("canConfirm", state.can_confirm)
            .with_bool("wouldChange", state.would_change)
            .with("blockedReasons", Setting::texts(state.blocked_reasons.clone()))
            .with_some("uid", uid.clone())
            .with_text("slug", &slug)
            .with_text("filePath", &file_path)
    };
    let count = backlinks.len();
    if !confirm {
        let blocked = if count > 0 && !force {
            vec![format!("{count} backlink(s) require force:true before confirmation")]
        } else {
            Vec::new()
        };
        let message = if count > 0 {
            format!("dry-run — {count} backlinks point here, so confirm:true alone is refused. Pass force:true as well to push through.")
        } else {
            "dry-run — pass confirm:true to delete it for real.".to_string()
        };
        let answer = head(false, true, &PreviewState::of(true, true, blocked))
            .with("backlinks", rows)
            .with_text("message", &message);
        return Ok(WriteDone {
            output: output(answer)?,
            record: WriteRecord::Nothing,
        });
    }
    if count > 0 && !force {
        let names: Vec<&str> = backlinks.iter().map(|backlink| backlink.slug).collect();
        return Err(ToolError::failed(format!(
            "Refusing to delete: {count} backlinks point here: {} — force:true pushes through (the referring nodes are left dangling).",
            names.join(", ")
        )));
    }
    require_current(&slug, expected, source.modified)?;
    write.apply(
        vec![entered(PlanEntry::delete(path.clone()), &source.raw, source.modified)],
        confined_files::Reservations::Refuse(&|path, text| vault_edit::reservation_in(path, text)),
    )?;
    let after = post_write_maintenance(permit.context(), &[]);
    let counts = counts_after(permit)?;
    let excerpt = summary_excerpt(&source.body(), EXCERPT_CHARS);
    let captured = Fields::new()
        .with("frontmatter", Setting::Map(fields.entries().to_vec()))
        .with_text("bodyExcerpt", &excerpt)
        .into_setting();
    let answer = head(true, false, &PreviewState::of(false, false, Vec::new()))
        .with_some("forced", (count > 0).then_some(Setting::Bool(true)))
        .with_some("backlinksAtDelete", (count > 0).then_some(rows))
        .with_bool("changed", true)
        .with("captured", captured)
        .with("postWriteMaintenance", after);
    Ok(WriteDone {
        output: output(answer)?,
        record: WriteRecord::Wrote {
            activity: ActivityContent {
                target: slug.clone(),
                summary: format!("delete {slug}"),
                why: None,
                logged_as: None,
            },
            concepts: effect(&[], &[], &[&slug]),
            share: ShareMeasure::Measure(Box::new(move || counts)),
        },
    })
}
