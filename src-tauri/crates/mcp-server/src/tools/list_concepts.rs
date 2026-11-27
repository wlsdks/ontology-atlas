//! `list_concepts`: every node of the vault in pages, with the vault's census and how many findings
//! the vault carries, so one call tells an agent what is there and whether it is healthy.

use answer_format::collation::compare_text;
use serde::Serialize;
use vault_document::frontmatter::Value;
use vault_document::schema::KNOWN_KINDS;
use vault_document::{
    count_vault_issues, kind_census, KindCensus, LoadedDocument, ReferenceIndex, SUMMARY_MAX_CHARS,
};

use super::argument_checks::{
    optional_boolean, optional_non_blank_text, optional_non_negative_integer,
    optional_non_negative_number, optional_one_of, optional_positive_integer,
};
use super::concept_row::ConceptRow;
use super::read_vault::read_vault;
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::ToolError;

const DEFAULT_LIMIT: f64 = 100.0;
const MAXIMUM_LIMIT: f64 = 500.0;

#[derive(Serialize)]
struct Pagination {
    offset: usize,
    limit: usize,
    total: usize,
    returned: usize,
    #[serde(rename = "hasMore")]
    has_more: bool,
    #[serde(rename = "nextOffset")]
    next_offset: Option<usize>,
}

#[derive(Serialize)]
struct VaultWarnings {
    #[serde(rename = "errorCount")]
    error_count: usize,
    #[serde(rename = "warningCount")]
    warning_count: usize,
}

#[derive(Serialize)]
struct Listing<'a> {
    total: usize,
    census: KindCensus,
    #[serde(rename = "vaultRoot")]
    vault_root: String,
    nodes: Vec<ConceptRow<'a>>,
    returned: usize,
    limited: bool,
    pagination: Pagination,
    #[serde(rename = "summaryHint", skip_serializing_if = "Option::is_none")]
    summary_hint: Option<String>,
    #[serde(rename = "vaultWarnings", skip_serializing_if = "Option::is_none")]
    vault_warnings: Option<VaultWarnings>,
}

/// Whether the document's `kind:` is `wanted`, for a document that has one.
fn has_kind(document: &LoadedDocument, wanted: &str) -> bool {
    matches!(document.frontmatter().get("kind"), Some(Value::Text(kind)) if kind == wanted)
}

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "the arguments were checked to be whole numbers from zero up to 500, or a page start the vault bounds"
)]
fn count(number: f64) -> usize {
    number as usize
}

pub fn call(context: &CallContext<'_>, arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let kind = optional_non_blank_text(arguments, "kind")?;
    let kind = match &kind {
        Some(_) => optional_one_of(arguments, "kind", &KNOWN_KINDS)?,
        None => None,
    };
    let domain = optional_non_blank_text(arguments, "domain")?;
    let since = optional_non_negative_number(arguments, "since")?;
    let summary = optional_boolean(arguments, "summary")?;
    let offset = optional_non_negative_integer(arguments, "offset", None)?.unwrap_or(0.0);
    let limit = optional_positive_integer(arguments, "limit", Some(MAXIMUM_LIMIT))?
        .unwrap_or(DEFAULT_LIMIT);
    let (offset, limit) = (count(offset), count(limit));

    let read = read_vault(context)?;
    let documents = read.vault.documents();
    let index = ReferenceIndex::new(documents);
    let (errors, warnings) = count_vault_issues(documents, &index);

    let mut matching: Vec<&LoadedDocument> = documents
        .iter()
        .filter(|document| document.frontmatter().truthy("kind").is_some())
        .filter(|document| kind.is_none_or(|wanted| has_kind(document, wanted)))
        .filter(|document| {
            domain.as_deref().is_none_or(|wanted| {
                matches!(document.frontmatter().get("domain"), Some(Value::Text(actual)) if actual == wanted)
            })
        })
        .filter(|document| since.is_none_or(|after| document.modified_ms().is_some_and(|mtime| mtime > after)))
        .collect();
    matching.sort_by(|left, right| compare_text(left.slug(), right.slug()));
    if offset > matching.len() {
        return Err(ToolError::invalid(format!(
            "offset must be less than or equal to the total matching nodes ({}); Received: {offset}.",
            matching.len()
        )));
    }

    let wants_summary = summary == Some(true);
    let mut truncated_summaries = 0;
    let mut nodes: Vec<ConceptRow<'_>> = Vec::new();
    for document in matching.iter().skip(offset).take(limit) {
        let row = ConceptRow::of(document);
        if !wants_summary {
            nodes.push(row);
            continue;
        }
        let body = document
            .body()
            .map_err(|error| ToolError::failed(error.to_string()))?;
        let delivery = vault_document::describe_body_delivery(
            &body,
            vault_document::BodyMode::Excerpt,
            SUMMARY_MAX_CHARS,
            None,
        );
        let truncated = delivery.info.truncated();
        if truncated {
            truncated_summaries += 1;
        }
        nodes.push(row.with_summary(delivery.text, truncated));
    }
    let has_more = offset + nodes.len() < matching.len();
    let returned = nodes.len();
    ToolOutput::json(&Listing {
        total: matching.len(),
        census: kind_census(documents),
        vault_root: context.config().vault_root.to_string_lossy().into_owned(),
        returned,
        limited: has_more,
        pagination: Pagination {
            offset,
            limit,
            total: matching.len(),
            returned,
            has_more,
            next_offset: has_more.then_some(offset + returned),
        },
        summary_hint: (truncated_summaries > 0).then(|| {
            format!(
                "{truncated_summaries} row(s) carry a partial summary (summaryTruncated: true). Read those bodies in full with get_concepts({{ slugs: [...], body: \"full\" }})."
            )
        }),
        vault_warnings: (errors + warnings > 0).then_some(VaultWarnings {
            error_count: errors,
            warning_count: warnings,
        }),
        nodes,
    })
}
