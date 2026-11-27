//! Which document a name from an agent means: an exact slug, the disk's spelling of one, a declared
//! `slug:` alias or a last segment; and, when it means none, the slugs it may have meant. A name
//! that means two documents is refused rather than guessed.

use std::collections::HashMap;

use answer_format::whitespace::trim;
use confined_files::VaultRoot;

use crate::frontmatter::Value;
use crate::loaded_document::LoadedDocument;
use crate::read_hints::Reference;
use crate::reference_index::tail_of;

/// A name that means more than one document, in the words an agent reads.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{0}")]
pub struct AmbiguousName(pub String);

/// The documents of a vault by the names they answer to.
#[derive(Debug)]
pub struct SlugLookup<'a> {
    by_slug: HashMap<&'a str, &'a LoadedDocument>,
    by_tail: HashMap<&'a str, Vec<&'a str>>,
    by_declared_slug: HashMap<&'a str, Vec<&'a str>>,
}

impl<'a> SlugLookup<'a> {
    pub fn new(documents: &'a [LoadedDocument]) -> Self {
        let mut by_slug = HashMap::with_capacity(documents.len());
        let mut by_tail: HashMap<&str, Vec<&str>> = HashMap::new();
        let mut by_declared_slug: HashMap<&str, Vec<&str>> = HashMap::new();
        for document in documents {
            by_slug.entry(document.slug()).or_insert(document);
            by_tail
                .entry(tail_of(document.slug()))
                .or_default()
                .push(document.slug());
            if let Some(declared) = document.frontmatter().text("slug") {
                by_declared_slug
                    .entry(trim(declared))
                    .or_default()
                    .push(document.slug());
            }
        }
        Self {
            by_slug,
            by_tail,
            by_declared_slug,
        }
    }

    /// The slug `name` means, or `None` when it means no document. An exact slug first; then the
    /// disk's own spelling, because a disk that ignores case opens a wrong-case name while every
    /// match downstream is case-sensitive; then a declared `slug:`; then a last segment.
    pub fn resolve(&self, root: &VaultRoot, name: &str) -> Result<Option<String>, AmbiguousName> {
        if trim(name).is_empty() {
            return Ok(None);
        }
        if self.by_slug.contains_key(name) {
            return Ok(Some(name.to_string()));
        }
        if let Some(on_disk) = root.canonical_disk_slug(name) {
            return Ok(Some(on_disk));
        }
        let declared = self
            .by_declared_slug
            .get(name)
            .map_or(&[][..], Vec::as_slice);
        match declared {
            [] => {}
            [only] => return Ok(Some((*only).to_string())),
            several => {
                return Err(AmbiguousName(format!(
                    "Ambiguous frontmatter slug alias \"{name}\" matches: {}. Use an exact vault-relative slug.",
                    several.join(", ")
                )))
            }
        }
        match self.by_tail.get(name).map_or(&[][..], Vec::as_slice) {
            [] => Ok(None),
            [only] => Ok(Some((*only).to_string())),
            several => Err(AmbiguousName(format!(
                "Ambiguous tail slug alias \"{name}\" matches: {}. Use an exact vault-relative slug.",
                several.join(", ")
            ))),
        }
    }
}

/// The slug of the document that holds `uid`, as its own or as one it absorbed by a merge.
pub fn resolve_uid<'a>(
    documents: &'a [LoadedDocument],
    uid: &str,
) -> Result<Option<&'a str>, AmbiguousName> {
    if trim(uid).is_empty() {
        return Ok(None);
    }
    let primary: Vec<&str> = documents
        .iter()
        .filter(|document| document.frontmatter().text("uid") == Some(uid))
        .map(LoadedDocument::slug)
        .collect();
    match primary.as_slice() {
        [only] => return Ok(Some(only)),
        [] => {}
        several => {
            return Err(AmbiguousName(format!(
                "Ambiguous permanent uid \"{uid}\" matches: {}. Run validate_vault and repair duplicate-uid errors before reading by uid.",
                several.join(", ")
            )))
        }
    }
    let merged: Vec<&str> = documents
        .iter()
        .filter(|document| {
            document
                .frontmatter()
                .get("merged_uids")
                .and_then(Value::as_list)
                .is_some_and(|uids| uids.iter().any(|candidate| candidate == uid))
        })
        .map(LoadedDocument::slug)
        .collect();
    match merged.as_slice() {
        [] => Ok(None),
        [only] => Ok(Some(only)),
        several => Err(AmbiguousName(format!(
            "Ambiguous merged uid \"{uid}\" matches: {}. Run validate_vault and repair merged uid ownership before reading by uid.",
            several.join(", ")
        ))),
    }
}

/// The documents whose relation keys name `reference` exactly and that are not the document of that
/// slug, each with the first key that does, listed by slug. A name the vault references without a
/// file of its own shows on the map; this says who wrote it.
pub fn find_graph_references(documents: &[LoadedDocument], reference: &str) -> Vec<Reference> {
    let target = trim(reference);
    if target.is_empty() {
        return Vec::new();
    }
    let mut hits: Vec<Reference> = documents
        .iter()
        .filter(|document| document.slug() != target)
        .filter_map(|document| {
            crate::relations::neighbor_refs(document.frontmatter())
                .into_iter()
                .find(|neighbor| neighbor.reference == target)
                .map(|neighbor| Reference {
                    slug: document.slug().to_string(),
                    via: neighbor.key,
                })
        })
        .collect();
    hits.sort_by(|left, right| answer_format::collation::compare_text(&left.slug, &right.slug));
    hits
}

/// Up to `limit` slugs near `missing`, for a not-found answer: the same last segment first, then a
/// slug containing the name or contained in it (a slug that starts with the name contains it). No
/// edit distance: on a large vault it is slow and noisy, and the aim is "these exist", not "did you
/// mean".
pub fn suggest_similar_slugs(
    documents: &[LoadedDocument],
    missing: &str,
    limit: usize,
) -> Vec<String> {
    if missing.is_empty() {
        return Vec::new();
    }
    let tail = tail_of(missing);
    let tail = if tail.is_empty() { missing } else { tail };
    let lower_tail = tail.to_lowercase();
    let lower_missing = missing.to_lowercase();
    let (mut same_tail, mut containing): (Vec<&str>, Vec<&str>) = (Vec::new(), Vec::new());
    for document in documents {
        let slug = document.slug();
        if slug == missing {
            continue;
        }
        let candidate_tail = {
            let tail = tail_of(slug);
            if tail.is_empty() {
                slug
            } else {
                tail
            }
        }
        .to_lowercase();
        let lower_slug = slug.to_lowercase();
        if candidate_tail == lower_tail {
            same_tail.push(slug);
        } else if candidate_tail.contains(&lower_tail)
            || lower_tail.contains(&candidate_tail)
            || lower_slug.contains(&lower_missing)
        {
            containing.push(slug);
        }
    }
    same_tail
        .into_iter()
        .chain(containing)
        .take(limit)
        .map(str::to_string)
        .collect()
}
