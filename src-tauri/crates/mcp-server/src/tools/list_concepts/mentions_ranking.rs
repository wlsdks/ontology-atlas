//! `mentions`: the documents whose title, references or body say a text, best first: the nodes,
//! then the plain Markdown pages beside them.
//!
//! The ranking is the evidence engine of `vault_document`: a node is a hit exactly when the text
//! occurs in it, and where it occurs only orders the hits. The engine judges every node of the vault,
//! so the narrowing of `kind`, `domain`, `since` and `filter` is applied to its hits afterwards.

use std::collections::HashSet;

use vault_document::{search_evidence, EvidenceQuery, LoadedDocument, MatchedIn};

use crate::error::ToolError;

/// Where a node says the text and how well that fits: a row's `matchedIn` and `score`.
#[derive(Clone, Copy)]
pub struct Found {
    pub is_node: bool,
    pub matched_in: &'static str,
    pub score: f64,
}

/// The documents of `selected` that mention `text`, best score first, a node before a page of equal
/// score, then in slug order.
pub fn rank<'a>(
    documents: &'a [LoadedDocument],
    selected: &[&LoadedDocument],
    text: &str,
) -> Result<Vec<(&'a LoadedDocument, Found)>, ToolError> {
    let query = EvidenceQuery::new(text)
        .ok_or_else(|| ToolError::invalid("mentions must be a non-empty string."))?;
    let wanted: HashSet<&str> = selected.iter().map(|document| document.slug()).collect();
    let hits = search_evidence(documents, &query, false)
        .map_err(|error| ToolError::failed(error.to_string()))?;
    Ok(hits
        .into_iter()
        .filter(|hit| wanted.contains(hit.document.slug()))
        .map(|hit| {
            let found = Found {
                is_node: hit.is_node,
                matched_in: match hit.matched_in {
                    MatchedIn::Frontmatter => "frontmatter",
                    MatchedIn::Body => "body",
                },
                score: hit.score,
            };
            (hit.document, found)
        })
        .collect())
}
