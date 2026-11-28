//! A move of references, as a write tool answers and applies it: what the answer says about the
//! referrers, and the plan entries that rewrite them.

use confined_files::{PlanEntry, ModifiedTime};
use vault_edit::{KeptEntry, RedirectPlan, Setting};

use super::answer_fields::Fields;
use super::vault_view::VaultView;
use crate::error::ToolError;
use crate::write_checkpoint::WritePermit;
use super::slug_refusal::slug_refusal;

/// The referrers a move touches, as `{ updates, totalUpdated }`: which file, which keys, and whether
/// its body changed. A referrer's whole before and after is in the Git diff.
pub fn backlink_updates(plan: &RedirectPlan) -> Setting {
    let updates: Vec<Setting> = plan
        .updates
        .iter()
        .map(|update| {
            Fields::new()
                .with_text("slug", &update.slug)
                .with("keys", Setting::texts(update.keys.clone()))
                .with_bool("bodyChanged", update.body_changed)
                .into_setting()
        })
        .collect();
    #[allow(clippy::cast_precision_loss, reason = "a count of files")]
    let total = updates.len() as f64;
    Fields::new()
        .with("updates", Setting::List(updates))
        .with("totalUpdated", Setting::Number(total))
        .into_setting()
}

fn kept_entry_warning(entry: &KeptEntry, new_kind: &str) -> String {
    let KeptEntry {
        slug,
        key,
        reference,
        holder_kind,
    } = entry;
    let holder = if holder_kind.is_empty() {
        "a document with no kind".to_string()
    } else {
        format!("a {holder_kind}")
    };
    format!(
        "\"{slug}\" still lists \"{reference}\" under {key}:, but \"{reference}\" is now a {new_kind} and {holder} keeps no list for a {new_kind}, so the entry was left where it was rather than guessed into another relation. Readers still count it as one of \"{slug}\"'s {key}. Decide what \"{slug}\" means by it: remove_relation({{from:\"{slug}\", to:\"{reference}\", type:\"{key}\"}}) drops it, and an add_relations row with the type that fits restates it."
    )
}

/// One sentence per entry a kind change left in its list, and per referrer a write tool never edits.
pub fn warnings(plan: &RedirectPlan, new_kind: Option<&str>, old_slug: &str) -> Vec<String> {
    let kept = plan
        .kept_in_place
        .iter()
        .map(|entry| kept_entry_warning(entry, new_kind.unwrap_or_default()));
    let unwritable = plan.unwritable_referrers.iter().map(|slug| {
        format!(
            "{slug} refers to {old_slug}, but write tools never edit an agent instruction file or a hidden path, so that reference was left as it was: update it by hand."
        )
    });
    kept.chain(unwritable).collect()
}

/// The entries that rewrite each referrer, from the text each was planned from.
pub fn rewrite_entries(
    write: &WritePermit<'_>,
    view: &VaultView<'_>,
    plan: &RedirectPlan,
    skipping: &[&str],
) -> Result<Vec<PlanEntry>, ToolError> {
    let mut entries = Vec::new();
    for rewrite in &plan.rewrites {
        if skipping.contains(&rewrite.source.slug.as_str()) {
            continue;
        }
        let Some(document) = view.document(&rewrite.source.slug) else {
            continue;
        };
        let writable = write
            .writable(document.file())
            .map_err(|error| slug_refusal(&error))?;
        entries.push(entered(
            PlanEntry::write(writable, rewrite.text.clone()),
            &rewrite.source.raw,
            rewrite.source.modified,
        ));
    }
    Ok(entries)
}

/// An entry that is only applied to the file it was made from.
pub fn entered(entry: PlanEntry, raw: &str, modified: Option<ModifiedTime>) -> PlanEntry {
    entry
        .expecting_text(raw.to_string())
        .expecting_modified(modified)
}
