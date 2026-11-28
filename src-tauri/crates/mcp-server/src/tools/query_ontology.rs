//! `query_ontology`: one question put to the compiled graph. The arguments are read here once, in
//! the order and with the sentences the script server uses, into the `QueryRequest` the operations
//! answer from (`ontology_graph::run_query`). An operation or an argument the server retired is
//! refused first, by `retired_arguments`, with what replaced it.

use ontology_graph::{
    is_match_nodes, match_nodes, Direction, NodeSort, Operation, QueryError, QueryRequest,
    SelectionArguments, RELATION_TYPE_VALUES, SEARCH_BUDGET_MAX,
};
use serde_json::Value;

use super::argument_checks::{
    argument, one_of, optional_boolean, optional_non_blank_text, optional_non_negative_integer,
    optional_one_of, optional_positive_integer, optional_text_list, required_non_blank_text,
};
use crate::analysis_records::{AnalysisArchive, ArchiveError};
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::retired_arguments::refuse_retired_query_operation;
use vault_document::slug_not_found_hint;

use super::meaning_readiness_facts::meaning_readiness_facts;
use super::project_graph::project_graph;
use super::read_vault::{open_root, read_vault};
use super::vault_validation_facts::{stale_summaries, validation_facts};
use crate::error::{ErrorCode, MissingNodeDetails, ReceivedValue, ToolError};

const NODE_KINDS: [&str; 6] = [
    "project",
    "domain",
    "capability",
    "element",
    "document",
    "vault-readme",
];
/// Arguments that are text a call may send; each is checked, and the ones an operation reads are
/// taken from what was checked.
const TEXT_ARGUMENTS: [&str; 10] = [
    "slug",
    "candidateSlug",
    "title",
    "from",
    "project",
    "to",
    "type",
    "kind",
    "domain",
    "afterActionId",
];
const BOOLEAN_ARGUMENTS: [&str; 6] = [
    "includeExternal",
    "includeUnresolved",
    "includeOrphans",
    "executableOnly",
    "hasIncoming",
    "hasOutgoing",
];
const MAINTENANCE_PHASES: usize = 5;
const MAINTENANCE_SEVERITIES: usize = 3;
const MAINTENANCE_KINDS: usize = 20;
const PAGE_MAX: f64 = 500.0;
const HOPS_MAX: f64 = 20.0;

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "each number was checked to be a whole number that is not negative"
)]
fn count(number: f64) -> usize {
    number as usize
}

fn invalid(message: &str) -> ToolError {
    ToolError::invalid(message)
}

fn text_of<'a>(texts: &'a [(&str, Option<String>)], name: &str) -> Option<&'a String> {
    texts
        .iter()
        .find(|(known, _)| *known == name)
        .and_then(|(_, text)| text.as_ref())
}

/// A whole number of at least one, at most `PAGE_MAX`, as the script server checks `limit`.
fn page_size(value: &Value, name: &str) -> Result<usize, ToolError> {
    let number = value
        .as_f64()
        .filter(|number| number.is_finite() && number.fract() == 0.0 && *number > 0.0)
        .ok_or_else(|| ToolError::invalid(format!("{name} must be a positive integer.")))?;
    if number > PAGE_MAX {
        return Err(ToolError::invalid(format!("{name} must be <= 500.")));
    }
    Ok(count(number))
}

/// `excludeKinds`: at most one entry per node kind, each a node kind.
fn excluded_kinds(arguments: &Arguments) -> Result<Option<Vec<String>>, ToolError> {
    let Some(kinds) = optional_text_list(arguments, "excludeKinds", NODE_KINDS.len())? else {
        return Ok(None);
    };
    for kind in &kinds {
        one_of(
            &Value::String(kind.clone()),
            "excludeKinds items",
            &NODE_KINDS,
        )?;
    }
    Ok(Some(kinds))
}

/// Reads every argument of the call once, in the script server's order, into the request. The id
/// of the record `analysis_record` reads comes beside it: it is no part of what a graph answers.
fn read_request(arguments: &Arguments) -> Result<(QueryRequest, Option<String>), ToolError> {
    let operation_name = required_non_blank_text(arguments, "operation")?;
    refuse_retired_query_operation(&operation_name)?;
    let operation = Operation::parse(&operation_name).ok_or_else(|| {
        ToolError::not_an_allowed_value(
            "operation",
            ReceivedValue::Text(&operation_name),
            &Operation::names(),
        )
    })?;
    let mut target_operation = None;
    if let Some(target) = optional_non_blank_text(arguments, "targetOperation")? {
        let targets = Operation::plan_target_names();
        if !targets.contains(&target.as_str()) {
            return Err(ToolError::not_an_allowed_value(
                "targetOperation",
                ReceivedValue::Text(&target),
                &targets,
            ));
        }
        target_operation = Operation::parse(&target);
    }
    let record_id = optional_non_blank_text(arguments, "recordId")?;
    let reads_record = operation == Operation::AnalysisRecord;
    if reads_record && record_id.is_none() {
        required_non_blank_text(arguments, "recordId")?;
    }
    if record_id.is_some() && !reads_record {
        return Err(invalid("recordId is only valid for analysis_record."));
    }
    let mut texts: Vec<(&str, Option<String>)> = Vec::with_capacity(TEXT_ARGUMENTS.len());
    for key in TEXT_ARGUMENTS {
        texts.push((key, optional_non_blank_text(arguments, key)?));
    }
    let limit = argument(arguments, "limit")?
        .map(|value| page_size(&value, "limit"))
        .transpose()?;
    let item_limit = optional_positive_integer(arguments, "itemLimit", Some(PAGE_MAX))?.map(count);
    let search_budget =
        optional_positive_integer(arguments, "searchBudget", Some(SEARCH_BUDGET_MAX as f64))?
            .map(count);
    let max_hops = optional_non_negative_integer(arguments, "maxHops", Some(HOPS_MAX))?.map(count);
    let depth = optional_non_negative_integer(arguments, "depth", Some(HOPS_MAX))?.map(count);
    let direction =
        optional_one_of(arguments, "direction", &Direction::ALLOWED)?.and_then(Direction::parse);
    let sort = optional_one_of(
        arguments,
        "sort",
        &["degree", "inDegree", "outDegree", "slug"],
    )?
    .and_then(NodeSort::parse);
    let is = |name: &str| operation.name() == name;
    if is("recommend_relations") {
        check_kind(&texts, &["capability", "element"])?;
    } else if is("match_nodes") {
        check_kind(&texts, &NODE_KINDS)?;
    }
    let mut include_orphans = None;
    let mut include_external = None;
    let mut include_unresolved = None;
    let mut flags: Vec<(&str, Option<bool>)> = Vec::with_capacity(BOOLEAN_ARGUMENTS.len());
    for key in BOOLEAN_ARGUMENTS {
        let flag = optional_boolean(arguments, key)?;
        match key {
            "includeOrphans" => include_orphans = flag,
            "includeExternal" => include_external = flag,
            "includeUnresolved" => include_unresolved = flag,
            _ => {}
        }
        flags.push((key, flag));
    }
    let offset = optional_non_negative_integer(arguments, "offset", None)?.map(count);
    let exclude_kinds = excluded_kinds(arguments)?;
    let relations = RELATION_TYPE_VALUES.len();
    let types = optional_text_list(arguments, "types", relations)?;
    let pattern = optional_text_list(arguments, "pattern", relations)?;
    let phases = optional_text_list(arguments, "phases", MAINTENANCE_PHASES)?;
    let severities = optional_text_list(arguments, "severities", MAINTENANCE_SEVERITIES)?;
    let kinds = optional_text_list(arguments, "kinds", MAINTENANCE_KINDS)?;

    let mut request = QueryRequest::new(operation);
    request.slug = text_of(&texts, "slug").cloned();
    request.from = text_of(&texts, "from").cloned();
    request.to = text_of(&texts, "to").cloned();
    request.limit = limit;
    request.max_hops = max_hops;
    request.depth = depth;
    request.search_budget = search_budget;
    request.direction = direction;
    request.types = types;
    request.include_external = include_external;
    request.include_unresolved = include_unresolved;
    request.item_limit = item_limit;
    request.include_orphans = include_orphans;
    request.pattern = pattern;
    request.project = text_of(&texts, "project").cloned();
    request.relation_type = text_of(&texts, "type").cloned();
    request.target_operation = target_operation;
    let text = |name: &str| text_of(&texts, name).cloned();
    let flag = |name: &str| {
        flags
            .iter()
            .find(|(key, _)| *key == name)
            .and_then(|(_, f)| *f)
    };
    request.selection.arguments = SelectionArguments {
        kind: text("kind"),
        domain: text("domain"),
        has_incoming: flag("hasIncoming"),
        has_outgoing: flag("hasOutgoing"),
        sort,
        offset,
        exclude_kinds,
        candidate_slug: text("candidateSlug"),
        title: text("title"),
        phases,
        severities,
        kinds,
        executable_only: flag("executableOnly"),
        after_action_id: text("afterActionId"),
        touching: None,
    };
    Ok((request, record_id))
}

fn check_kind(texts: &[(&str, Option<String>)], allowed: &[&str]) -> Result<(), ToolError> {
    match text_of(texts, "kind") {
        Some(text) if !allowed.contains(&text.as_str()) => Err(ToolError::not_an_allowed_value(
            "kind",
            ReceivedValue::Text(text),
            allowed,
        )),
        _ => Ok(()),
    }
}

/// The refusal an agent reads. `node_profile` alone adds a growth hint to a name that is no node, so a
/// vault that lacks it is told what to add.
fn refusal(error: QueryError, operation: &str) -> ToolError {
    match error {
        QueryError::Invalid(message) => ToolError::invalid(message),
        QueryError::NotAGraphOperation(_) | QueryError::Failed(_) => {
            ToolError::failed(error.to_string())
        }
        QueryError::UnknownNode {
            field,
            name,
            similar,
        } => {
            let message = QueryError::UnknownNode {
                field,
                name: name.clone(),
                similar: similar.clone(),
            }
            .to_string();
            let growth_hint = (operation == "node_profile")
                .then(|| slug_not_found_hint(&name, None, &similar, &[]));
            ToolError::missing_node(
                message,
                MissingNodeDetails {
                    subject: field,
                    slug: Some(name),
                    recovery_tools: vec!["list_concepts"],
                    create_tool: Some("add_concepts"),
                    similar_slugs: Some(similar),
                    growth_hint,
                    ..MissingNodeDetails::default()
                },
            )
        }
        QueryError::NotAnAllowedValue {
            name,
            received,
            allowed,
        } => ToolError::not_an_allowed_value(&name, ReceivedValue::Text(&received), &allowed),
    }
}

/// The vault's own list of references that are intentional code, read for the operations that
/// would otherwise propose to turn them into nodes.
pub(super) fn read_ignore_patterns(context: &CallContext<'_>) -> Result<Vec<String>, ToolError> {
    let text = open_root(context)?
        .read_top_file(".ontology-atlasignore")
        .map_err(|error| ToolError::failed(error.to_string()))?;
    Ok(text.map_or_else(Vec::new, |text| {
        ontology_graph::parse_ignore_patterns(&text)
    }))
}

/// What a refusal of the archive says and how it is classed: a wrong argument is the caller's to
/// fix, a missing record is not found, and everything else is about the vault.
fn archive_refusal(error: &ArchiveError) -> ToolError {
    match error {
        ArchiveError::InvalidRecordId => ToolError::invalid(error.to_string()),
        ArchiveError::NotFound => ToolError::new(ErrorCode::NotFound, error.to_string()),
        ArchiveError::Ambiguous | ArchiveError::FolderRefused | ArchiveError::Unreadable(_) => {
            ToolError::failed(error.to_string())
        }
    }
}

/// `analysis_record` answers from the vault's record files and never compiles the graph, so a
/// vault whose graph cannot compile still reads its records.
fn answer_from_archive(
    context: &CallContext<'_>,
    record_id: &str,
) -> Result<ToolOutput, ToolError> {
    let archive = AnalysisArchive::new(context.config().vault_root.clone());
    let answer = archive
        .record(record_id)
        .map_err(|error| archive_refusal(&error))?;
    ToolOutput::json(&answer)
}

pub fn call(context: &CallContext<'_>, arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let (mut request, record_id) = read_request(arguments)?;
    if request.operation == Operation::AnalysisRecord {
        return answer_from_archive(context, &record_id.unwrap_or_default());
    }
    if is_match_nodes(&request) {
        let read = read_vault(context)?;
        return ToolOutput::json(&match_nodes(read.vault.documents(), &request));
    }
    if matches!(
        request.operation.name(),
        "growth_plan" | "maintenance_plan" | "workspace_brief"
    ) {
        request.selection.outside.ignore_patterns = read_ignore_patterns(context)?;
    }
    match request.operation.name() {
        "health" | "workspace_brief" | "agent_brief" => {
            request.selection.outside.validation = Some(validation_facts(context)?);
        }
        "maintenance_plan" => {
            request.selection.outside.stale_summaries = stale_summaries(context)?;
        }
        _ => {}
    }
    let mut graph = context.compiled_graph().read(context)?;
    if matches!(request.operation.name(), "health" | "workspace_brief") {
        request.selection.outside.meaning = meaning_readiness_facts(context, &graph)?;
    }
    if request.operation.name() == "agent_brief" {
        let operation = request.operation.name();
        let (project_graph, project) =
            project_graph(context, graph, request.project.as_deref(), |error| {
                refusal(error, operation)
            })?;
        graph = project_graph;
        request.project = project;
    }
    let answer = ontology_graph::run_query(&graph, &request)
        .map_err(|error| refusal(error, request.operation.name()))?;
    ToolOutput::json(&answer)
}
