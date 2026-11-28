//! `absorb_document`: turn the rules of a Markdown file (a repository's `AGENTS.md`) into `document`
//! nodes in the vault and rewrite the file as a slim pointer, keeping the original beside it. Without
//! `confirm: true` it only says what it would do. The plan is `document-absorption`; the file it reads
//! and rewrites is an `AbsorbedFile`, whose refusals (hidden, credential and non-Markdown names,
//! non-UTF-8 text) come before any byte is read.
//!
//! The new nodes, the backup and the rewritten source are one plan applied all or nothing, so a
//! failure at the last step leaves no node behind (the script server left them).

use answer_format::whitespace::trim;
use confined_files::{AbsorbedFile, AbsorbedFileRefusal, AbsorbedPlace, PlanEntry, Reservations};
use document_absorption::{plan_absorption, slim_pointer, AbsorptionPlan, Action};
use serde::Serialize;
use vault_edit::{check_node_identity, new_file, new_node_fields, NewNode, NodeUids, Setting};

use super::answer_fields::Answer;
use super::slug_refusal::slug_refusal;
use super::vault_view::VaultView;
use super::write_aftermath::{counts_after, post_write_maintenance};
use super::write_gates::PreviewState;
use super::concept_effect::effect;
use super::node_identity::{created_by, identity_refusal, SessionUids};
use crate::arguments::Arguments;
use crate::audit::{ActivityContent, ShareMeasure, WriteDone, WriteRecord};
use crate::answer::ToolOutput;
use crate::error::{ErrorCode, ToolError};
use crate::tools::argument_checks::{optional_boolean, required_non_blank_text};
use crate::write_checkpoint::Permit;

#[derive(Serialize)]
struct SectionRow<'a> {
    heading: &'a str,
    category: &'static str,
    kind: Option<&'static str>,
    role: Option<&'static str>,
    confidence: f64,
    action: &'static str,
    #[serde(rename = "targetSlug")]
    target_slug: Option<&'a str>,
    #[serde(rename = "injectionSuspect")]
    injection_suspect: bool,
    #[serde(rename = "injectionMatches")]
    injection_matches: &'a [&'static str],
}

#[derive(Serialize)]
struct SummaryRow {
    total: usize,
    absorbed: usize,
    suggested: usize,
    #[serde(rename = "injectionSuspect")]
    injection_suspect: usize,
    unclassified: usize,
}

#[derive(Serialize)]
struct Head<'a> {
    ok: bool,
    #[serde(rename = "dryRun")]
    dry_run: bool,
    #[serde(rename = "previewReady")]
    preview_ready: bool,
    #[serde(rename = "canConfirm")]
    can_confirm: bool,
    #[serde(rename = "wouldChange")]
    would_change: bool,
    #[serde(rename = "blockedReasons")]
    blocked_reasons: &'a [String],
    #[serde(rename = "filePath")]
    file_path: &'a str,
    #[serde(rename = "outsideRepo")]
    outside_repo: bool,
    #[serde(rename = "sourceLabel")]
    source_label: &'a str,
    title: Option<&'a str>,
    summary: SummaryRow,
    sections: Vec<SectionRow<'a>>,
}

#[derive(Serialize)]
struct Preview<'a> {
    #[serde(flatten)]
    head: Head<'a>,
    message: String,
}

#[derive(Serialize)]
struct WrittenRow<'a> {
    slug: &'a str,
    #[serde(rename = "filePath")]
    file_path: String,
}

#[derive(Serialize)]
struct Absorbed<'a> {
    #[serde(flatten)]
    head: Head<'a>,
    written: Vec<WrittenRow<'a>>,
    #[serde(rename = "backupPath")]
    backup_path: &'a str,
    changed: bool,
    message: String,
    #[serde(rename = "postWriteMaintenance")]
    post_write_maintenance: Answer<'a>,
}

fn head<'a>(
    plan: &'a AbsorptionPlan,
    source: &'a str,
    outside_repo: bool,
    ok: bool,
    state: &'a PreviewState,
) -> Head<'a> {
    Head {
        ok,
        dry_run: state.preview_ready,
        preview_ready: state.preview_ready,
        can_confirm: state.can_confirm,
        would_change: state.would_change,
        blocked_reasons: &state.blocked_reasons,
        file_path: source,
        outside_repo,
        source_label: &plan.source_label,
        title: plan.title.as_deref(),
        summary: SummaryRow {
            total: plan.summary.total,
            absorbed: plan.summary.absorbed,
            suggested: plan.summary.suggested,
            injection_suspect: plan.summary.injection_suspect,
            unclassified: plan.summary.unclassified,
        },
        sections: plan
            .sections
            .iter()
            .map(|section| SectionRow {
                heading: &section.heading,
                category: section.class.category.name(),
                kind: section.class.kind,
                role: section.class.role,
                confidence: section.class.confidence,
                action: section.action.name(),
                target_slug: section.target_slug.as_deref(),
                injection_suspect: section.injection.suspect(),
                injection_matches: &section.injection.matches,
            })
            .collect(),
    }
}

fn refusal(error: AbsorbedFileRefusal) -> ToolError {
    match error {
        AbsorbedFileRefusal::NotFound(_) => ToolError::new(ErrorCode::NotFound, error.to_string()),
        AbsorbedFileRefusal::Moved(_) => ToolError::new(ErrorCode::Conflict, error.to_string()),
        AbsorbedFileRefusal::Io(_) => ToolError::failed(error.to_string()),
        _ => ToolError::invalid(error.to_string()),
    }
}

/// Why a reserved source is refused: absorbing rewrites it, and only a person releases it.
fn reserved_source_issue(source: &AbsorbedFile) -> Option<String> {
    let reserved = vault_edit::reservation_in(source.path(), source.text())?;
    let note = reserved
        .note
        .map(|note| format!(" \u{2014} what they have to decide: {note}"))
        .unwrap_or_default();
    Some(format!(
        "{} carries review_state: human_decides, so it is reserved for a person and absorbing it would rewrite it{note}. Report it and let the person decide.",
        reserved.slug
    ))
}

fn dry_run_message(plan: &AbsorptionPlan, blocked: &[String]) -> String {
    let counts = format!(
        "dry-run \u{2014} {} section(s) would be absorbed as document/policy nodes, {} suggested (not written), {} injection-suspect (excluded from absorption). ",
        plan.summary.absorbed, plan.summary.suggested, plan.summary.injection_suspect
    );
    if blocked.is_empty() {
        format!("{counts}Pass confirm:true to write.")
    } else {
        format!("{counts}Confirmation is blocked: {}.", blocked.join("; "))
    }
}

pub fn call(permit: &Permit<'_>, arguments: &Arguments) -> Result<WriteDone, ToolError> {
    let file_path = required_non_blank_text(arguments, "filePath")?;
    let confirm = optional_boolean(arguments, "confirm")?.unwrap_or(false);
    let allow_outside_repo = optional_boolean(arguments, "allowOutsideRepo")?.unwrap_or(false);
    let context = permit.context();
    let place = AbsorbedPlace::locate(&file_path, context.config().absorb_repository()).map_err(refusal)?;
    permit.ensure_card_named(&place)?;
    let source = place.read().map_err(refusal)?;
    let view = VaultView::read(permit)?;
    let source_path = source.path().to_string_lossy().into_owned();
    let backup_path = source.backup_path().to_string_lossy().into_owned();
    let outside = source.is_outside_repository();
    let repository = confined_files::real_path(&context.config().repo_root)
        .unwrap_or_else(|_| context.config().repo_root.clone());
    let reserved = reserved_source_issue(&source);
    let outside_reason = format!(
        "source file is outside repoRoot ({}); repeat with allowOutsideRepo:true only after reviewing the absolute path",
        repository.display()
    );
    let backup_exists = source.backup_exists();

    let plan = plan_absorption(
        source.text(),
        trim(&file_stem(&source)),
        &|slug| view.root().read_path(slug).is_ok_and(|path| path.exists()),
    );

    if !confirm {
        let mut blocked = Vec::new();
        if outside && !allow_outside_repo {
            blocked.push(outside_reason);
        }
        if backup_exists {
            blocked.push(format!(
                "backup already exists and would be overwritten: {backup_path}"
            ));
        }
        blocked.extend(reserved);
        let state = PreviewState::of(true, true, blocked);
        let answer = Preview {
            message: dry_run_message(&plan, &state.blocked_reasons),
            head: head(&plan, &source_path, outside, false, &state),
        };
        return Ok(WriteDone {
            output: ToolOutput::json(&answer)?,
            record: WriteRecord::Nothing,
        });
    }

    if let Some(issue) = reserved {
        return Err(ToolError::failed(format!("absorb_document blocked: {issue}")));
    }
    if outside && !allow_outside_repo {
        return Err(ToolError::failed(format!(
            "absorb_document blocked: source file is outside repoRoot ({}): {source_path}. Run a dry-run, review the absolute path, then pass allowOutsideRepo:true only if this rewrite is intended.",
            repository.display()
        )));
    }
    if backup_exists {
        return Err(ToolError::new(
            ErrorCode::Conflict,
            format!(
                "backup already exists, refusing to overwrite: {backup_path} \u{2014} remove or rename it first."
            ),
        ));
    }

    let reference = source.reference_from(view.root().path());
    let author = created_by(context);
    let mut entries: Vec<PlanEntry> = Vec::new();
    let mut written: Vec<(String, String)> = Vec::new();
    for section in plan.sections.iter().filter(|s| s.action == Action::Absorb) {
        let Some(slug) = section.target_slug.as_deref() else {
            continue;
        };
        let target = permit.write_path(slug).map_err(|error| slug_refusal(&error))?;
        if target.as_confined().exists() {
            return Err(ToolError::failed(format!(
                "absorb_document refused before writing anything: \"{slug}\" already exists (created since the dry-run). The vault is unchanged \u{2014} run the dry-run again and re-confirm."
            )));
        }
        let node = NewNode {
            slug: slug.to_string(),
            kind: "document".to_string(),
            title: section.heading.clone(),
            created_by: author.clone(),
            ..NewNode::default()
        };
        let mut fields = new_node_fields(&node, &SessionUids.mint())
            .ok_or_else(|| ToolError::failed("Unknown kind: document."))?;
        fields.set("role", Setting::text("policy"));
        fields.set("source", Setting::text(&reference));
        check_node_identity(view.documents(), slug, &fields)
            .map_err(|refusal| identity_refusal(&refusal))?;
        let text = new_file(
            fields.entries(),
            &format!("# {}\n\n{}\n", section.heading, section.body),
        );
        written.push((slug.to_string(), target.as_path().to_string_lossy().into_owned()));
        entries.push(PlanEntry::write(target, text).expecting_absent());
    }
    entries.push(
        PlanEntry::write(permit.absorbed_backup(&source), source.text().to_string())
            .expecting_absent()
            .as_open_as(source.path()),
    );
    entries.push(
        PlanEntry::write(permit.absorbed_source(&source), slim_pointer(&plan))
            .expecting_text(source.text().to_string())
            .expecting_modified(source.modified_time())
            .expecting_identity(source.identity()),
    );
    permit.apply(
        entries,
        Reservations::Refuse(&|path, text| vault_edit::reservation_in(path, text)),
    )?;

    let after = post_write_maintenance(context, &[]);
    let counts = counts_after(permit)?;
    let state = PreviewState::of(false, false, Vec::new());
    let slugs: Vec<&str> = written.iter().map(|(slug, _)| slug.as_str()).collect();
    let answer = Absorbed {
        head: head(&plan, &source_path, outside, true, &state),
        written: written
            .iter()
            .map(|(slug, file)| WrittenRow {
                slug,
                file_path: file.clone(),
            })
            .collect(),
        backup_path: &backup_path,
        changed: true,
        message: format!(
            "absorbed {} section(s) into the vault; source rewritten as a slim pointer (backup at {backup_path}).",
            written.len()
        ),
        post_write_maintenance: Answer(&after),
    };
    Ok(WriteDone {
        output: ToolOutput::json(&answer)?,
        record: WriteRecord::Wrote {
            activity: ActivityContent {
                target: file_path.clone(),
                summary: format!("absorb {file_path}"),
                why: None,
                logged_as: None,
            },
            concepts: effect(&slugs, &[], &[]),
            share: ShareMeasure::Measure(Box::new(move || counts)),
        },
    })
}

/// The file's name without a final `.md`, in any letter case.
fn file_stem(source: &AbsorbedFile) -> String {
    let name = source
        .path()
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    match name.len().checked_sub(3).and_then(|cut| name.get(cut..)) {
        Some(tail) if tail.eq_ignore_ascii_case(".md") => {
            name.get(..name.len() - 3).unwrap_or_default().to_string()
        }
        _ => name,
    }
}
