//! How many nodes of each kind a vault holds, and how many names it uses without a document.

use std::collections::{HashMap, HashSet};

use answer_format::utf16;
use answer_format::whitespace::trim;
use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};

use crate::loaded_vault::LoadedDocument;
use crate::reference_index::tail_of;
use crate::relations::neighbor_refs;

/// Node counts by kind, listed in UTF-16 order of the kind.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KindCounts(Vec<(String, usize)>);

impl KindCounts {
    pub fn iter(&self) -> impl Iterator<Item = (&str, usize)> {
        self.0.iter().map(|(kind, count)| (kind.as_str(), *count))
    }
}

impl Serialize for KindCounts {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (kind, count) in &self.0 {
            map.serialize_entry(kind, count)?;
        }
        map.end()
    }
}

/// The inventory of a vault in one pass.
#[derive(Debug, Clone, Serialize)]
pub struct KindCensus {
    pub total: usize,
    #[serde(rename = "byKind")]
    pub by_kind: KindCounts,
    /// Concepts named only in a relation key. The map counts them, so without this number `total`
    /// reads as if the screen inflated it; they have no kind, so they stay out of the per-kind
    /// counts.
    #[serde(rename = "referencedOnlyTotal")]
    pub referenced_only_total: usize,
}

pub fn kind_census(documents: &[LoadedDocument]) -> KindCensus {
    let mut counts: HashMap<&str, usize> = HashMap::new();
    let mut total = 0;
    let mut documented: HashSet<&str> = HashSet::with_capacity(documents.len() * 2);
    for document in documents {
        documented.insert(document.slug());
        let tail = tail_of(document.slug());
        if !tail.is_empty() {
            documented.insert(tail);
        }
        if let Some(declared) = document
            .frontmatter()
            .text("slug")
            .map(trim)
            .filter(|slug| !slug.is_empty())
        {
            documented.insert(declared);
        }
        if let Some(kind) = document
            .frontmatter()
            .text("kind")
            .filter(|kind| !kind.is_empty())
        {
            *counts.entry(kind).or_default() += 1;
            total += 1;
        }
    }
    let mut referenced_only: HashSet<String> = HashSet::new();
    for document in documents {
        for neighbor in neighbor_refs(document.frontmatter()) {
            if !documented.contains(neighbor.reference.as_str()) {
                referenced_only.insert(neighbor.reference);
            }
        }
    }
    let mut by_kind: Vec<(String, usize)> = counts
        .into_iter()
        .map(|(kind, count)| (kind.to_string(), count))
        .collect();
    by_kind.sort_by(|(left, _), (right, _)| utf16::compare(left, right));
    KindCensus {
        total,
        by_kind: KindCounts(by_kind),
        referenced_only_total: referenced_only.len(),
    }
}
