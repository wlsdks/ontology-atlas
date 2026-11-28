//! Every node with the relations it holds, read from the files: the one engine behind
//! `match_nodes`. A vault whose graph does not compile (one invalid `uid`) still answers, and the
//! nodes a call with `hasIncoming: true` returns and those with `hasIncoming: false` split exactly
//! what a call without it returns.

use std::collections::HashMap;

use serde::Serialize;

use crate::frontmatter::Value;
use crate::loaded_document::{DisplayTitle, LoadedDocument};
use crate::reference_index::ReferenceIndex;
use crate::relations::neighbor_refs;

/// The kinds left out when the nodes nothing points at are asked for and no `kind` is: a project is
/// the root of the tree, and the vault's README is not a concept.
pub const DEFAULT_EXCLUDED_KINDS: [&str; 2] = ["project", "vault-readme"];

/// A node and its connections as the files write them.
#[derive(Debug, Serialize)]
pub struct MatchedNode<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uid: Option<&'a Value>,
    pub slug: &'a str,
    pub kind: &'a str,
    pub title: DisplayTitle<'a>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<&'a Value>,
    /// Distinct references other nodes write to this one; a short reference several nodes share
    /// counts for each of them, and a node naming itself is not referenced.
    #[serde(rename = "inDegree")]
    pub in_degree: usize,
    /// Distinct references this node writes, whether or not they name a node.
    #[serde(rename = "outDegree")]
    pub out_degree: usize,
    pub degree: usize,
}

/// What a match narrows to. `excluded_kinds` replaces the default exclusions.
#[derive(Debug, Default, Clone, Copy)]
pub struct MatchFilter<'q> {
    pub kind: Option<&'q str>,
    pub domain: Option<&'q str>,
    pub has_incoming: Option<bool>,
    pub has_outgoing: Option<bool>,
    pub excluded_kinds: Option<&'q [String]>,
}

impl MatchFilter<'_> {
    /// The kinds this match leaves out, without repeats, in the order they were named. Without a
    /// list of its own it leaves out the project and the README, and only when it asks for the
    /// nodes nothing points at without naming a kind.
    pub fn excluded(&self) -> Vec<&str> {
        let named: Vec<&str> = match self.excluded_kinds {
            Some(kinds) => kinds.iter().map(String::as_str).collect(),
            None if self.has_incoming == Some(false) && self.kind.is_none() => {
                DEFAULT_EXCLUDED_KINDS.to_vec()
            }
            None => Vec::new(),
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

/// The nodes that meet `filter`, in document order; the caller orders and pages them.
pub fn match_nodes_from_files<'a>(
    documents: &'a [LoadedDocument],
    index: &ReferenceIndex<'a>,
    filter: &MatchFilter<'_>,
) -> Vec<MatchedNode<'a>> {
    let mut in_degree: HashMap<&str, usize> = HashMap::new();
    let mut out_degree: Vec<usize> = Vec::with_capacity(documents.len());
    for document in documents {
        let written = neighbor_refs(document.frontmatter());
        out_degree.push(written.len());
        for neighbor in &written {
            for candidate in index.candidates(&neighbor.reference) {
                if candidate != document.slug() {
                    *in_degree.entry(candidate).or_default() += 1;
                }
            }
        }
    }
    let excluded = filter.excluded();
    documents
        .iter()
        .zip(out_degree)
        .filter_map(|(document, outgoing)| {
            let kind = document
                .frontmatter()
                .text("kind")
                .filter(|kind| !kind.is_empty())?;
            let domain = document.frontmatter().get("domain");
            let in_domain = filter
                .domain
                .is_none_or(|wanted| matches!(domain, Some(Value::Text(text)) if text == wanted));
            let incoming = in_degree.get(document.slug()).copied().unwrap_or(0);
            if excluded.contains(&kind)
                || filter.kind.is_some_and(|only| only != kind)
                || !in_domain
                || filter
                    .has_incoming
                    .is_some_and(|wanted| (incoming > 0) != wanted)
                || filter
                    .has_outgoing
                    .is_some_and(|wanted| (outgoing > 0) != wanted)
            {
                return None;
            }
            Some(MatchedNode {
                uid: document.frontmatter().get("uid"),
                slug: document.slug(),
                kind,
                title: document.display_title(),
                domain,
                in_degree: incoming,
                out_degree: outgoing,
                degree: incoming + outgoing,
            })
        })
        .collect()
}
