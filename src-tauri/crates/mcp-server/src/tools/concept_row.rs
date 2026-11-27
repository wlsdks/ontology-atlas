//! The row that names a node in a list: what an agent needs to pick one without opening it.

use serde::Serialize;
use vault_document::{DisplayTitle, LoadedDocument};

use vault_document::frontmatter::Value;

/// One node in `list_concepts` and `query_concepts`. A key the file does not hold is left out.
#[derive(Serialize)]
pub struct ConceptRow<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    uid: Option<&'a Value>,
    slug: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    kind: Option<&'a Value>,
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
            title: document.display_title(),
            domain: frontmatter.get("domain"),
            capabilities: frontmatter.get("capabilities"),
            elements: frontmatter.get("elements"),
            mtime: document.modified_ms(),
            summary: None,
            summary_truncated: None,
        }
    }

    #[must_use]
    pub fn with_summary(mut self, summary: String, truncated: bool) -> Self {
        self.summary = Some(summary);
        self.summary_truncated = truncated.then_some(true);
        self
    }
}
