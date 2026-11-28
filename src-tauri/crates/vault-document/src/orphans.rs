//! The nodes nothing points at, read from the files.

use std::collections::HashSet;

use serde::Serialize;

use crate::frontmatter::Value;
use crate::loaded_document::{DisplayTitle, LoadedDocument};
use crate::reference_index::ReferenceIndex;
use crate::relations::neighbor_refs;

/// The kinds left out of an orphan search unless the caller names its own: a project is the root of
/// the tree, and the vault's README is not a concept.
pub const DEFAULT_EXCLUDED_KINDS: [&str; 2] = ["project", "vault-readme"];

/// A node no other node points at: it has no incoming relation, and `out_degree` distinct nodes it
/// points at itself.
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
    #[serde(rename = "inDegree")]
    pub in_degree: usize,
    #[serde(rename = "outDegree")]
    pub out_degree: usize,
    pub degree: usize,
}

/// What an orphan search narrows to. `excluded_kinds` replaces the default exclusions; without it
/// the default applies, unless a `kind` is asked for.
#[derive(Debug, Default, Clone, Copy)]
pub struct OrphanFilter<'q> {
    pub kind: Option<&'q str>,
    pub domain: Option<&'q str>,
    pub has_outgoing: Option<bool>,
    pub excluded_kinds: Option<&'q [String]>,
}

impl OrphanFilter<'_> {
    /// The kinds this search leaves out, without repeats, in the order they were named.
    pub fn excluded(&self) -> Vec<&str> {
        let named: Vec<&str> = match self.excluded_kinds {
            Some(kinds) => kinds.iter().map(String::as_str).collect(),
            None if self.kind.is_some() => Vec::new(),
            None => DEFAULT_EXCLUDED_KINDS.to_vec(),
        };
        let mut distinct: Vec<&str> = Vec::new();
        for kind in named {
            if !distinct.contains(&kind) {
                distinct.push(kind);
            }
        }
        distinct
    }
}

/// The nodes no other node points at from a relation key, in document order. An ambiguous
/// reference counts as a reference to every candidate, so no document a vault plainly names is
/// reported as an orphan.
pub fn find_orphans<'a>(
    documents: &'a [LoadedDocument],
    index: &ReferenceIndex<'a>,
    filter: &OrphanFilter<'_>,
) -> Vec<Orphan<'a>> {
    let mut referenced: HashSet<&str> = HashSet::new();
    let mut points_at: Vec<usize> = Vec::with_capacity(documents.len());
    for document in documents {
        let mut targets: HashSet<&str> = HashSet::new();
        for neighbor in neighbor_refs(document.frontmatter()) {
            for candidate in index.candidates(&neighbor.reference) {
                if candidate != document.slug() {
                    referenced.insert(candidate);
                    targets.insert(candidate);
                }
            }
        }
        points_at.push(targets.len());
    }
    let excluded = filter.excluded();
    documents
        .iter()
        .zip(points_at)
        .filter_map(|(document, out_degree)| {
            let kind = document
                .frontmatter()
                .text("kind")
                .filter(|kind| !kind.is_empty())?;
            let domain = document.frontmatter().get("domain");
            let in_domain = filter
                .domain
                .is_none_or(|wanted| matches!(domain, Some(Value::Text(text)) if text == wanted));
            if excluded.contains(&kind)
                || filter.kind.is_some_and(|only| only != kind)
                || !in_domain
                || referenced.contains(document.slug())
                || filter
                    .has_outgoing
                    .is_some_and(|wanted| (out_degree > 0) != wanted)
            {
                return None;
            }
            Some(Orphan {
                uid: document.frontmatter().get("uid"),
                slug: document.slug(),
                kind,
                title: document.display_title(),
                domain,
                mtime: document.modified_ms(),
                in_degree: 0,
                out_degree,
                degree: out_degree,
            })
        })
        .collect()
}
