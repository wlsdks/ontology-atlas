//! `find_evidence`: which documents of the vault mention a title, best first, each with a line
//! about what it is, so an agent sees where a capability is realised without a second call.

use serde::Serialize;
use vault_document::frontmatter::Value;
use vault_document::{
    describe_body_delivery, evidence_zero_hits_hint, near_titles, search_evidence, BodyMode,
    DisplayTitle, EvidenceHit, EvidenceQuery, GrowthHint, LoadedDocument, MatchedIn,
    SUMMARY_MAX_CHARS,
};

use super::argument_checks::{
    optional_boolean, optional_positive_integer, required_non_blank_text,
};
use super::read_vault::read_vault;
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::ToolError;

const DEFAULT_LIMIT: f64 = 50.0;
const MAXIMUM_LIMIT: f64 = 500.0;
/// Slugs a hint names for the bodies a reader should read whole.
const SLUGS_NAMED: usize = 3;

#[derive(Serialize)]
struct Evidence<'a> {
    #[serde(rename = "limitHint", skip_serializing_if = "Option::is_none")]
    limit_hint: Option<String>,
    query: &'a str,
    total: usize,
    limited: bool,
    matches: Vec<Match<'a>>,
    #[serde(rename = "nonNodeHint", skip_serializing_if = "Option::is_none")]
    non_node_hint: Option<String>,
    #[serde(rename = "bodyHint", skip_serializing_if = "Option::is_none")]
    body_hint: Option<String>,
    #[serde(rename = "growthHint", skip_serializing_if = "Option::is_none")]
    growth_hint: Option<GrowthHint>,
}

/// One document that mentions the title. A key the file does not hold is left out, so a note with
/// no `kind:` has neither `uid` nor `kind`, and `isNode` says why.
#[derive(Serialize)]
struct Match<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    uid: Option<&'a Value>,
    slug: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    kind: Option<&'a Value>,
    #[serde(rename = "isNode")]
    is_node: bool,
    title: DisplayTitle<'a>,
    #[serde(skip_serializing_if = "Option::is_none")]
    domain: Option<&'a Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mtime: Option<f64>,
    #[serde(rename = "matchedIn")]
    matched_in: &'static str,
    score: f64,
    excerpt: String,
    #[serde(rename = "excerptTruncated", skip_serializing_if = "Option::is_none")]
    excerpt_truncated: Option<bool>,
    #[serde(rename = "bodyChars", skip_serializing_if = "Option::is_none")]
    body_chars: Option<usize>,
}

fn row<'a>(hit: &EvidenceHit<'a>) -> Result<Match<'a>, ToolError> {
    let document = hit.document;
    let frontmatter = document.frontmatter();
    let body = document
        .body()
        .map_err(|error| ToolError::failed(error.to_string()))?;
    let delivery = describe_body_delivery(&body, BodyMode::Excerpt, SUMMARY_MAX_CHARS, None);
    let truncated = delivery.info.truncated();
    Ok(Match {
        uid: frontmatter.get("uid"),
        slug: document.slug(),
        kind: frontmatter.get("kind"),
        is_node: hit.is_node,
        title: document.display_title(),
        domain: frontmatter.get("domain"),
        mtime: document.modified_ms(),
        matched_in: match hit.matched_in {
            MatchedIn::Frontmatter => "frontmatter",
            MatchedIn::Body => "body",
        },
        score: hit.score,
        excerpt: delivery.text,
        excerpt_truncated: truncated.then_some(true),
        body_chars: truncated.then(|| delivery.info.total_chars()),
    })
}

fn listed_title(document: &LoadedDocument) -> String {
    match document.display_title() {
        DisplayTitle::Value(value) => value.display_text(),
        DisplayTitle::Slug(slug) => slug.to_string(),
    }
}

/// The note under a page of matches that include documents with no `kind:`.
fn non_node_hint(listed: &[Match<'_>]) -> Option<String> {
    let notes = listed.iter().filter(|listed| !listed.is_node).count();
    (notes > 0).then(|| {
        format!(
            "{notes} of {} match(es) are not graph nodes (no `kind:` \u{2014} meeting notes, memos, drafts live in the same folder by design). They are ranked below nodes of equal relevance. Pass nodesOnly: true to see only graph nodes.",
            listed.len()
        )
    })
}

/// The note under a page whose excerpts stop before the end of their bodies.
fn body_hint(listed: &[Match<'_>]) -> Option<String> {
    let cut: Vec<&str> = listed
        .iter()
        .filter(|listed| listed.excerpt_truncated == Some(true))
        .map(|listed| listed.slug)
        .collect();
    if cut.is_empty() {
        return None;
    }
    let named: Vec<String> = cut.iter().take(SLUGS_NAMED).map(|slug| format!("\"{slug}\"")).collect();
    let more = if cut.len() > SLUGS_NAMED { ", \u{2026}" } else { "" };
    Some(format!(
        "{} of {} match(es) returned a partial excerpt \u{2014} the matched text may sit past it. Read the whole body with get_concepts({{ slugs: [{}{more}], body: \"full\" }}).",
        cut.len(),
        listed.len(),
        named.join(", ")
    ))
}

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "the argument was checked to be a whole number from one to 500"
)]
fn count(number: f64) -> usize {
    number as usize
}

pub fn call(context: &CallContext<'_>, arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let title = required_non_blank_text(arguments, "title")?;
    let limit = count(
        optional_positive_integer(arguments, "limit", Some(MAXIMUM_LIMIT))?.unwrap_or(DEFAULT_LIMIT),
    );
    let nodes_only = optional_boolean(arguments, "nodesOnly")?.unwrap_or(false);
    let query = EvidenceQuery::new(&title)
        .ok_or_else(|| ToolError::invalid("title must be a non-empty string."))?;
    let read = read_vault(context)?;
    let documents = read.vault.documents();
    let hits = search_evidence(documents, &query, nodes_only)
        .map_err(|error| ToolError::failed(error.to_string()))?;
    let listed: Vec<Match<'_>> = hits.iter().take(limit).map(row).collect::<Result<_, _>>()?;
    let more = listed.len() < hits.len();
    let growth_hint = hits.is_empty().then(|| {
        let candidates = documents
            .iter()
            .map(|document| (document.slug(), listed_title(document)));
        evidence_zero_hits_hint(&title, &near_titles(&title, candidates))
    });
    ToolOutput::json(&Evidence {
        limit_hint: more.then(|| {
            format!(
                "The {} best of {} matches. Narrow the title, pass nodesOnly: true, or raise limit (at most 500).",
                listed.len(),
                hits.len()
            )
        }),
        query: &title,
        total: hits.len(),
        limited: more,
        non_node_hint: non_node_hint(&listed),
        body_hint: body_hint(&listed),
        growth_hint,
        matches: listed,
    })
}
