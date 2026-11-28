//! The row that names a node in a list: what an agent needs to pick one without opening it. A text
//! search also lists the plain Markdown pages beside the nodes, and says which rows they are.

use serde::Serialize;
use vault_document::{DisplayTitle, LoadedDocument};

use vault_document::frontmatter::Value;

/// One node in `list_concepts`. A key the file does not hold is left out.
#[derive(Serialize)]
pub struct ConceptRow<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    uid: Option<&'a Value>,
    slug: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    kind: Option<&'a Value>,
    /// Only with `mentions`: false for a plain Markdown page, which has no `kind:` and is no node.
    #[serde(rename = "isNode", skip_serializing_if = "Option::is_none")]
    is_node: Option<bool>,
    title: DisplayTitle<'a>,
    #[serde(skip_serializing_if = "Option::is_none")]
    domain: Option<&'a Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    capabilities: Option<&'a Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    elements: Option<&'a Value>,
    /// Milliseconds since the epoch: sortable, and the way to tell a node changed.
    #[serde(skip_serializing_if = "Option::is_none")]
    mtime: Option<f64>,
    /// Where `mentions` found its text, and how well that fits.
    #[serde(rename = "matchedIn", skip_serializing_if = "Option::is_none")]
    matched_in: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    score: Option<f64>,
    /// Only with `mentions`: the first prose of the body, so a match needs no second read to judge.
    #[serde(skip_serializing_if = "Option::is_none")]
    excerpt: Option<String>,
    #[serde(rename = "excerptTruncated", skip_serializing_if = "Option::is_none")]
    excerpt_truncated: Option<bool>,
    #[serde(rename = "bodyChars", skip_serializing_if = "Option::is_none")]
    body_chars: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    summary: Option<String>,
    #[serde(rename = "summaryTruncated", skip_serializing_if = "Option::is_none")]
    summary_truncated: Option<bool>,
}

impl<'a> ConceptRow<'a> {
    pub fn of(document: &'a LoadedDocument) -> Self {
        let frontmatter = document.frontmatter();
        Self {
            uid: frontmatter.get("uid"),
            slug: document.slug(),
            kind: frontmatter.get("kind"),
            is_node: None,
            title: document.display_title(),
            domain: frontmatter.get("domain"),
            capabilities: frontmatter.get("capabilities"),
            elements: frontmatter.get("elements"),
            mtime: document.modified_ms(),
            matched_in: None,
            score: None,
            excerpt: None,
            excerpt_truncated: None,
            body_chars: None,
            summary: None,
            summary_truncated: None,
        }
    }

    #[must_use]
    pub fn with_mention(mut self, is_node: bool, matched_in: &'static str, score: f64) -> Self {
        self.is_node = Some(is_node);
        self.matched_in = Some(matched_in);
        self.score = Some(score);
        self
    }

    /// The prose a match is judged by; `body_chars` is the whole body's length when it was cut.
    #[must_use]
    pub fn with_excerpt(mut self, excerpt: String, cut_from: Option<usize>) -> Self {
        self.excerpt = Some(excerpt);
        self.excerpt_truncated = cut_from.map(|_| true);
        self.body_chars = cut_from;
        self
    }

    #[must_use]
    pub fn with_summary(mut self, summary: String, truncated: bool) -> Self {
        self.summary = Some(summary);
        self.summary_truncated = truncated.then_some(true);
        self
    }
}
