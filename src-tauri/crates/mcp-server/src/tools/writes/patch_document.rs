//! One existing document changed by its lines: the core of `patch_concept`, and of every write that
//! sets or removes a frontmatter key of a node it names (a relation, a `why`).

use vault_edit::{
    check_identity_patch, check_node_identity, edit_frontmatter, fill_missing_uid, patched,
    replace_body, stored_setting, FieldPatch, KeyChange, NodeFields, Setting, SourceDocument,
    SourceRefusal,
};
use confined_files::{ConfinedPath, PlanEntry};

use super::slug_refusal::slug_refusal;
use super::vault_view::VaultView;
use super::write_support::{
    identity_refusal, modified_ms, require_current, write_permit, SessionUids,
};
use crate::error::ToolError;
use crate::write_checkpoint::{Permit, WritePermit};

pub struct Patched {
    pub minted_uid: Option<String>,
    /// The time the file has now.
    pub modified_ms: Option<f64>,
}

pub fn source_refusal(view: &VaultView<'_>, slug: &str, refusal: SourceRefusal) -> ToolError {
    match refusal {
        SourceRefusal::Missing(_) => view.not_found("Doc not found", slug, false),
        other => ToolError::failed(other.to_string()),
    }
}

/// The changes a patch makes to the lines of a file: `null` removes a key, anything else sets it.
fn key_changes(patch: &FieldPatch, minted_uid: Option<&str>) -> Vec<KeyChange> {
    let mut changes: Vec<KeyChange> = patch
        .iter()
        .map(|(key, value)| match value {
            Setting::Null => KeyChange::remove(key.clone()),
            other => KeyChange::set(key.clone(), stored_setting(key, other.clone())),
        })
        .collect();
    if let Some(uid) = minted_uid {
        changes.push(KeyChange::set("uid", Setting::text(uid)));
    }
    changes
}

/// A change to one document that is checked and made into the text it will have, but not yet
/// written: a batch plans each of its patches before any of them is applied.
pub struct PlannedPatch {
    entry: PlanEntry,
    file: ConfinedPath,
    pub minted_uid: Option<String>,
}

impl PlannedPatch {
    /// The step to apply, and the file it changes, whose time is read once it has.
    pub fn into_parts(self) -> (PlanEntry, ConfinedPath) {
        (self.entry, self.file)
    }
}

pub fn plan_patch(
    write: &WritePermit<'_>,
    view: &VaultView<'_>,
    slug: &str,
    patch: &FieldPatch,
    body: Option<&str>,
    expected_mtime: Option<f64>,
) -> Result<PlannedPatch, ToolError> {
    let writable = write.write_path(slug).map_err(|error| slug_refusal(&error))?;
    let source = SourceDocument::read(writable.as_confined(), slug)
        .map_err(|refusal| source_refusal(view, slug, refusal))?;
    require_current(slug, expected_mtime, source.modified)?;
    let previous = NodeFields::from_frontmatter(source.document.frontmatter());
    check_identity_patch(&previous, patch).map_err(|refusal| identity_refusal(&refusal))?;
    let mut next = patched(&previous, patch);
    let minted_uid = fill_missing_uid(&previous, &mut next, &SessionUids);
    check_node_identity(view.documents(), slug, &next).map_err(|refusal| identity_refusal(&refusal))?;
    let mut text = edit_frontmatter(&source.raw, &key_changes(patch, minted_uid.as_deref()))
        .map_err(|refusal| ToolError::failed(refusal.to_string()))?;
    if let Some(body) = body {
        text = replace_body(&text, body).map_err(|refusal| ToolError::failed(refusal.to_string()))?;
    }
    let file = writable.as_confined().clone();
    let entry = PlanEntry::write(writable, text)
        .expecting_text(source.raw.clone())
        .expecting_modified(source.modified);
    Ok(PlannedPatch {
        entry,
        file,
        minted_uid,
    })
}

/// Applies planned patches all or nothing, refusing a file reserved for a person.
pub fn apply_patches(write: &WritePermit<'_>, planned: Vec<PlanEntry>) -> Result<(), ToolError> {
    write
        .apply(
            planned,
            confined_files::Reservations::Refuse(&|path, text| {
                vault_edit::reservation_in(path, text)
            }),
        )
        .map(|_| ())
}

pub fn patch_document(
    permit: &Permit<'_>,
    view: &VaultView<'_>,
    slug: &str,
    patch: &FieldPatch,
    body: Option<&str>,
    expected_mtime: Option<f64>,
) -> Result<Patched, ToolError> {
    let write = write_permit(permit)?;
    let planned = plan_patch(write, view, slug, patch, body, expected_mtime)?;
    let minted_uid = planned.minted_uid.clone();
    let (entry, file) = planned.into_parts();
    apply_patches(write, vec![entry])?;
    Ok(Patched {
        minted_uid,
        modified_ms: modified_ms(&file),
    })
}
