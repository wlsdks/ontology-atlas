//! Which document a reference names. A reference is a full slug, a slug's last segment, a declared
//! `slug:` alias, or the end of a longer slug; one that names two documents is ambiguous, and an
//! ambiguous reference asserts no edge though it may be a referrer of every candidate.

use std::borrow::Cow;
use std::collections::{HashMap, HashSet};

use icu_normalizer::ComposingNormalizerBorrowed;

use crate::loaded_vault::LoadedDocument;

/// The slug a reference is looked up as: slugs come from the file walk in NFC, so a reference typed
/// in another form names the same document.
pub(crate) fn nfc(text: &str) -> Cow<'_, str> {
    ComposingNormalizerBorrowed::new_nfc().normalize(text)
}

/// The last segment of a slug.
pub fn tail_of(slug: &str) -> &str {
    slug.rsplit('/').next().unwrap_or(slug)
}

#[derive(Debug)]
pub struct ReferenceIndex<'a> {
    slugs: HashSet<&'a str>,
    /// Slugs by the last segment they end in, for slugs that have more than one segment.
    by_tail: HashMap<&'a str, Vec<&'a str>>,
    /// The first document to declare each `slug:`, NFC.
    by_declared_slug: HashMap<String, &'a str>,
    /// Slugs by each of the endings that follow a `/`, in vault order.
    by_suffix: HashMap<&'a str, Vec<&'a str>>,
}

impl<'a> ReferenceIndex<'a> {
    pub fn new(documents: &'a [LoadedDocument]) -> Self {
        let mut slugs = HashSet::with_capacity(documents.len());
        let mut by_tail: HashMap<&str, Vec<&str>> = HashMap::new();
        let mut by_suffix: HashMap<&str, Vec<&str>> = HashMap::new();
        let mut by_declared_slug: HashMap<String, &str> = HashMap::new();
        for document in documents {
            let slug = document.slug();
            slugs.insert(slug);
            let tail = tail_of(slug);
            if tail != slug {
                by_tail.entry(tail).or_default().push(slug);
            }
            for (position, _) in slug.match_indices('/') {
                if let Some(suffix) = slug.get(position + 1..) {
                    by_suffix.entry(suffix).or_default().push(slug);
                }
            }
        }
        for document in documents {
            if let Some(declared) = document.frontmatter().text("slug") {
                let alias = nfc(declared).into_owned();
                if !answer_format::whitespace::trim(&alias).is_empty() {
                    by_declared_slug.entry(alias).or_insert(document.slug());
                }
            }
        }
        Self {
            slugs,
            by_tail,
            by_declared_slug,
            by_suffix,
        }
    }

    /// Whether `slug` is the slug of a document, exactly.
    pub fn has_slug(&self, slug: &str) -> bool {
        self.slugs.contains(slug)
    }

    /// Every document `reference` may name: the one it spells exactly, else the one that declares
    /// it, else every slug that ends in it as a last segment, else every slug that ends in it after
    /// a `/`.
    pub fn candidates(&self, reference: &str) -> Vec<&'a str> {
        let reference = nfc(reference);
        if let Some(slug) = self.slugs.get(reference.as_ref()) {
            return vec![slug];
        }
        if let Some(slug) = self.by_declared_slug.get(reference.as_ref()) {
            return vec![slug];
        }
        if let Some(tails) = self.by_tail.get(reference.as_ref()) {
            return tails.clone();
        }
        self.by_suffix
            .get(reference.as_ref())
            .cloned()
            .unwrap_or_default()
    }

    /// The one document `reference` names, or `None` when it names none or several.
    pub fn resolve(&self, reference: &str) -> Option<&'a str> {
        match self.candidates(reference).as_slice() {
            [only] => Some(*only),
            _ => None,
        }
    }

    /// Whether `reference` names any document.
    pub fn resolves(&self, reference: &str) -> bool {
        let reference = nfc(reference);
        self.slugs.contains(reference.as_ref())
            || self.by_declared_slug.contains_key(reference.as_ref())
            || self.by_tail.contains_key(reference.as_ref())
            || self.by_suffix.contains_key(reference.as_ref())
    }
}
