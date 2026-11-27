//! The nodes nothing points at.

use std::collections::HashSet;

use serde::Serialize;

use crate::frontmatter::Value;
use crate::loaded_document::{DisplayTitle, LoadedDocument};
use crate::reference_index::ReferenceIndex;
use crate::relations::neighbor_refs;

/// The kinds left out of an orphan search unless the caller names its own: a project is the root of
/// the tree, and the vault's README is not a concept.
pub const DEFAULT_EXCLUDED_KINDS: [&str; 2] = ["project", "vault-readme"];

#[derive(Debug, Serialize)]
pub struct Orphan<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uid: Option<&'a Value>,
    pub slug: &'a str,
    pub kind: &'a str,
    pub title: DisplayTitle<'a>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<&'a Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mtime: Option<f64>,
}

/// The nodes no other node points at from a relation key. An ambiguous reference counts as a
/// reference to every candidate, so no document a vault plainly names is reported as an orphan.
/// `only_kind` narrows the answer to one kind; `excluded_kinds` replaces the default exclusions.
pub fn find_orphans<'a>(
    documents: &'a [LoadedDocument],
    index: &ReferenceIndex<'a>,
    only_kind: Option<&str>,
    excluded_kinds: Option<&[String]>,
) -> Vec<Orphan<'a>> {
    let mut referenced: HashSet<&str> = HashSet::new();
    for document in documents {
        for neighbor in neighbor_refs(document.frontmatter()) {
            for candidate in index.candidates(&neighbor.reference) {
                if candidate != document.slug() {
                    referenced.insert(candidate);
                }
            }
        }
    }
    let excluded = |kind: &str| match excluded_kinds {
        Some(kinds) => kinds.iter().any(|excluded| excluded == kind),
        None => DEFAULT_EXCLUDED_KINDS.contains(&kind),
    };
    documents
        .iter()
        .filter_map(|document| {
            let kind = document
                .frontmatter()
                .text("kind")
                .filter(|kind| !kind.is_empty())?;
            if excluded(kind)
                || only_kind.is_some_and(|only| only != kind)
                || referenced.contains(document.slug())
            {
                return None;
            }
            Some(Orphan {
                uid: document.frontmatter().get("uid"),
                slug: document.slug(),
                kind,
                title: document.display_title(),
                domain: document.frontmatter().get("domain"),
                mtime: document.modified_ms(),
            })
        })
        .collect()
}
