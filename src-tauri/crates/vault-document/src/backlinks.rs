//! Who points at a node: the documents whose relation keys name it, and the ones whose body links
//! to it. Asked before a rename, a merge or a delete.

use serde::Serialize;

use crate::frontmatter::Value;
use crate::loaded_vault::{DisplayTitle, LoadedDocument};
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
}

/// Whether `body` links to `needle` as a wiki link (`[[n]]`, `[[n#`, `[[n|`) or a Markdown link to
/// its file (`(n.md`, `/n.md`).
fn body_links_to(body: &str, needle: &str) -> bool {
    [
        format!("[[{needle}]]"),
        format!("[[{needle}#"),
        format!("[[{needle}|"),
        format!("({needle}.md"),
        format!("/{needle}.md"),
    ]
    .iter()
    .any(|form| body.contains(form.as_str()))
}

/// Every document that points at `target_slug`, in the order the vault lists them. The target is the
/// document its name resolves to, when it names exactly one.
pub fn find_backlinks<'a>(
    documents: &'a [LoadedDocument],
    index: &ReferenceIndex<'a>,
    target_slug: &str,
) -> Vec<Backlink<'a>> {
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
        for neighbor in neighbor_refs(document.frontmatter()) {
            if index.resolve(&neighbor.reference) == Some(resolved_target)
                && !matched_keys.contains(&neighbor.key)
            {
                matched_keys.push(neighbor.key);
            }
        }
        let body_hit = {
            let body = document.document().body();
            needles.iter().any(|needle| body_links_to(&body, needle))
        };
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
        });
    }
    matches
}
