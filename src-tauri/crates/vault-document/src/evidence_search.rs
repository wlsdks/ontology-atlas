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
use crate::reader_threads::{read_on_reader_threads, Reading};
use crate::search_needle::SearchNeedle;
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
    needle: SearchNeedle,
    words: HashSet<String>,
}

impl EvidenceQuery {
    /// The query for `title`, or `None` when it is blank.
    pub fn new(title: &str) -> Option<Self> {
        let trimmed = trim(title);
        if trimmed.is_empty() {
            return None;
        }
        let needle = SearchNeedle::new(folded(trimmed).into_owned());
        let words = words(needle.text()).map(str::to_string).collect();
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

/// What a document comes to before its body is read.
enum Judged<'a> {
    Hit(EvidenceHit<'a>),
    Miss,
    /// Neither the title nor the references hold the needle, and only the body can say.
    AskBody {
        is_node: bool,
        title: String,
    },
}

fn judge<'a>(document: &'a LoadedDocument, query: &EvidenceQuery, nodes_only: bool) -> Judged<'a> {
    let is_node = document.node_kind().is_some();
    if nodes_only && !is_node {
        return Judged::Miss;
    }
    let title = folded(&title_text(document)).into_owned();
    let references = folded(&references_text(document)).into_owned();
    let needle = query.needle.text();
    let base = if title == needle {
        EXACT_TITLE
    } else if title.starts_with(needle) {
        TITLE_PREFIX
    } else if title.contains(needle) {
        TITLE_CONTAINS
    } else if references.contains(needle) {
        REFERENCE
    } else {
        return match document.known_body_answer(&query.needle) {
            Some(true) => body_hit(document, query, is_node, &title),
            Some(false) => Judged::Miss,
            None => Judged::AskBody { is_node, title },
        };
    };
    Judged::Hit(EvidenceHit {
        document,
        is_node,
        matched_in: MatchedIn::Frontmatter,
        score: query.score(base, &title),
    })
}

fn body_hit<'a>(
    document: &'a LoadedDocument,
    query: &EvidenceQuery,
    is_node: bool,
    folded_title: &str,
) -> Judged<'a> {
    Judged::Hit(EvidenceHit {
        document,
        is_node,
        matched_in: MatchedIn::Body,
        score: query.score(BODY, folded_title),
    })
}

/// Every document that mentions the title, best first: by score, a node before a note of the same
/// score, then the collation of the slug. Titles and references are judged on every core; a body is
/// read only where they did not match and an earlier search cannot answer for it, on a few reader
/// threads (see `reader_threads`), and searched on every core.
pub fn search_evidence<'a>(
    documents: &'a [LoadedDocument],
    query: &EvidenceQuery,
    nodes_only: bool,
) -> Result<Vec<EvidenceHit<'a>>, FileReadError> {
    let judged: Vec<Judged<'a>> = documents
        .par_iter()
        .map(|document| judge(document, query, nodes_only))
        .collect();
    // Each hit keeps its document's place in the vault, the last tie-break, so the order does not
    // depend on which bodies had to be read.
    let mut hits: Vec<(usize, EvidenceHit<'a>)> = Vec::new();
    let mut ask_body: Vec<(usize, &'a LoadedDocument, bool, String)> = Vec::new();
    for (position, (document, judged)) in documents.iter().zip(judged).enumerate() {
        match judged {
            Judged::Hit(hit) => hits.push((position, hit)),
            Judged::Miss => {}
            Judged::AskBody { is_node, title } => {
                ask_body.push((position, document, is_node, title));
            }
        }
    }
    let answered = read_on_reader_threads(
        &ask_body,
        |(_, document, ..)| {
            let read = document.read_body();
            let bytes = match &read {
                Some(Ok(Some(snapshot))) => snapshot.bytes.len(),
                _ => 0,
            };
            Reading { value: read, bytes }
        },
        |(_, document, is_node, title), read| {
            document
                .body_includes_from(read, &query.needle)
                .map(|found| found.then(|| body_hit(document, query, *is_node, title)))
        },
    );
    for ((position, ..), answer) in ask_body.iter().zip(answered) {
        if let Some(Judged::Hit(hit)) = answer? {
            hits.push((*position, hit));
        }
    }
    hits.sort_by(|(left_position, left), (right_position, right)| {
        right
            .score
            .total_cmp(&left.score)
            .then(right.is_node.cmp(&left.is_node))
            .then_with(|| compare_text(left.document.slug(), right.document.slug()))
            .then(left_position.cmp(right_position))
    });
    Ok(hits.into_iter().map(|(_, hit)| hit).collect())
}
