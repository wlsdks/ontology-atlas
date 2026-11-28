//! Who points at a node: the documents whose relation keys name it, and the ones whose body links
//! to it. Asked before a rename, a merge or a delete.

use serde::Serialize;

use crate::frontmatter::Value;
use crate::loaded_document::{DisplayTitle, FileReadError, LoadedDocument};
use crate::reference_index::ReferenceIndex;
use crate::relations::neighbor_refs;
use crate::schema::is_node_uid;

/// One document that points at the target.
#[derive(Debug, Serialize)]
pub struct Backlink<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uid: Option<&'a str>,
    pub slug: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<&'a str>,
    #[serde(rename = "isNode")]
    pub is_node: bool,
    pub title: DisplayTitle<'a>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<&'a Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mtime: Option<f64>,
    #[serde(rename = "matchedKeys", skip_serializing_if = "Option::is_none")]
    pub matched_keys: Option<Vec<&'static str>>,
    #[serde(rename = "matchedInBody", skip_serializing_if = "Option::is_none")]
    pub matched_in_body: Option<bool>,
    /// Set when a reference only might name the target: it ends like the target's slug and like
    /// another's, so it counts as a referrer without being an edge.
    #[serde(rename = "ambiguousTail", skip_serializing_if = "Option::is_none")]
    pub ambiguous_tail: Option<bool>,
}

/// Whether a reference that several documents could mean counts as pointing at each of them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AmbiguousReferences {
    Ignore,
    Count,
}

/// Every document that points at `target_slug`, in the order the vault lists them. The target is the
/// document its name resolves to, when it names exactly one. A body is asked about only through
/// its links ([`LoadedDocument::links_to`]); a body the list cannot speak for is read again.
pub fn find_backlinks<'a>(
    documents: &'a [LoadedDocument],
    index: &ReferenceIndex<'a>,
    target_slug: &str,
    ambiguous: AmbiguousReferences,
) -> Result<Vec<Backlink<'a>>, FileReadError> {
    let resolved_target = index.resolve(target_slug).unwrap_or(target_slug);
    let mut needles: Vec<&str> = Vec::new();
    for needle in [
        target_slug,
        resolved_target,
        target_slug.rsplit('/').next().unwrap_or(target_slug),
        resolved_target
            .rsplit('/')
            .next()
            .unwrap_or(resolved_target),
    ] {
        if !needle.is_empty() && !needles.contains(&needle) {
            needles.push(needle);
        }
    }
    let mut matches = Vec::new();
    for document in documents {
        if document.slug() == resolved_target {
            continue;
        }
        let mut matched_keys: Vec<&'static str> = Vec::new();
        let mut ambiguous_hit = false;
        for neighbor in neighbor_refs(document.frontmatter()) {
            let candidates = index.candidates(&neighbor.reference);
            let names_target = match candidates.as_slice() {
                [only] => *only == resolved_target,
                several => {
                    let maybe = ambiguous == AmbiguousReferences::Count
                        && several.contains(&resolved_target);
                    ambiguous_hit |= maybe;
                    maybe
                }
            };
            if names_target && !matched_keys.contains(&neighbor.key) {
                matched_keys.push(neighbor.key);
            }
        }
        let mut body_hit = false;
        for needle in &needles {
            if document.links_to(needle)? {
                body_hit = true;
                break;
            }
        }
        if matched_keys.is_empty() && !body_hit {
            continue;
        }
        let kind = document
            .node_kind()
            .map(|_| document.frontmatter().text("kind").unwrap_or_default());
        let uid = kind
            .and_then(|_| document.frontmatter().text("uid"))
            .filter(|uid| is_node_uid(uid));
        matches.push(Backlink {
            uid,
            slug: document.slug(),
            kind,
            is_node: kind.is_some(),
            title: document.display_title(),
            domain: document.frontmatter().get("domain"),
            mtime: document.modified_ms(),
            matched_keys: (!matched_keys.is_empty()).then_some(matched_keys),
            matched_in_body: body_hit.then_some(true),
            ambiguous_tail: ambiguous_hit.then_some(true),
        });
    }
    Ok(matches)
}
