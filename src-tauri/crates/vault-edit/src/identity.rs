//! Who a node is: the `uid:` a writer mints once, the identities a merge absorbs, and the checks
//! that keep two nodes from claiming one.

use answer_format::collation::compare_text;
use vault_document::frontmatter::Value;
use vault_document::schema::{inspect_merged_uids, node_uid_issue, MergedUids};
use vault_document::LoadedDocument;

use crate::node_fields::{FieldPatch, NodeFields};
use crate::setting::Setting;

/// Where a node's identity comes from. The server hands in the random source; a test or a pinned
/// run hands in another.
pub trait NodeUids: Send + Sync {
    fn mint(&self) -> String;
}

/// Why a write may not give a node the identity it asks for.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum IdentityRefusal {
    #[error("`uid:` is immutable. Rename or reclassify the node without changing its UID.")]
    Immutable,
    #[error("`merged_uids:` is merge_concepts-owned identity history and cannot be edited by a generic patch.")]
    MergeOwned,
    /// A `uid:` or `merged_uids:` that is not the shape the format has.
    #[error("{0}")]
    Malformed(&'static str),
    #[error("`merged_uids:` must be a deduplicated, ascending canonical UUIDv4 set.")]
    NotCanonical,
    #[error("UID collision: {uid} already belongs to \"{slug}\". Create a new node with a fresh UID, or use merge_concepts to absorb an existing identity.")]
    Collision { uid: String, slug: String },
    #[error("Both merge_concepts nodes must have valid lowercase UUIDv4 identities.")]
    MergeNeedsIdentities,
    #[error("UID collision during merge: {0} is already claimed by both nodes.")]
    MergeCollision(String),
}

impl IdentityRefusal {
    /// Whether the call's own value is what is wrong, as against the vault being in a state the
    /// write cannot go on from.
    pub fn is_invalid_argument(&self) -> bool {
        matches!(
            self,
            Self::MergeOwned | Self::Malformed(_) | Self::NotCanonical
        )
    }
}

/// A patch may fill an absent `uid:` (the one way to repair a hand-written node) and may not
/// change a present one; `merged_uids:` belongs to a merge alone.
pub fn check_identity_patch(
    previous: &NodeFields,
    patch: &FieldPatch,
) -> Result<(), IdentityRefusal> {
    if let Some((_, value)) = patch.iter().find(|(key, _)| key == "uid") {
        let same = previous.get("uid") == Some(value);
        if !same && previous.has_settled_uid() {
            return Err(IdentityRefusal::Immutable);
        }
    }
    if patch.iter().any(|(key, _)| key == "merged_uids") {
        return Err(IdentityRefusal::MergeOwned);
    }
    Ok(())
}

/// The first write to a node with no identity gives it one. `Some` is the uid this write gave, which
/// the answer says out loud.
pub fn fill_missing_uid(
    previous: &NodeFields,
    next: &mut NodeFields,
    uids: &dyn NodeUids,
) -> Option<String> {
    next.node_kind()?;
    if previous.has_settled_uid() {
        return None;
    }
    if next.has_settled_uid() {
        return next.text("uid").map(str::to_string);
    }
    let minted = uids.mint();
    next.set("uid", Setting::Text(minted.clone()));
    Some(minted)
}

fn as_value(setting: &Setting) -> Value {
    match setting {
        Setting::Text(text) => Value::Text(text.clone()),
        Setting::Number(number) => Value::Number(*number),
        Setting::Bool(flag) => Value::Bool(*flag),
        Setting::List(items) => Value::List(
            items
                .iter()
                .map(|item| item.as_text().unwrap_or_default().to_string())
                .collect(),
        ),
        Setting::Null | Setting::Map(_) => Value::Text(String::new()),
    }
}

fn identity_claims(uid: Option<&str>, merged: &[String]) -> Vec<String> {
    let mut claims: Vec<String> = Vec::new();
    for claim in uid.into_iter().map(str::to_string).chain(merged.iter().cloned()) {
        if !claim.is_empty() && !claims.contains(&claim) {
            claims.push(claim);
        }
    }
    claims
}

fn merged_of(fields: &NodeFields) -> Vec<String> {
    match fields.get("merged_uids") {
        Some(Setting::List(items)) => items
            .iter()
            .filter_map(|item| item.as_text().map(str::to_string))
            .collect(),
        _ => Vec::new(),
    }
}

/// Refuses a node whose `uid:` or `merged_uids:` is malformed or claimed by another file.
pub fn check_node_identity(
    documents: &[LoadedDocument],
    slug: &str,
    fields: &NodeFields,
) -> Result<(), IdentityRefusal> {
    if fields.node_kind().is_none() {
        return Ok(());
    }
    let uid_value = fields.get("uid").map(as_value);
    if let Some(issue) = node_uid_issue(uid_value.as_ref()) {
        return Err(IdentityRefusal::Malformed(issue));
    }
    let uid = fields.text("uid").unwrap_or_default();
    let merged_value = fields.get("merged_uids").map(as_value);
    match inspect_merged_uids(uid, merged_value.as_ref()) {
        MergedUids::Invalid(issue) => return Err(IdentityRefusal::Malformed(issue)),
        MergedUids::NotCanonical => return Err(IdentityRefusal::NotCanonical),
        MergedUids::Canonical => {}
    }
    let claims = identity_claims(Some(uid), &merged_of(fields));
    for document in documents {
        if document.slug() == slug {
            continue;
        }
        let held_merged: Vec<String> = document
            .frontmatter()
            .list("merged_uids")
            .map(<[String]>::to_vec)
            .unwrap_or_default();
        for claimed in identity_claims(document.frontmatter().text("uid"), &held_merged) {
            if claims.contains(&claimed) {
                return Err(IdentityRefusal::Collision {
                    uid: claimed,
                    slug: document.slug().to_string(),
                });
            }
        }
    }
    Ok(())
}

/// What a merge keeps of two identities.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MergeHistory {
    pub survivor_uid: String,
    /// Every identity the absorbed node held, its own first.
    pub absorbed_uids: Vec<String>,
    /// The survivor's `merged_uids:` after the merge: ascending, without repeats.
    pub merged_uids: Vec<String>,
}

fn canonical_merged(fields: &NodeFields) -> Result<Vec<String>, IdentityRefusal> {
    let uid = fields.text("uid").unwrap_or_default();
    let merged = fields.get("merged_uids").map(as_value);
    if let MergedUids::Invalid(issue) = inspect_merged_uids(uid, merged.as_ref()) {
        return Err(IdentityRefusal::Malformed(issue));
    }
    Ok(sorted_unique(merged_of(fields)))
}

fn sorted_unique(mut items: Vec<String>) -> Vec<String> {
    items.sort_by(|left, right| compare_text(left, right));
    items.dedup();
    items
}

pub fn merge_identity_history(
    from: &NodeFields,
    into: &NodeFields,
) -> Result<MergeHistory, IdentityRefusal> {
    let uid_issue = |fields: &NodeFields| node_uid_issue(fields.get("uid").map(as_value).as_ref());
    if uid_issue(from).is_some() || uid_issue(into).is_some() {
        return Err(IdentityRefusal::MergeNeedsIdentities);
    }
    let from_merged = canonical_merged(from)?;
    let into_merged = canonical_merged(into)?;
    let from_uid = from.text("uid").unwrap_or_default().to_string();
    let into_uid = into.text("uid").unwrap_or_default().to_string();
    let absorbed: Vec<String> = std::iter::once(from_uid).chain(from_merged).collect();
    let survivor_claims: Vec<&String> = std::iter::once(&into_uid).chain(&into_merged).collect();
    if let Some(overlap) = absorbed.iter().find(|uid| survivor_claims.contains(uid)) {
        return Err(IdentityRefusal::MergeCollision(overlap.clone()));
    }
    let merged = sorted_unique(into_merged.into_iter().chain(absorbed.iter().cloned()).collect());
    Ok(MergeHistory {
        survivor_uid: into_uid,
        absorbed_uids: absorbed,
        merged_uids: merged,
    })
}
