//! `patch_concept` with `patches`: up to twenty nodes changed in one call, under one consent. Every
//! patch is read and checked, and made into the text its file will have, before the first file is
//! touched, and the plan is applied all or none, so a refusal anywhere leaves every node as it was.
//! Each node leaves the audit line a single patch would.

use confined_files::ConfinedPath;
use vault_edit::Setting;

use super::answer_fields::{output, Fields};
use super::object_checks::{allowed_keys, non_blank, plain_object};
use super::patch_concept::check_title;
use super::patch_document::{apply_patches, plan_patch};
use super::sent_setting::Sent;
use super::vault_view::VaultView;
use super::write_aftermath::{findings_on_written, measure_coverage, share_counts, source_state};
use super::write_gates::{has_key, member, require_not_reserved, require_valid_frontmatter_patch};
use super::write_support::{effect, modified_ms};
use crate::arguments::Arguments;
use crate::audit::{ActivityContent, NodeWrite, ShareMeasure, WriteDone, WriteRecord};
use crate::error::{ErrorCode, ToolError};
use crate::write_checkpoint::Permit;

const PATCH_BATCH_MAX: usize = 20;
const PATCH_KEYS: [&str; 4] = ["slug", "frontmatter", "body", "expected_mtime"];
const NOTHING_CHANGED: &str = " No node was changed: the files this call touched were put back as they were.";

/// A failure of the batch as an agent reads it: words that name the patch and say what state the call
/// left, under the code of the failure itself. A stale file is a plain `conflict` here, and the
/// fields that repair a single call (similar slugs, the current time) are left out, because they
/// belong to one node and this answer speaks for several.
fn failed_in_batch(failure: ToolError, before: &str) -> ToolError {
    let code = match failure.code() {
        ErrorCode::VaultConflict => ErrorCode::Conflict,
        other => other,
    };
    ToolError::new(
        code,
        format!("{before}{}{NOTHING_CHANGED}", failure.message()),
    )
}

/// One patch after its checks: the node, the keys to set or remove, and the guard.
struct Patch {
    slug: String,
    keys: Vec<(String, Setting)>,
    body: Option<String>,
    expected_mtime: Option<f64>,
}

/// The checks one patch passes before any file is touched; `label` names it in a refusal.
fn check_patch(members: &[(String, Setting)], label: &str) -> Result<Patch, ToolError> {
    let at = |name: &str| format!("{label}.{name}");
    let slug = non_blank(member(members, "slug"), &at("slug"))?.to_string();
    let expected_mtime = match member(members, "expected_mtime") {
        None => None,
        Some(Setting::Number(number)) if number.is_finite() && *number >= 0.0 => Some(*number),
        Some(_) => {
            return Err(ToolError::invalid(format!(
                "{} must be a non-negative finite number.",
                at("expected_mtime")
            )))
        }
    };
    if !has_key(members, "frontmatter") && !has_key(members, "body") {
        return Err(ToolError::invalid(format!(
            "At least one of `{}` or `{}` is required.",
            at("frontmatter"),
            at("body")
        )));
    }
    let keys = match member(members, "frontmatter") {
        None => Vec::new(),
        Some(sent) => plain_object(sent, &at("frontmatter"))?.to_vec(),
    };
    require_valid_frontmatter_patch(&keys)?;
    let body = match member(members, "body") {
        None => None,
        Some(Setting::Text(text)) => Some(text.clone()),
        Some(_) => {
            return Err(ToolError::invalid(format!(
                "{} must be a string.",
                at("body")
            )))
        }
    };
    check_title(&keys)?;
    Ok(Patch {
        slug,
        keys,
        body,
        expected_mtime,
    })
}

/// The patches of the call, each checked, with no node named twice and none reserved for a person.
fn checked_patches(
    arguments: &Arguments,
    view: &VaultView<'_>,
) -> Result<Vec<Patch>, ToolError> {
    if let Some(extra) = PATCH_KEYS
        .iter()
        .find(|key| arguments.get(key).is_some())
    {
        return Err(ToolError::failed(format!(
            "Send either `patches` or `{extra}` on its own, not both."
        )));
    }
    let sent = arguments.read::<Sent>("patches")?.map(|Sent(sent)| sent);
    let wrong_size = || ToolError::failed(format!("patches must hold 1 to {PATCH_BATCH_MAX} patches."));
    let Some(Setting::List(items)) = sent else {
        return Err(wrong_size());
    };
    if items.is_empty() || items.len() > PATCH_BATCH_MAX {
        return Err(wrong_size());
    }
    let mut patches: Vec<Patch> = Vec::with_capacity(items.len());
    for (index, item) in items.iter().enumerate() {
        let label = format!("patches[{index}]");
        let members = plain_object(item, &label)?;
        allowed_keys(members, &label, &PATCH_KEYS)?;
        let patch = check_patch(members, &label)?;
        if patches.iter().any(|earlier| earlier.slug == patch.slug) {
            return Err(ToolError::failed(format!(
                "{label}.slug repeats \"{}\": send one patch per node.",
                patch.slug
            )));
        }
        require_not_reserved(view.document(&patch.slug), "patch_concept")?;
        patches.push(patch);
    }
    Ok(patches)
}

/// What one node of the call answers: written, with the time its file has now.
fn row(patch: &Patch, minted_uid: Option<&str>, modified_ms: Option<f64>) -> Setting {
    let notice = minted_uid.map(|uid| {
        format!(
            "This node had no `uid:` (hand-written in an editor), which stops the whole vault from compiling. This write minted {uid} for it. Tell the human — the node now has a permanent identity."
        )
    });
    Fields::new()
        .with_bool("ok", true)
        .with_text("slug", &patch.slug)
        .with_bool("changed", true)
        .with_number("mtime", modified_ms)
        .with_some("mintedUid", minted_uid.map(Setting::text))
        .with_some("notice", notice.as_deref().map(Setting::text))
        .into_setting()
}

pub fn call(permit: &Permit<'_>, arguments: &Arguments) -> Result<WriteDone, ToolError> {
    let context = permit.context();
    let view = VaultView::read(permit)?;
    let patches = checked_patches(arguments, &view)?;

    let mut entries = Vec::with_capacity(patches.len());
    let mut touched: Vec<(ConfinedPath, Option<String>)> = Vec::with_capacity(patches.len());
    for (index, patch) in patches.iter().enumerate() {
        let plan = plan_patch(
            permit,
            &view,
            &patch.slug,
            &patch.keys,
            patch.body.as_deref(),
            patch.expected_mtime,
        )
        .map_err(|refused| {
            failed_in_batch(refused, &format!("patches[{index}] ({}): ", patch.slug))
        })?;
        let minted = plan.minted_uid.clone();
        let (entry, file) = plan.into_parts();
        entries.push(entry);
        touched.push((file, minted));
    }
    apply_patches(permit, entries).map_err(|failed| failed_in_batch(failed, ""))?;

    let slugs: Vec<String> = patches.iter().map(|patch| patch.slug.clone()).collect();
    let rows: Vec<Setting> = patches
        .iter()
        .zip(&touched)
        .map(|(patch, (file, minted))| row(patch, minted.as_deref(), modified_ms(file)))
        .collect();
    let findings = findings_on_written(context, &slugs);
    let answer = Fields::new()
        .with_bool("ok", true)
        .with("patches", Setting::List(rows))
        .with_texts_if_any("findings", findings);
    let documents = VaultView::read(permit)?;
    let coverage = measure_coverage(context, documents.documents());
    let counts = share_counts(coverage.as_ref(), source_state(context));
    let writes = slugs
        .iter()
        .map(|slug| {
            let counts = counts.clone();
            NodeWrite {
                activity: ActivityContent {
                    target: slug.clone(),
                    summary: format!("patch_concept {slug}"),
                    why: None,
                    logged_as: None,
                },
                concepts: effect(&[], &[slug], &[]),
                share: ShareMeasure::Measure(Box::new(move || counts)),
            }
        })
        .collect();
    Ok(WriteDone {
        output: output(answer)?,
        record: WriteRecord::WroteEach(writes),
    })
}
