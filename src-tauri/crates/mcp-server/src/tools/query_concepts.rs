//! `query_concepts`: the nodes that match a filter such as `kind=capability AND has(elements)`.

use std::collections::HashMap;

use serde::Serialize;
use vault_document::frontmatter::Value;
use vault_document::{query_zero_rows_hint, FilterError, GrowthHint, QueryFilter};

use super::argument_checks::{optional_positive_integer, required_non_blank_text};
use super::concept_row::ConceptRow;
use super::read_vault::read_vault;
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::{ReceivedValue, ToolError};

const DEFAULT_LIMIT: f64 = 100.0;
const MAXIMUM_LIMIT: f64 = 500.0;

#[derive(Serialize)]
struct Matches<'a> {
    filter: &'a str,
    #[serde(rename = "parsedAs")]
    parsed_as: String,
    total: usize,
    matches: Vec<ConceptRow<'a>>,
    limited: bool,
    #[serde(rename = "growthHint", skip_serializing_if = "Option::is_none")]
    growth_hint: Option<GrowthHint>,
}

fn refusal(error: FilterError) -> ToolError {
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
    reason = "the limit was checked to be a whole number from one to 500"
)]
fn count(number: f64) -> usize {
    number as usize
}

pub fn call(context: &CallContext<'_>, arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let filter_text = required_non_blank_text(arguments, "filter")?;
    let limit = count(
        optional_positive_integer(arguments, "limit", Some(MAXIMUM_LIMIT))?
            .unwrap_or(DEFAULT_LIMIT),
    );
    let filter = QueryFilter::parse(&filter_text).map_err(refusal)?;
    let read = read_vault(context)?;
    let nodes = read
        .vault
        .documents()
        .iter()
        .filter(|document| document.frontmatter().truthy("kind").is_some());
    let mut total = 0;
    let mut matches = Vec::new();
    for document in nodes {
        if !filter.matches(document) {
            continue;
        }
        total += 1;
        if matches.len() < limit {
            matches.push(ConceptRow::of(document));
        }
    }
    let growth_hint = (total == 0).then(|| {
        let mut by_kind: HashMap<String, usize> = HashMap::new();
        let mut by_domain: HashMap<String, usize> = HashMap::new();
        for document in read.vault.documents() {
            let frontmatter = document.frontmatter();
            if frontmatter.truthy("kind").is_none() {
                continue;
            }
            *by_kind
                .entry(
                    frontmatter
                        .get("kind")
                        .map(Value::display_text)
                        .unwrap_or_default(),
                )
                .or_default() += 1;
            if let Some(Value::Text(domain)) = frontmatter
                .get("domain")
                .filter(|domain| domain.is_truthy())
            {
                *by_domain.entry(domain.clone()).or_default() += 1;
            }
        }
        query_zero_rows_hint(&filter, &filter_text, &by_kind, &by_domain)
    });
    ToolOutput::json(&Matches {
        filter: &filter_text,
        parsed_as: filter.represented(),
        total,
        limited: total > matches.len(),
        matches,
        growth_hint,
    })
}
