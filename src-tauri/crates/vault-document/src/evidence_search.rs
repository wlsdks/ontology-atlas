//! `find_evidence`: which documents of a vault mention a title, best first.
//!
//! A document is a match exactly when the title occurs in it, ignoring case and Unicode form: in
//! its title, in the names its `capabilities:` and `elements:` hold, or in its body. Where the
//! title occurs only orders the matches (an exact title, a title that starts with it, a title that
//! holds it, a reference, the body), with the words the title and the query share as a tie-break.

use std::collections::HashSet;

use answer_format::collation::compare_text;
use answer_format::whitespace::trim;
use rayon::prelude::*;

use crate::loaded_document::{FileReadError, LoadedDocument};
use crate::search_text::{folded, words};

/// Where the title was found. A title match is `Frontmatter` whichever key held it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MatchedIn {
    Frontmatter,
    Body,
}

/// The score a match earns before the word overlap, by where the title was found.
const EXACT_TITLE: f64 = 1.0;
const TITLE_PREFIX: f64 = 0.9;
const TITLE_CONTAINS: f64 = 0.75;
const REFERENCE: f64 = 0.5;
const BODY: f64 = 0.3;
/// The most the words a title shares with the query add: enough to order two matches of one kind,
/// never enough to pass the next kind.
const OVERLAP_WEIGHT: f64 = 0.1;

/// What a call asked for, folded once.
pub struct EvidenceQuery {
    needle: String,
    words: HashSet<String>,
}

impl EvidenceQuery {
    /// The query for `title`, or `None` when it is blank.
    pub fn new(title: &str) -> Option<Self> {
        let trimmed = trim(title);
        if trimmed.is_empty() {
            return None;
        }
        let needle = folded(trimmed).into_owned();
        let words = words(&needle).map(str::to_string).collect();
        Some(Self { needle, words })
    }

    fn overlap(&self, folded_title: &str) -> f64 {
        if self.words.is_empty() {
            return 0.0;
        }
        let title_words: HashSet<&str> = words(folded_title).collect();
        let shared = self
            .words
            .iter()
            .filter(|word| title_words.contains(word.as_str()))
            .count();
        shared as f64 / self.words.len() as f64 * OVERLAP_WEIGHT
    }

    /// The score of a document that matched by `base`.
    fn score(&self, base: f64, folded_title: &str) -> f64 {
        ((base + self.overlap(folded_title)) * 1000.0).round() / 1000.0
    }
}

/// One document that mentions the title.
#[derive(Debug)]
pub struct EvidenceHit<'a> {
    pub document: &'a LoadedDocument,
    pub is_node: bool,
    pub matched_in: MatchedIn,
    pub score: f64,
}

/// The name a match is listed by: `title`, else `name`, else nothing, as JavaScript's `||` reads
/// them.
fn title_text(document: &LoadedDocument) -> String {
    let frontmatter = document.frontmatter();
    frontmatter
        .truthy("title")
        .or_else(|| frontmatter.truthy("name"))
        .map(|value| value.display_text())
        .unwrap_or_default()
}

/// The names of the capabilities and elements a document lists, as text with a line between.
fn references_text(document: &LoadedDocument) -> String {
    let frontmatter = document.frontmatter();
    let held = |key: &str| frontmatter.get(key).map(|value| value.display_text());
    format!(
        "{}\n{}",
        held("capabilities").unwrap_or_default(),
        held("elements").unwrap_or_default()
    )
}

fn judge<'a>(
    document: &'a LoadedDocument,
    query: &EvidenceQuery,
    nodes_only: bool,
) -> Result<Option<EvidenceHit<'a>>, FileReadError> {
    let is_node = document.node_kind().is_some();
    if nodes_only && !is_node {
        return Ok(None);
    }
    let title = folded(&title_text(document)).into_owned();
    let references = folded(&references_text(document)).into_owned();
    let needle = query.needle.as_str();
    let by_title_or_reference = if title == needle {
        Some(EXACT_TITLE)
    } else if title.starts_with(needle) {
        Some(TITLE_PREFIX)
    } else if title.contains(needle) {
        Some(TITLE_CONTAINS)
    } else if references.contains(needle) {
        Some(REFERENCE)
    } else {
        None
    };
    let (base, matched_in) = match by_title_or_reference {
        Some(base) => (base, MatchedIn::Frontmatter),
        None if document.body_includes(needle)? => (BODY, MatchedIn::Body),
        None => return Ok(None),
    };
    Ok(Some(EvidenceHit {
        document,
        is_node,
        matched_in,
        score: query.score(base, &title),
    }))
}

/// Every document that mentions the title, best first: by score, a node before a note of the same
/// score, then the collation of the slug. Bodies are read on every core, and only where a
/// document's title and references did not already match.
pub fn search_evidence<'a>(
    documents: &'a [LoadedDocument],
    query: &EvidenceQuery,
    nodes_only: bool,
) -> Result<Vec<EvidenceHit<'a>>, FileReadError> {
    let judged: Result<Vec<Option<EvidenceHit<'a>>>, FileReadError> = documents
        .par_iter()
        .map(|document| judge(document, query, nodes_only))
        .collect();
    let mut hits: Vec<EvidenceHit<'a>> = judged?.into_iter().flatten().collect();
    hits.sort_by(|left, right| {
        right
            .score
            .total_cmp(&left.score)
            .then(right.is_node.cmp(&left.is_node))
            .then_with(|| compare_text(left.document.slug(), right.document.slug()))
    });
    Ok(hits)
}
