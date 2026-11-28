//! `get_constellation`: the saved constellations of the vault (task-scoped node sets a person
//! kept). With no `id` it lists them. With an `id` it answers one constellation: which of its
//! members still resolve to a node, how those nodes relate, and which declared dependencies cross
//! its boundary. Read-only.

use saved_constellations::{
    constellation_context, list_constellations, read_saved_collections, select_constellation,
    CollectionsSource, Constellation, ContextFault, ContextRequest, SavedCollections, Status,
};
use vault_document::LoadedVault;
use answer_format::pagination::Pagination;
use serde::Serialize;
use vault_document::frontmatter::Value as FrontmatterValue;

use super::read_vault::open_root;
use super::argument_checks::{
    argument, non_blank_text, optional_non_negative_integer, optional_positive_integer,
};
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::{ErrorCode, ToolError};

const DEFAULT_LIMIT: usize = 50;
const MAX_LIMIT: f64 = 100.0;
const DEFAULT_RELATION_LIMIT: usize = 100;
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

#[derive(Serialize)]
struct ContextAnswer<'a> {
    contract: &'static str,
    availability: &'static str,
    source: &'a CollectionsSource,
    #[serde(flatten)]
    context: saved_constellations::ConstellationContext<'a>,
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
    context: &CallContext<'_>,
    saved: &SavedCollections,
    id: &str,
    request: &ContextRequest,
) -> Result<ToolOutput, ToolError> {
    let root = open_root(context)?;
    let vault = LoadedVault::load(&root, context.documents())
        .map_err(|error| ToolError::failed(error.to_string()))?;
    let source = &saved.source;
    let Some(collections) = &saved.collections else {
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
    let Some(selection) = select_constellation(collections, id) else {
        return Err(ToolError::new(
            ErrorCode::NotFound,
            format!("Saved constellation not found: {id}. Call get_constellation with no id to see the IDs in this vault."),
        ));
    };
    let answer = constellation_context(&selection, vault.documents(), request).map_err(|fault| {
        match fault {
            ContextFault::OffsetPastTotal(total) => ToolError::invalid(format!(
                "offset must be less than or equal to the total matching rows ({total}); Received: {}.",
                request.offset
            )),
            ContextFault::Unreadable(error) => ToolError::failed(error.to_string()),
        }
    })?;
    ToolOutput::json(&ContextAnswer {
        contract: CONTEXT_CONTRACT,
        availability: source.availability,
        source,
        context: answer,
    })
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
        Some(id) => one(
            context,
            &saved,
            &id,
            &ContextRequest {
                offset,
                limit,
                relation_limit: relation_limit.map_or(DEFAULT_RELATION_LIMIT, count),
                dependency_limit: dependency_limit.map_or(DEFAULT_RELATION_LIMIT, count),
            },
        ),
    }
}
