//! `rename_concept`: move a node to another name, or, with `newKind`, change its kind. Either way
//! every reference to it moves too, in one plan applied all or nothing. Without `confirm: true` it
//! only says what it would do.

use confined_files::{PlanEntry, WritablePath};
use vault_document::schema::flat_slug_issue;
use vault_edit::{
    edit_frontmatter, plan_redirect, replace_body, KeyChange, NodeFields, Redirect, Setting,
    SourceDocument, CREATABLE_KINDS,
};

use super::answer_fields::{output, Fields};
use super::object_checks::one_of;
use super::referrer_rewrites::{backlink_updates, entered, rewrite_entries, warnings};
use super::slug_refusal::slug_refusal;
use super::vault_view::VaultView;
use super::write_aftermath::{counts_after, post_write_maintenance};
use super::write_gates::{require_not_reserved, PreviewState};
use super::concept_effect::effect;
use super::expected_mtime::require_current;
use super::patch_document::source_refusal;
use crate::arguments::Arguments;
use crate::audit::{ActivityContent, ShareMeasure, WriteDone, WriteRecord};
use crate::error::{ConflictDetails, ToolError};
use crate::tools::argument_checks::{
    argument, optional_boolean, optional_non_blank_text, optional_non_negative_number,
    required_non_blank_text,
};
use crate::write_checkpoint::Permit;

fn path_text(path: &WritablePath) -> String {
    path.as_path().display().to_string()
}

fn preview_fields(state: &PreviewState) -> Fields {
    Fields::new()
        .with_bool("previewReady", state.preview_ready)
        .with_bool("canConfirm", state.can_confirm)
        .with_bool("wouldChange", state.would_change)
        .with("blockedReasons", Setting::texts(state.blocked_reasons.clone()))
}

pub fn call(permit: &Permit<'_>, arguments: &Arguments) -> Result<WriteDone, ToolError> {
    let old_slug = required_non_blank_text(arguments, "oldSlug")?;
    if arguments.get("newKind").is_some() {
        let overwrite = optional_boolean(arguments, "overwrite")?.unwrap_or(false);
        if overwrite {
            return Err(ToolError::invalid(
                "overwrite must not be combined with newKind: a kind change never replaces an existing file.",
            ));
        }
        return change_kind(permit, arguments, &old_slug);
    }
    for name in ["domain", "body"] {
        if arguments.get(name).is_some() {
            return Err(ToolError::invalid(format!(
                "{name} applies only with newKind; it must be omitted from a plain rename."
            )));
        }
    }
    if arguments.get("newSlug").is_none() {
        return Err(ToolError::invalid(
            "At least one of newSlug or newKind is required.",
        ));
    }
    let new_slug = required_non_blank_text(arguments, "newSlug")?;
    let confirm = optional_boolean(arguments, "confirm")?.unwrap_or(false);
    let overwrite = optional_boolean(arguments, "overwrite")?.unwrap_or(false);
    let expected = optional_non_negative_number(arguments, "expected_mtime")?;
    if old_slug == new_slug {
        return Err(ToolError::new(
            crate::error::ErrorCode::Conflict,
            "oldSlug and newSlug are identical.",
        ));
    }
    if old_slug.to_lowercase() == new_slug.to_lowercase() {
        return Err(ToolError::failed(format!(
            "oldSlug and newSlug differ only in letter case (\"{old_slug}\" → \"{new_slug}\"). On macOS and Windows those are the same file, so this rename would delete the document instead of renaming it. Rename through a different name first (for example \"{new_slug}-tmp\"), then to \"{new_slug}\"."
        )));
    }
    let view = VaultView::read(permit)?;
    let Some(disk_old) = view.disk_slug(&old_slug) else {
        return Err(view.not_found("Source slug does not exist in vault", &old_slug, false));
    };
    require_not_reserved(view.document(&disk_old), "rename_concept")?;
    if let Some(target) = view.disk_slug(&new_slug).filter(|target| *target != new_slug) {
        return Err(ToolError::failed(format!(
            "Target slug \"{new_slug}\" collides with existing \"{target}\" — the names differ only in letter case, which is the same file on macOS and Windows. Choose a different name or rename that document out of the way first."
        )));
    }
    let target_exists = view.root().slug_exists(&new_slug);
    if !overwrite && target_exists {
        return Err(ToolError::conflict_with(
            format!("Target slug already exists: \"{new_slug}\". Pass overwrite: true to replace it."),
            ConflictDetails {
                subject: "Target slug already exists",
                slug: new_slug.clone(),
                recovery_tools: vec!["rename_concept"],
                overwrite_option: Some("overwrite"),
                ..ConflictDetails::default()
            },
        ));
    }
    if target_exists {
        require_not_reserved(view.document(&new_slug), "rename_concept")?;
    }
    let source_path = permit.write_path(&disk_old).map_err(|error| slug_refusal(&error))?;
    let target_path = permit.write_path(&new_slug).map_err(|error| slug_refusal(&error))?;
    let source = SourceDocument::read(source_path.as_confined(), &disk_old)
        .map_err(|refusal| source_refusal(&view, &disk_old, refusal))?;
    let target = if overwrite && target_exists {
        Some(
            SourceDocument::read(target_path.as_confined(), &new_slug)
                .map_err(|refusal| source_refusal(&view, &new_slug, refusal))?,
        )
    } else {
        None
    };
    if let Some(issue) = flat_slug_issue(source.document.frontmatter().text("kind").unwrap_or_default(), &new_slug) {
        return Err(ToolError::failed(issue));
    }
    require_current(&disk_old, expected, source.modified)?;
    let replaced: Vec<String> = if overwrite { vec![new_slug.clone()] } else { Vec::new() };
    let plan = plan_redirect(
        view.documents(),
        &Redirect {
            from: &disk_old,
            to: &new_slug,
            exclude: &replaced,
            target_kind: None,
        },
    )
    .map_err(|refusal| ToolError::failed(refusal.to_string()))?;
    let uid = source.document.frontmatter().text("uid").map(Setting::text);
    let updates = backlink_updates(&plan);
    let total = plan.updates.len();
    let notes = warnings(&plan, None, &disk_old);
    let state = PreviewState::of(!confirm, true, Vec::new());
    let head = |dry: bool| {
        Fields::new()
            .with_bool("ok", !dry)
            .with_bool("dryRun", dry)
    };
    let body_fields = |fields: Fields| {
        fields
            .with_some("uid", uid.clone())
            .with_text("oldSlug", &disk_old)
            .with_text("newSlug", &new_slug)
            .with_text("sourcePath", &path_text(&source_path))
            .with_text("targetPath", &path_text(&target_path))
    };
    if !confirm {
        let mut answer = head(true);
        let Setting::Map(preview) = preview_fields(&state).into_setting() else {
            return Err(ToolError::failed("a preview could not be built"));
        };
        for (key, value) in preview {
            answer = answer.with(&key, value);
        }
        let answer = body_fields(answer)
            .with_bool("moved", false)
            .with("backlinkUpdates", updates)
            .with_texts_if_any("warnings", notes)
            .with_text(
                "message",
                &format!("dry-run — pass confirm:true to actually move the file and redirect {total} backlinks."),
            );
        return Ok(WriteDone {
            output: output(answer)?,
            record: WriteRecord::Nothing,
        });
    }
    let mut next_text = source.raw.clone();
    if source
        .document
        .frontmatter()
        .text("slug")
        .is_some_and(|held| answer_format::whitespace::trim(held) == disk_old)
    {
        next_text = edit_frontmatter(&next_text, &[KeyChange::set("slug", Setting::text(&new_slug))])
            .map_err(|refusal| ToolError::failed(refusal.to_string()))?;
    }
    let mut entries: Vec<PlanEntry> = Vec::new();
    let target_entry = PlanEntry::write(target_path.clone(), next_text).as_open_as(source_path.as_path());
    entries.push(match &target {
        Some(target) => entered(target_entry, &target.raw, target.modified),
        None => target_entry.expecting_absent(),
    });
    entries.extend(rewrite_entries(permit, &view, &plan, &[])?);
    entries.push(entered(
        PlanEntry::delete(source_path.clone()),
        &source.raw,
        source.modified,
    ));
    permit.apply_requiring_revisions(
        entries,
        confined_files::Reservations::Refuse(&|path, text| vault_edit::reservation_in(path, text)),
    )?;
    let after = post_write_maintenance(permit.context(), std::slice::from_ref(&new_slug));
    let counts = counts_after(permit)?;
    let mut answer = head(false);
    let Setting::Map(preview) = preview_fields(&PreviewState::of(false, false, Vec::new())).into_setting() else {
        return Err(ToolError::failed("an answer could not be built"));
    };
    for (key, value) in preview {
        answer = answer.with(&key, value);
    }
    let answer = body_fields(answer)
        .with_bool("moved", true)
        .with("backlinkUpdates", updates)
        .with_texts_if_any("warnings", notes)
        .with_bool("changed", true)
        .with("postWriteMaintenance", after);
    Ok(WriteDone {
        output: output(answer)?,
        record: WriteRecord::Wrote {
            activity: ActivityContent {
                target: new_slug.clone(),
                summary: format!("rename {disk_old} → {new_slug}"),
                why: None,
                logged_as: None,
            },
            concepts: effect(&[], &[&new_slug], &[]),
            share: ShareMeasure::Measure(Box::new(move || counts)),
        },
    })
}

fn looks_like_generated_starter(body: &str, kind: &str) -> bool {
    if body.chars().count() > 800 {
        return false;
    }
    let lowered = body.to_lowercase();
    let markers: &[&str] = match kind {
        "project" => &["one- or two-line summary of this project"],
        "domain" => &[
            "describe the stable responsibility or problem boundary",
            "a *domain* is a large area of the project",
        ],
        "capability" => &[
            "describe the observable, implementation-independent ability",
            "a *capability* is one user-visible feature",
        ],
        "element" => &["describe the distinct implementation role", "implementation element"],
        "document" => &[
            "state what this narrative or reference artifact explains",
            "source document",
        ],
        _ => return false,
    };
    markers.iter().any(|marker| lowered.contains(marker))
}

fn change_kind(
    permit: &Permit<'_>,
    arguments: &Arguments,
    slug: &str,
) -> Result<WriteDone, ToolError> {
    let new_kind_value = argument(arguments, "newKind")?;
    let new_kind_setting = new_kind_value.as_ref().map(|value| match value {
        serde_json::Value::String(text) => Setting::text(text),
        _ => Setting::Null,
    });
    if !matches!(new_kind_setting, Some(Setting::Text(ref text)) if !answer_format::whitespace::trim(text).is_empty()) {
        return Err(ToolError::invalid("newKind must be a non-empty string."));
    }
    let new_kind = one_of(new_kind_setting.as_ref(), "newKind", &CREATABLE_KINDS)?.to_string();
    let new_slug = optional_non_blank_text(arguments, "newSlug")?;
    let confirm = optional_boolean(arguments, "confirm")?.unwrap_or(false);
    let expected = optional_non_negative_number(arguments, "expected_mtime")?;
    let domain_arg = argument(arguments, "domain")?;
    let domain = match &domain_arg {
        None | Some(serde_json::Value::Null) => None,
        Some(value) => Some(crate::tools::argument_checks::non_blank_text(value, "domain")?),
    };
    let body = match argument(arguments, "body")? {
        None => None,
        Some(serde_json::Value::String(text)) => Some(text),
        Some(_) => return Err(ToolError::invalid("body must be a string.")),
    };
    if matches!(new_kind.as_str(), "capability" | "element") && domain.is_none() {
        return Err(ToolError::failed(format!(
            "domain is required when changing the kind to \"{new_kind}\"."
        )));
    }
    let view = VaultView::read(permit)?;
    let canonical_old = view.resolve(slug)?;
    require_not_reserved(view.document(canonical_old.as_deref().unwrap_or(slug)), "rename_concept")?;
    let Some(canonical_old) = canonical_old else {
        return Err(view.not_found("Source slug does not exist in vault", slug, false));
    };
    let canonical_new = new_slug.clone().unwrap_or_else(|| canonical_old.clone());
    if canonical_new != canonical_old && view.root().slug_exists(&canonical_new) {
        return Err(ToolError::new(
            crate::error::ErrorCode::Conflict,
            format!("Target slug already exists: \"{canonical_new}\"."),
        ));
    }
    let source_path = permit.write_path(&canonical_old).map_err(|error| slug_refusal(&error))?;
    let target_path = permit.write_path(&canonical_new).map_err(|error| slug_refusal(&error))?;
    let source = SourceDocument::read(source_path.as_confined(), &canonical_old)
        .map_err(|refusal| source_refusal(&view, &canonical_old, refusal))?;
    require_current(&canonical_old, expected, source.modified)?;
    let fields = NodeFields::from_frontmatter(source.document.frontmatter());
    let old_kind = fields.text("kind").map(str::to_string);
    if let Some(issue) = flat_slug_issue(&new_kind, &canonical_new) {
        return Err(ToolError::failed(issue));
    }
    let title = fields
        .text("title")
        .filter(|title| !title.is_empty())
        .map_or_else(
            || canonical_new.rsplit('/').next().unwrap_or(&canonical_new).to_string(),
            str::to_string,
        );
    let source_body = source.body();
    let (next_body, body_action) = match &body {
        Some(body) => (Some(body.clone()), "replaced_explicitly"),
        None if looks_like_generated_starter(&source_body, old_kind.as_deref().unwrap_or_default()) => (
            vault_document::starter_body::starter_body(&new_kind, &title),
            "regenerated_starter",
        ),
        None => (None, "preserved"),
    };
    let kind_changes = old_kind.as_deref() != Some(new_kind.as_str());
    let rewrites_referrers = canonical_new != canonical_old || kind_changes;
    let plan = if rewrites_referrers {
        plan_redirect(
            view.documents(),
            &Redirect {
                from: &canonical_old,
                to: &canonical_new,
                exclude: &[],
                target_kind: kind_changes.then_some(new_kind.as_str()),
            },
        )
        .map_err(|refusal| ToolError::failed(refusal.to_string()))?
    } else {
        vault_edit::RedirectPlan::default()
    };
    let notes = warnings(&plan, Some(&new_kind), &canonical_old);
    let dry_run = !confirm;
    let uid = fields.text("uid").map(Setting::text);
    let build = |ok: bool, dry: bool, changed: bool, extra: Option<Setting>| {
        let mut answer = Fields::new()
            .with_bool("ok", ok)
            .with_bool("dryRun", dry)
            .with_bool("changed", changed);
        if let Setting::Map(preview) =
            preview_fields(&PreviewState::of(dry, true, Vec::new())).into_setting()
        {
            for (key, value) in preview {
                answer = answer.with(&key, value);
            }
        }
        answer
            .with_some("uid", uid.clone())
            .with_text("oldSlug", &canonical_old)
            .with_text("newSlug", &canonical_new)
            .with_some("oldKind", old_kind.as_deref().map(Setting::text))
            .with_text("newKind", &new_kind)
            .with_text("sourcePath", &path_text(&source_path))
            .with_text("targetPath", &path_text(&target_path))
            .with_text("bodyAction", body_action)
            .with("backlinkUpdates", backlink_updates(&plan))
            .with_texts_if_any("warnings", notes.clone())
            .with_some("postWriteMaintenance", extra)
    };
    if dry_run {
        return Ok(WriteDone {
            output: output(build(false, true, false, None))?,
            record: WriteRecord::Nothing,
        });
    }
    let mut changes = vec![KeyChange::set("kind", Setting::text(&new_kind))];
    let declared = fields.text("slug");
    if declared.is_none_or(|held| answer_format::whitespace::trim(held) == canonical_old) {
        changes.push(KeyChange::set("slug", Setting::text(&canonical_new)));
    }
    let keeps_domain = matches!(new_kind.as_str(), "capability" | "element");
    match (&domain, keeps_domain) {
        (Some(domain), true) => changes.push(KeyChange::set("domain", Setting::text(domain))),
        _ => {
            if domain_arg == Some(serde_json::Value::Null) || !keeps_domain {
                changes.push(KeyChange::remove("domain"));
            }
        }
    }
    let mut next_text = edit_frontmatter(&source.raw, &changes)
        .map_err(|refusal| ToolError::failed(refusal.to_string()))?;
    if let Some(body) = &next_body {
        next_text = replace_body(&next_text, body)
            .map_err(|refusal| ToolError::failed(refusal.to_string()))?;
    }
    let mut entries: Vec<PlanEntry> = Vec::new();
    let write_entry = PlanEntry::write(target_path.clone(), next_text).as_open_as(source_path.as_path());
    entries.push(if source_path == target_path {
        entered(write_entry, &source.raw, source.modified)
    } else {
        write_entry.expecting_absent()
    });
    entries.extend(rewrite_entries(permit, &view, &plan, &[])?);
    if source_path != target_path {
        entries.push(entered(PlanEntry::delete(source_path.clone()), &source.raw, source.modified));
    }
    permit.apply_requiring_revisions(
        entries,
        confined_files::Reservations::Refuse(&|path, text| vault_edit::reservation_in(path, text)),
    )?;
    let after = post_write_maintenance(permit.context(), std::slice::from_ref(&canonical_new));
    let counts = counts_after(permit)?;
    Ok(WriteDone {
        output: output(build(true, false, true, Some(after)))?,
        record: WriteRecord::Wrote {
            activity: ActivityContent {
                target: canonical_new.clone(),
                summary: format!("reclassify {canonical_old} → {new_kind}"),
                why: None,
                logged_as: Some("reclassify_concept"),
            },
            concepts: effect(&[], &[&canonical_new], &[]),
            share: ShareMeasure::Measure(Box::new(move || counts)),
        },
    })
}
