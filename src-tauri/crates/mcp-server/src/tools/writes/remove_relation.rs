//! `remove_relation`: take one edge away, or, with `replaceWith`, turn it into another and keep
//! its reason. Without `confirm: true` it only says what it would do.

use answer_format::whitespace::trim;
use vault_edit::{
    exists, key_patch, matching_note_keys, normalized_references, refs_for, without_target,
    typed_containment, NodeFields, Setting, SourceDocument,
};

use super::answer_fields::{output, Fields};
use super::object_checks::{allowed_keys, member, non_blank, plain_object};
use super::patch_document::{patch_document, source_refusal};
use super::relation_notes::{notes_of, notes_value, set_note};
use super::relation_types::{containment_notice, key_of, kind_of, relation_type, stored_containment_type};
use super::sent_setting::Sent;
use super::slug_refusal::slug_refusal;
use super::vault_view::VaultView;
use super::write_aftermath::post_write_maintenance;
use super::write_gates::{require_not_reserved, PreviewState};
use super::concept_effect::effect;
use super::expected_mtime::require_current;
use crate::arguments::Arguments;
use crate::audit::{ActivityContent, ShareMeasure, WriteDone, WriteRecord};
use crate::error::ToolError;
use crate::tools::argument_checks::{
    optional_boolean, optional_non_negative_number, required_non_blank_text,
};
use crate::write_checkpoint::Permit;

fn preview_fields(state: PreviewState) -> Fields {
    Fields::new()
        .with_bool("previewReady", state.preview_ready)
        .with_bool("canConfirm", state.can_confirm)
        .with_bool("wouldChange", state.would_change)
        .with("blockedReasons", Setting::texts(state.blocked_reasons))
}

fn record(
    from: &str,
    summary: String,
    why: Option<String>,
    changed: bool,
    logged_as: Option<&'static str>,
) -> WriteRecord {
    WriteRecord::Wrote {
        activity: ActivityContent {
            target: from.to_string(),
            summary,
            why,
            logged_as,
        },
        concepts: if changed {
            effect(&[], &[from], &[])
        } else {
            effect(&[], &[], &[])
        },
        share: ShareMeasure::Unchanged,
    }
}

pub fn call(permit: &Permit<'_>, arguments: &Arguments) -> Result<WriteDone, ToolError> {
    let replace_with = arguments.read::<Sent>("replaceWith")?.map(|Sent(sent)| sent);
    if let Some(replacement) = replace_with {
        return replace_relation(permit, arguments, &replacement);
    }
    let from = required_non_blank_text(arguments, "from")?;
    let to = required_non_blank_text(arguments, "to")?;
    let requested_text = required_non_blank_text(arguments, "type")?;
    let confirm = optional_boolean(arguments, "confirm")?.unwrap_or(false);
    let expected = optional_non_negative_number(arguments, "expected_mtime")?;
    let requested = relation_type(Some(&Setting::text(&requested_text)), "type")?;
    let view = VaultView::read(permit)?;
    let canonical_from = view.resolve(&from)?;
    let canonical_to = view.resolve(&to)?;
    require_not_reserved(
        view.document(canonical_from.as_deref().unwrap_or(&from)),
        "remove_relation",
    )?;
    let Some(canonical_from) = canonical_from else {
        return Err(view.not_found("Source slug does not exist in vault", &from, false));
    };
    let Some(canonical_to) = canonical_to else {
        return Err(view.not_found("Target slug does not exist in vault", &to, false));
    };
    let writable = permit
        .write_path(&canonical_from)
        .map_err(|error| slug_refusal(&error))?;
    let source = SourceDocument::read(writable.as_confined(), &canonical_from)
        .map_err(|refusal| source_refusal(&view, &canonical_from, refusal))?;
    require_current(&canonical_from, expected, source.modified)?;
    let fields = NodeFields::from_frontmatter(source.document.frontmatter());
    let resolver = view.references();
    let to_kind = kind_of(&view, Some(&canonical_to));
    let relation = stored_containment_type(&fields, requested, to_kind.as_deref(), &canonical_to, &resolver);
    let key = key_of(&relation);
    let notice = containment_notice(requested, &relation, fields.text("kind"), to_kind.as_deref());
    let present = exists(&fields, key, &canonical_to, &resolver);
    let mut notes = notes_of(&fields);
    let note_keys = matching_note_keys(&notes, &canonical_to, &resolver);
    let rationale = note_keys
        .iter()
        .find_map(|note_key| {
            notes
                .iter()
                .find(|(held, _)| held == note_key)
                .and_then(|(_, value)| value.as_text())
        })
        .map(str::to_string);
    let dry_run = !confirm;
    let state = PreviewState::of(
        dry_run,
        present,
        if present {
            Vec::new()
        } else {
            vec!["relation does not exist; confirmation would be a no-op".to_string()]
        },
    );
    let summary = format!("remove {canonical_from} --{requested_text}--> {canonical_to}");
    let summary_of = |changed| record(&canonical_from, summary.clone(), None, changed, None);
    let build = |ok: bool, dry: bool, changed: bool, state: PreviewState, after: Option<Setting>| {
        preview_fields(state)
            .with_bool("exists", present)
            .with_text("from", &canonical_from)
            .with_text("to", &canonical_to)
            .with_text("type", &relation)
            .with_text("key", key)
            .with_some("notice", notice.as_deref().map(Setting::text))
            .with_some("removedRationale", rationale.as_deref().map(Setting::text))
            .with_some("postWriteMaintenance", after)
            .prefixed(ok, dry, changed)
    };
    if !present || !confirm {
        let answer = build(present, dry_run, false, state, None);
        return Ok(WriteDone {
            output: output(answer)?,
            record: if dry_run { WriteRecord::Nothing } else { summary_of(false) },
        });
    }
    let patch_key = if key == "domain" {
        vec![("domain".to_string(), Setting::Null)]
    } else {
        let remaining = without_target(refs_for(&fields, key), &canonical_to, &resolver);
        key_patch(&fields, key, remaining)
    };
    let mut patch = patch_key;
    notes.retain(|(held, _)| !note_keys.contains(held));
    patch.push(("relation_notes".to_string(), notes_value(notes)));
    patch_document(permit, &view, &canonical_from, &patch, None, expected)?;
    let after = post_write_maintenance(permit.context(), std::slice::from_ref(&canonical_from));
    let answer = build(true, false, true, PreviewState::of(false, false, Vec::new()), Some(after));
    Ok(WriteDone {
        output: output(answer)?,
        record: summary_of(true),
    })
}

fn replace_relation(
    permit: &Permit<'_>,
    arguments: &Arguments,
    replacement: &Setting,
) -> Result<WriteDone, ToolError> {
    let members = plain_object(replacement, "replaceWith")?;
    allowed_keys(members, "replaceWith", &["to", "type", "why"])?;
    let from = required_non_blank_text(arguments, "from")?;
    let old_to = required_non_blank_text(arguments, "to")?;
    let old_type_text = required_non_blank_text(arguments, "type")?;
    let new_to_text = non_blank(member(members, "to"), "replaceWith.to")?.to_string();
    let new_type_text = non_blank(member(members, "type"), "replaceWith.type")?.to_string();
    if member(members, "why").is_some_and(|why| why.as_text().is_none()) {
        return Err(ToolError::invalid("replaceWith.why must be a string."));
    }
    let confirm = optional_boolean(arguments, "confirm")?.unwrap_or(false);
    let expected = optional_non_negative_number(arguments, "expected_mtime")?;
    let old_requested = relation_type(Some(&Setting::text(&old_type_text)), "type")?;
    let new_requested = relation_type(member(members, "type"), "replaceWith.type")?;
    let view = VaultView::read(permit)?;
    let canonical_from = view.resolve(&from)?;
    let canonical_old = view.resolve(&old_to)?;
    let canonical_new = view.resolve(&new_to_text)?;
    require_not_reserved(
        view.document(canonical_from.as_deref().unwrap_or(&from)),
        "remove_relation",
    )?;
    let Some(canonical_from) = canonical_from else {
        return Err(view.not_found("Source slug does not exist in vault", &from, false));
    };
    let Some(canonical_old) = canonical_old else {
        return Err(view.not_found("Old target slug does not exist in vault", &old_to, false));
    };
    let Some(canonical_new) = canonical_new else {
        return Err(view.not_found("New target slug does not exist in vault", &new_to_text, false));
    };
    let writable = permit
        .write_path(&canonical_from)
        .map_err(|error| slug_refusal(&error))?;
    let source = SourceDocument::read(writable.as_confined(), &canonical_from)
        .map_err(|refusal| source_refusal(&view, &canonical_from, refusal))?;
    require_current(&canonical_from, expected, source.modified)?;
    let fields = NodeFields::from_frontmatter(source.document.frontmatter());
    let resolver = view.references();
    let from_kind = fields.text("kind").map(str::to_string);
    let new_kind = kind_of(&view, Some(&canonical_new));
    let old_kind = kind_of(&view, Some(&canonical_old));
    let old_type = stored_containment_type(&fields, old_requested, old_kind.as_deref(), &canonical_old, &resolver);
    let new_type = (new_requested == "contains")
        .then(|| typed_containment(from_kind.as_deref(), new_kind.as_deref()))
        .flatten()
        .unwrap_or(new_requested)
        .to_string();
    let old_key = key_of(&old_type);
    let new_key = key_of(&new_type);
    let notice = containment_notice(new_requested, &new_type, from_kind.as_deref(), new_kind.as_deref());
    if !exists(&fields, old_key, &canonical_old, &resolver) {
        return Err(ToolError::new(
            crate::error::ErrorCode::NotFound,
            format!("Relation does not exist: {canonical_from} --{old_type}--> {canonical_old}."),
        ));
    }
    let mut notes = notes_of(&fields);
    let old_note_keys = matching_note_keys(&notes, &canonical_old, &resolver);
    let prior_why = old_note_keys
        .iter()
        .find_map(|note_key| {
            notes
                .iter()
                .find(|(held, _)| held == note_key)
                .and_then(|(_, value)| value.as_text())
        })
        .map(str::to_string);
    let sent_why = member(members, "why")
        .and_then(Setting::as_text)
        .map(trim)
        .filter(|why| !why.is_empty())
        .map(str::to_string);
    let next_why = sent_why.clone().or(prior_why);
    if new_type == "depends_on" && next_why.is_none() {
        return Err(ToolError::invalid(format!(
            "why is required and must be nonblank when converting a relation to depends_on ({canonical_from} --{old_type}--> {canonical_old} carries no relation note to inherit). One sentence: why does the source depend on the target?"
        )));
    }
    let relation_row = |to: &str, relation: &str, key: &str| {
        Fields::new()
            .with_text("to", to)
            .with_text("type", relation)
            .with_text("key", key)
            .into_setting()
    };
    let activity_summary = format!(
        "replace {canonical_from} --{old_type_text}--> {canonical_old} with --{new_type_text}--> {canonical_new}"
    );
    let build = |ok: bool, dry: bool, changed: bool, after: Option<Setting>| {
        preview_fields(PreviewState::of(dry, true, Vec::new()))
            .with_text("from", &canonical_from)
            .with("oldRelation", relation_row(&canonical_old, &old_type, old_key))
            .with("newRelation", relation_row(&canonical_new, &new_type, new_key))
            .with_some("notice", notice.as_deref().map(Setting::text))
            .with_some("postWriteMaintenance", after)
            .prefixed(ok, dry, changed)
    };
    let kept = || record(
        &canonical_from,
        activity_summary.clone(),
        sent_why.clone(),
        true,
        Some("replace_relation"),
    );
    if !confirm {
        return Ok(WriteDone {
            output: output(build(false, true, false, None))?,
            record: WriteRecord::Nothing,
        });
    }
    let mut patch: Vec<(String, Setting)> = Vec::new();
    if old_key == "domain" {
        patch.push(("domain".to_string(), Setting::Null));
    } else {
        let remaining = without_target(refs_for(&fields, old_key), &canonical_old, &resolver);
        patch.extend(key_patch(&fields, old_key, remaining));
    }
    if new_key == "domain" {
        patch.retain(|(held, _)| held != "domain");
        patch.push(("domain".to_string(), Setting::text(&canonical_new)));
    } else {
        let starting: Vec<Setting> = if old_key == new_key {
            match patch.iter().find(|(held, _)| held == new_key) {
                Some((_, Setting::List(items))) => items.clone(),
                _ => Vec::new(),
            }
        } else {
            refs_for(&fields, new_key)
        };
        let mut next = starting;
        next.push(Setting::text(&canonical_new));
        let Setting::List(next) = normalized_references(&next) else {
            return Err(ToolError::failed("a relation list could not be built"));
        };
        for (key, value) in key_patch(&fields, new_key, next) {
            match patch.iter_mut().find(|(held, _)| *held == key) {
                Some((_, held)) => *held = value,
                None => patch.push((key, value)),
            }
        }
    }
    notes.retain(|(held, _)| !old_note_keys.contains(held));
    if let Some(why) = &next_why {
        set_note(&mut notes, &canonical_new, why);
    }
    patch.push(("relation_notes".to_string(), notes_value(notes)));
    patch_document(permit, &view, &canonical_from, &patch, None, expected)?;
    let after = post_write_maintenance(permit.context(), std::slice::from_ref(&canonical_from));
    Ok(WriteDone {
        output: output(build(true, false, true, Some(after)))?,
        record: kept(),
    })
}

trait Prefixed {
    fn prefixed(self, ok: bool, dry_run: bool, changed: bool) -> Fields;
}

impl Prefixed for Fields {
    /// The three fields every answer of this tool opens with, ahead of the rest.
    fn prefixed(self, ok: bool, dry_run: bool, changed: bool) -> Fields {
        let Setting::Map(rest) = self.into_setting() else {
            return Fields::new();
        };
        let mut head = Fields::new()
            .with_bool("ok", ok)
            .with_bool("dryRun", dry_run)
            .with_bool("changed", changed);
        for (key, value) in rest {
            head = head.with(&key, value);
        }
        head
    }
}
