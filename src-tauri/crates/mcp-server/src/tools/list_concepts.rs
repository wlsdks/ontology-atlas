//! `list_concepts`: every node of the vault in pages, with the vault's census and how many findings
//! the vault carries, so one call tells an agent what is there and whether it is healthy. `filter`
//! keeps the nodes a predicate such as `kind=capability AND has(elements)` accepts, and `mentions`
//! keeps the nodes that say a text and lists the best first.

mod mentions_ranking;
mod zero_rows_hint;

use answer_format::collation::compare_text;
use answer_format::pagination::Pagination;
use serde::Serialize;
use vault_document::frontmatter::Value;
use vault_document::schema::KNOWN_KINDS;
use vault_document::{
    count_vault_issues, kind_census, FilterError, KindCensus, LoadedDocument, QueryFilter,
    ReferenceIndex, SUMMARY_MAX_CHARS,
};

use self::mentions_ranking::Found;
use self::zero_rows_hint::ZeroRowsHint;
use super::argument_checks::{
    optional_boolean, optional_non_blank_text, optional_non_negative_integer,
    optional_non_negative_number, optional_one_of, optional_positive_integer,
};
use super::concept_row::ConceptRow;
use super::read_vault::read_vault;
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::{ReceivedValue, ToolError};

const DEFAULT_LIMIT: f64 = 100.0;
const MAXIMUM_LIMIT: f64 = 500.0;

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
    #[serde(skip_serializing_if = "Option::is_none")]
    filter: Option<&'a str>,
    #[serde(rename = "parsedAs", skip_serializing_if = "Option::is_none")]
    parsed_as: Option<String>,
    #[serde(rename = "query", skip_serializing_if = "Option::is_none")]
    mentions: Option<&'a str>,
    nodes: Vec<ConceptRow<'a>>,
    returned: usize,
    limited: bool,
    pagination: Pagination,
    #[serde(rename = "summaryHint", skip_serializing_if = "Option::is_none")]
    summary_hint: Option<String>,
    #[serde(rename = "vaultWarnings", skip_serializing_if = "Option::is_none")]
    vault_warnings: Option<VaultWarnings>,
    #[serde(rename = "growthHint", skip_serializing_if = "Option::is_none")]
    growth_hint: Option<ZeroRowsHint>,
}

/// Whether the document's `kind:` is `wanted`, for a document that has one.
fn has_kind(document: &LoadedDocument, wanted: &str) -> bool {
    matches!(document.frontmatter().get("kind"), Some(Value::Text(kind)) if kind == wanted)
}

fn filter_refusal(error: FilterError) -> ToolError {
    match error {
        // A filter that cannot be read is a failure of the tool's own language, as it always was
        // answered; only a name the filter does not allow is an invalid argument.
        FilterError::Unreadable(message) => ToolError::failed(message),
        // A filter too large to read safely names the argument, like any refused argument.
        FilterError::TooLarge(message) => ToolError::invalid(message),
        FilterError::NotAllowed {
            what,
            received,
            allowed,
        } => ToolError::not_an_allowed_value(what, ReceivedValue::Text(&received), allowed),
    }
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
    let mentions = optional_non_blank_text(arguments, "mentions")?;
    let filter_text = optional_non_blank_text(arguments, "filter")?;
    let offset = optional_non_negative_integer(arguments, "offset", None)?.unwrap_or(0.0);
    let limit = optional_positive_integer(arguments, "limit", Some(MAXIMUM_LIMIT))?
        .unwrap_or(DEFAULT_LIMIT);
    let (offset, limit) = (count(offset), count(limit));
    let filter = filter_text
        .as_deref()
        .map(QueryFilter::parse)
        .transpose()
        .map_err(filter_refusal)?;

    let read = read_vault(context)?;
    let documents = read.vault.documents();
    let index = ReferenceIndex::new(documents);
    let (errors, warnings) = count_vault_issues(documents, &index);

    let narrowed: Vec<&LoadedDocument> = documents
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
    let mut selected: Vec<&LoadedDocument> = narrowed
        .iter()
        .copied()
        .filter(|document| {
            filter
                .as_ref()
                .is_none_or(|filter| filter.matches(document))
        })
        .collect();
    // The best mention first; without `mentions`, the slug order alone.
    let ranked: Vec<(&LoadedDocument, Option<Found>)> = match &mentions {
        Some(text) => mentions_ranking::rank(documents, &selected, text)?
            .into_iter()
            .map(|(document, found)| (document, Some(found)))
            .collect(),
        None => {
            selected.sort_by(|left, right| compare_text(left.slug(), right.slug()));
            selected.iter().map(|document| (*document, None)).collect()
        }
    };
    if offset > ranked.len() {
        return Err(ToolError::invalid(format!(
            "offset must be less than or equal to the total matching nodes ({}); Received: {offset}.",
            ranked.len()
        )));
    }

    let wants_summary = summary == Some(true);
    let mut truncated_summaries = 0;
    let mut nodes: Vec<ConceptRow<'_>> = Vec::new();
    for (document, found) in ranked.iter().skip(offset).take(limit) {
        let mut row = ConceptRow::of(document);
        if let Some(found) = found {
            row = row.with_mention(found.matched_in, found.score);
        }
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
    let has_more = offset + nodes.len() < ranked.len();
    let returned = nodes.len();
    // Zero rows is an unanswered question, so the hint says which part of it matched nothing: the
    // mention when it found no node among those the filter kept, else the filter.
    let growth_hint = if ranked.is_empty() {
        match (&mentions, &filter) {
            (Some(text), None) => Some(zero_rows_hint::for_mentions(text, &narrowed)),
            (Some(text), Some(_)) if !selected.is_empty() => {
                Some(zero_rows_hint::for_mentions(text, &narrowed))
            }
            (_, Some(filter)) => filter_text
                .as_deref()
                .map(|text| zero_rows_hint::for_filter(filter, text, documents)),
            (None, None) => None,
        }
    } else {
        None
    };
    ToolOutput::json(&Listing {
        total: ranked.len(),
        census: kind_census(documents),
        vault_root: context.config().vault_root.to_string_lossy().into_owned(),
        filter: filter_text.as_deref(),
        parsed_as: filter.as_ref().map(QueryFilter::represented),
        mentions: mentions.as_deref(),
        returned,
        limited: has_more,
        pagination: Pagination::of(offset, limit, ranked.len(), returned),
        summary_hint: (truncated_summaries > 0).then(|| {
            format!(
                "{truncated_summaries} row(s) carry a partial summary (summaryTruncated: true). Read those bodies in full with get_concepts({{ slugs: [...], body: \"full\" }})."
            )
        }),
        vault_warnings: (errors + warnings > 0).then_some(VaultWarnings {
            error_count: errors,
            warning_count: warnings,
        }),
        growth_hint,
        nodes,
    })
}
