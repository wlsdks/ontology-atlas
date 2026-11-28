//! `get_constellation`: the saved constellations of the vault (task-scoped node sets a person
//! kept). With no `id` it lists them. With an `id` it answers whether the saved file can be read
//! and whether that constellation exists; reading one constellation's members, relations and
//! dependencies is not ported yet. Read-only.

use saved_constellations::{
    list_constellations, read_saved_collections, CollectionsSource, Constellation, Status,
};
use answer_format::pagination::Pagination;
use serde::Serialize;
use vault_document::frontmatter::Value as FrontmatterValue;

use super::argument_checks::{
    argument, non_blank_text, optional_non_negative_integer, optional_positive_integer,
};
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::{ErrorCode, ToolError};

const DEFAULT_LIMIT: usize = 50;
const MAX_LIMIT: f64 = 100.0;
const MAX_RELATION_LIMIT: f64 = 200.0;

const LIST_CONTRACT: &str = "savedConstellationList:v1";
const CONTEXT_CONTRACT: &str = "savedConstellationContext:v1";
const LIST_GUIDANCE: &str = "This is saved task-scope metadata. Membership and purpose do not establish ontology relations, accepted meaning, currentness, or complete impact coverage.";

#[derive(Serialize)]
struct ConstellationList<'a> {
    contract: &'static str,
    availability: &'static str,
    source: &'a CollectionsSource,
    total: usize,
    returned: usize,
    limited: bool,
    pagination: Pagination,
    constellations: &'a [Constellation],
    guidance: &'static str,
}

#[derive(Serialize)]
struct UnavailableContext<'a> {
    contract: &'static str,
    availability: &'static str,
    source: &'a CollectionsSource,
    guidance: &'static str,
}

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "the number was checked to be a whole number and is bounded by the argument's maximum"
)]
fn count(number: f64) -> usize {
    number as usize
}

fn unavailable_guidance(
    source: &CollectionsSource,
    missing: &'static str,
    broken: &'static str,
) -> &'static str {
    if source.status == Status::Missing {
        missing
    } else {
        broken
    }
}

fn list(
    source: &CollectionsSource,
    constellations: Option<Vec<Constellation>>,
    offset: usize,
    limit: usize,
) -> Result<ToolOutput, ToolError> {
    let Some(all) = constellations else {
        return ToolOutput::json(&ConstellationList {
            contract: LIST_CONTRACT,
            availability: source.availability,
            source,
            total: 0,
            returned: 0,
            limited: false,
            pagination: Pagination::of(0, 0, 0, 0),
            constellations: &[],
            guidance: unavailable_guidance(
                source,
                "No saved constellation file exists in this vault yet.",
                "Saved constellations are unavailable because the sidecar is corrupt or unsupported. Atlas did not repair or replace it.",
            ),
        });
    };
    if offset > all.len() {
        return Err(ToolError::invalid(format!(
            "offset must be less than or equal to the total matching rows ({}); Received: {offset}.",
            all.len()
        )));
    }
    let page: Vec<Constellation> = all.iter().skip(offset).take(limit).cloned().collect();
    let next = offset + page.len();
    let has_more = next < all.len();
    ToolOutput::json(&ConstellationList {
        contract: LIST_CONTRACT,
        availability: source.availability,
        source,
        total: all.len(),
        returned: page.len(),
        limited: has_more,
        pagination: Pagination::of(offset, limit, all.len(), page.len()),
        constellations: &page,
        guidance: LIST_GUIDANCE,
    })
}

fn one(
    source: &CollectionsSource,
    constellations: Option<Vec<Constellation>>,
    id: &str,
) -> Result<ToolOutput, ToolError> {
    let Some(all) = constellations else {
        return ToolOutput::json(&UnavailableContext {
            contract: CONTEXT_CONTRACT,
            availability: source.availability,
            source,
            guidance: unavailable_guidance(
                source,
                "No saved constellation file exists in this vault yet.",
                "The saved constellation is unavailable because the sidecar is corrupt or unsupported. Atlas did not repair or replace it.",
            ),
        });
    };
    if !all.iter().any(|constellation| constellation.id == id) {
        return Err(ToolError::new(
            ErrorCode::NotFound,
            format!("Saved constellation not found: {id}. Call get_constellation with no id to see the IDs in this vault."),
        ));
    }
    Err(ToolError::failed(
        "Reading the members of one saved constellation is not ported to the Rust server yet; \
         call get_constellation with no id to list the saved constellations.",
    ))
}

pub fn call(context: &CallContext<'_>, arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let offset = optional_non_negative_integer(arguments, "offset", None)?.map_or(0, count);
    let limit = optional_positive_integer(arguments, "limit", Some(MAX_LIMIT))?
        .map_or(DEFAULT_LIMIT, count);
    let relation_limit =
        optional_positive_integer(arguments, "relationLimit", Some(MAX_RELATION_LIMIT))?;
    let dependency_limit =
        optional_positive_integer(arguments, "dependencyLimit", Some(MAX_RELATION_LIMIT))?;
    let id = argument(arguments, "id")?;
    if id.is_none() && (relation_limit.is_some() || dependency_limit.is_some()) {
        return Err(ToolError::invalid(
            "relationLimit and dependencyLimit must be omitted without id: they bound the relations of one constellation.",
        ));
    }
    let id = id
        .as_ref()
        .map(|value| non_blank_text(value, "id"))
        .transpose()?;
    if let Some(id) = &id {
        let as_text = FrontmatterValue::Text(id.clone());
        if let Some(issue) = vault_document::schema::node_uid_issue(Some(&as_text)) {
            return Err(ToolError::invalid(format!("id {issue}")));
        }
    }
    let saved = read_saved_collections(&context.config().vault_root);
    let constellations = saved.collections.as_ref().map(list_constellations);
    match id {
        None => list(&saved.source, constellations, offset, limit),
        Some(id) => one(&saved.source, constellations, &id),
    }
}
