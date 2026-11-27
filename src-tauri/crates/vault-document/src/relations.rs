//! The frontmatter keys that draw edges, and the references they hold.

use std::collections::HashSet;

use answer_format::collation::compare_text;
use answer_format::whitespace::trim;

use crate::frontmatter::{Frontmatter, Value};

/// The list keys read as graph edges, most specific first. Every reader shares this one list.
pub const NEIGHBOR_KEYS: [&str; 8] = [
    "domains",
    "capabilities",
    "elements",
    "dependencies",
    "relates",
    "contains",
    "describes",
    "broader",
];

/// `depends_on:` is an authoring alias of `dependencies:`.
const DEPENDS_ON: &str = "depends_on";
const DEPENDENCIES: &str = "dependencies";

/// The key of the single parent reference.
const DOMAIN: &str = "domain";

/// The keys a `has(...)` filter and a graph-array check accept: the list keys and the alias.
pub const GRAPH_ARRAY_KEYS: [&str; 9] = [
    "domains",
    "capabilities",
    "elements",
    "dependencies",
    "relates",
    "contains",
    "describes",
    "broader",
    DEPENDS_ON,
];

/// One edge a document draws: the canonical key it came under and the reference as written,
/// trimmed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NeighborRef {
    pub key: &'static str,
    pub reference: String,
}

/// The references of one document, a key and a reference listed once however often it is written:
/// the list keys in their order, then the alias, then the single `domain:`.
pub fn neighbor_refs(frontmatter: &Frontmatter) -> Vec<NeighborRef> {
    let mut refs = Vec::new();
    let mut seen: HashSet<(&'static str, String)> = HashSet::new();
    let mut push = |key: &'static str, reference: &str| {
        let trimmed = trim(reference);
        if trimmed.is_empty() {
            return;
        }
        if seen.insert((key, trimmed.to_string())) {
            refs.push(NeighborRef {
                key,
                reference: trimmed.to_string(),
            });
        }
    };
    for key in NEIGHBOR_KEYS {
        for item in frontmatter.list(key).unwrap_or_default() {
            push(key, item);
        }
    }
    for item in frontmatter.list(DEPENDS_ON).unwrap_or_default() {
        push(DEPENDENCIES, item);
    }
    if let Some(domain) = frontmatter.text(DOMAIN) {
        push(DOMAIN, domain);
    }
    refs
}

/// The `dependencies:` list and its alias, joined: what the document says it depends on.
pub fn dependency_refs(frontmatter: &Frontmatter) -> Vec<&str> {
    let mut refs: Vec<&str> = Vec::new();
    for key in [DEPENDENCIES, DEPENDS_ON] {
        refs.extend(
            frontmatter
                .list(key)
                .unwrap_or_default()
                .iter()
                .map(String::as_str),
        );
    }
    refs
}

/// A relation list as a reader shows it: trimmed, each once, in the order every list is ordered.
pub fn normalized_refs(values: &[&str]) -> Vec<String> {
    let mut seen: HashSet<&str> = HashSet::new();
    let mut refs: Vec<String> = Vec::new();
    for value in values {
        let reference = trim(value);
        if !reference.is_empty() && seen.insert(reference) {
            refs.push(reference.to_string());
        }
    }
    refs.sort_by(|left, right| compare_text(left, right));
    refs
}

/// The sentence a document's `relation_notes` gives for a reference, looked up as written before
/// the slug it resolves to. `None` when it gives none: an absent rationale is no claim.
pub fn relation_note_for(
    frontmatter: &Frontmatter,
    reference: &str,
    resolved_slug: Option<&str>,
) -> Option<String> {
    let Some(Value::Map(notes)) = frontmatter.get("relation_notes") else {
        return None;
    };
    [Some(reference), resolved_slug]
        .into_iter()
        .flatten()
        .find_map(|key| match notes.get(key) {
            Some(crate::frontmatter::Scalar::Text(text)) if !trim(text).is_empty() => {
                Some(trim(text).to_string())
            }
            _ => None,
        })
}
