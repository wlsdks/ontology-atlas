//! The refusals every agent write passes before it touches disk: a frontmatter patch that no agent
//! may make, a node reserved for a person, and a relation endpoint that is not a graph node.
//! Nothing here writes.

use answer_format::whitespace::trim;
use vault_document::schema::{
    GRAPH_ARRAY_KEYS, REVIEW_NOTE_KEY, REVIEW_STATE_HUMAN_DECIDES, REVIEW_STATE_KEY,
};
use vault_document::LoadedDocument;
use vault_edit::{Setting, CREATABLE_KINDS};

use super::object_checks::{has_key, member, non_blank, optional_text_list};
use crate::error::ToolError;

const GRAPH_REF_ARRAY_MAX_ITEMS: usize = 500;
const CREATED_BY_KEY: &str = "created_by";
const EVIDENCE_CHECKED_KEY: &str = "evidence_checked";
const HUMAN_ONLY_REVIEW_KEYS: [&str; 3] = ["reviewed_by", "reviewed_at", "reviewed_digest"];
const REVIEW_STATE_CONFIRMED: &str = "confirmed";

/// `evidence_checked` says an agent reread the concept against its code at that commit, and only
/// the desktop app's recheck writes it after the read; from a write tool it would clear a stale
/// concept unread.
pub fn refuse_recheck_mark(members: &[(String, Setting)], label: &str) -> Result<(), ToolError> {
    if !has_key(members, EVIDENCE_CHECKED_KEY) {
        return Ok(());
    }
    Err(ToolError::failed(format!(
        "{label}.{EVIDENCE_CHECKED_KEY} is written only by the desktop app's recheck, after it gives an agent the concept and what changed in its code. A write tool setting it would mark the concept current without that read; leave it as it is. If the concept is out of date, change its body or path instead."
    )))
}

/// Raising `review_state: human_decides` is allowed; clearing or confirming is refused, since
/// both assert a person acted.
fn require_agent_writable_review_fields(members: &[(String, Setting)]) -> Result<(), ToolError> {
    for key in HUMAN_ONLY_REVIEW_KEYS {
        if has_key(members, key) {
            return Err(ToolError::failed(format!(
                "frontmatter.{key} records a person's review, so Atlas write tools do not set it — an agent writing it would be asserting the review, not recording it. If you cannot settle this node yourself, set {REVIEW_STATE_KEY}: {REVIEW_STATE_HUMAN_DECIDES} with a {REVIEW_NOTE_KEY} instead."
            )));
        }
    }
    let Some(state) = member(members, REVIEW_STATE_KEY) else {
        return Ok(());
    };
    match state {
        Setting::Text(text) if text == REVIEW_STATE_HUMAN_DECIDES => Ok(()),
        Setting::Null => Err(cannot_clear()),
        Setting::Text(text) if text.is_empty() => Err(cannot_clear()),
        Setting::Text(text) if text == REVIEW_STATE_CONFIRMED => Err(ToolError::failed(format!(
            "frontmatter.{REVIEW_STATE_KEY}: {REVIEW_STATE_CONFIRMED} states that a person judged this node, so Atlas write tools do not set it. Set {REVIEW_STATE_HUMAN_DECIDES} with a {REVIEW_NOTE_KEY} if you want a person to look at it."
        ))),
        _ => Err(ToolError::invalid(format!(
            "frontmatter.{REVIEW_STATE_KEY} must be {REVIEW_STATE_HUMAN_DECIDES} on this path ({REVIEW_STATE_HUMAN_DECIDES} | {REVIEW_STATE_CONFIRMED} are the only values)."
        ))),
    }
}

fn cannot_clear() -> ToolError {
    ToolError::invalid(format!(
        "frontmatter.{REVIEW_STATE_KEY} cannot be cleared from this path — a reservation is released by the person who made it. Report the node instead; leaving it in place is the correct outcome of an agent turn."
    ))
}

pub fn require_valid_frontmatter_patch(members: &[(String, Setting)]) -> Result<(), ToolError> {
    for (key, value) in members {
        if !GRAPH_ARRAY_KEYS.contains(&key.as_str()) || matches!(value, Setting::Null) {
            continue;
        }
        optional_text_list(Some(value), &format!("frontmatter.{key}"), GRAPH_REF_ARRAY_MAX_ITEMS)?;
    }
    if let Some(kind) = member(members, "kind") {
        if matches!(kind, Setting::Null) {
            return Err(ToolError::invalid(
                "kind cannot be deleted from a vault node — pass a valid kind instead.",
            ));
        }
        let kind = non_blank(Some(kind), "frontmatter.kind")?;
        if !CREATABLE_KINDS.contains(&kind) {
            return Err(ToolError::invalid(format!(
                "frontmatter.kind must be one of: {}.",
                CREATABLE_KINDS.join(", ")
            )));
        }
    }
    for key in ["domain", "slug"] {
        match member(members, key) {
            None | Some(Setting::Null) => {}
            Some(value) => {
                non_blank(Some(value), &format!("frontmatter.{key}"))?;
            }
        }
    }
    if has_key(members, CREATED_BY_KEY) {
        return Err(ToolError::invalid(format!(
            "frontmatter.{CREATED_BY_KEY} cannot be patched — authorship is stamped once, at write time, by the path that proves it. Patching an existing node is not authorship; leave the field as it is (or absent, which means unknown)."
        )));
    }
    refuse_recheck_mark(members, "frontmatter")?;
    require_agent_writable_review_fields(members)
}

/// Refuses the whole write when the node itself is reserved, since the reserved meaning lives in
/// the body and relations too. Every write tool naming an existing node runs this before touching
/// disk.
pub fn require_not_reserved(
    document: Option<&LoadedDocument>,
    operation: &str,
) -> Result<(), ToolError> {
    let Some(document) = document else {
        return Ok(());
    };
    let frontmatter = document.frontmatter();
    if frontmatter.text(REVIEW_STATE_KEY) != Some(REVIEW_STATE_HUMAN_DECIDES) {
        return Ok(());
    }
    let note = frontmatter
        .truthy(REVIEW_NOTE_KEY)
        .map(|note| note.display_text());
    Err(ToolError::failed(format!(
        "{operation} refused: {} carries {REVIEW_STATE_KEY}: {REVIEW_STATE_HUMAN_DECIDES}, so it is reserved for a person.{} Report it and let the person decide; only they release the reservation.",
        document.slug(),
        note.map(|note| format!(" What they have to decide: {note}"))
            .unwrap_or_default(),
    )))
}

/// Both ends of a relation must be graph nodes, not just existing `.md` files, or a memo in the
/// vault becomes a dangling reference the compiler later discards.
pub fn require_graph_node(
    document: Option<&LoadedDocument>,
    slug: &str,
    role: &str,
) -> Result<(), ToolError> {
    if document
        .and_then(LoadedDocument::node_kind)
        .is_some_and(|kind| !trim(kind).is_empty())
    {
        return Ok(());
    }
    Err(ToolError::failed(format!(
        "{role} \"{slug}\" is not a graph node — it has no `kind:`, so a relation to it would be a dangling reference the compiler drops. Ordinary markdown (meeting notes, memos, drafts) lives in the same folder by design. To make it a node, add a `kind:` with patch_concept, or use absorb_document to turn its content into typed nodes."
    )))
}

/// What a preview of a destructive write says, in the four fields a client reads.
pub struct PreviewState {
    pub preview_ready: bool,
    pub can_confirm: bool,
    pub would_change: bool,
    pub blocked_reasons: Vec<String>,
}

impl PreviewState {
    pub fn of(dry_run: bool, would_change: bool, blocked_reasons: Vec<String>) -> Self {
        let mut reasons: Vec<String> = Vec::new();
        for reason in blocked_reasons {
            if !trim(&reason).is_empty() && !reasons.contains(&reason) {
                reasons.push(reason);
            }
        }
        Self {
            preview_ready: dry_run,
            can_confirm: dry_run && would_change && reasons.is_empty(),
            would_change: dry_run && would_change,
            blocked_reasons: reasons,
        }
    }
}
