//! `query_ontology`: one question put to the compiled graph. The arguments are read here once, in
//! the order and with the sentences the JavaScript server used, into the `QueryRequest` the
//! operations answer from (`ontology_graph::run_query`).

use ontology_graph::{Direction, Operation, QueryError, QueryRequest, RELATION_TYPE_VALUES};
use serde_json::Value;

use super::argument_checks::{
    argument, optional_boolean, optional_non_blank_text, optional_non_negative_integer,
    optional_one_of, optional_positive_integer, optional_text_list, required_non_blank_text,
};
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::{MissingNodeDetails, ReceivedValue, ToolError};

const NODE_KINDS: [&str; 6] = [
    "project",
    "domain",
    "capability",
    "element",
    "document",
    "vault-readme",
];
const EDGE_TARGET_KINDS: [&str; 8] = [
    "project",
    "domain",
    "capability",
    "element",
    "document",
    "vault-readme",
    "external",
    "unresolved",
];
/// Arguments that are text a call may send; each is checked, and the ones an operation reads are
/// taken from what was checked.
const TEXT_ARGUMENTS: [&str; 20] = [
    "slug",
    "seed",
    "candidateSlug",
    "title",
    "task",
    "from",
    "project",
    "to",
    "type",
    "kind",
    "domain",
    "slugContains",
    "fromKind",
    "toKind",
    "relation",
    "afterActionId",
    "expectedGraphHash",
    "expectedSourceFingerprint",
    "reviewRevision",
    "cursor",
];
const COUNT_ARGUMENTS: [&str; 7] = [
    "limit",
    "itemLimit",
    "nodeLimit",
    "componentLimit",
    "cycleLimit",
    "recommendationLimit",
    "orderLimit",
];
const BOOLEAN_ARGUMENTS: [&str; 7] = [
    "includeExternal",
    "includeUnresolved",
    "includeIsolated",
    "includeOrphans",
    "executableOnly",
    "hasIncoming",
    "hasOutgoing",
];
const MAINTENANCE_PHASES: usize = 5;
const MAINTENANCE_SEVERITIES: usize = 3;
const MAINTENANCE_KINDS: usize = 20;
const TASK_MAX_CHARS: usize = 2_000;
const PAGE_MAX: f64 = 500.0;
const ITERATIONS_MAX: f64 = 100.0;
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

/// `^prefix[a-f0-9]{digits}$`.
fn is_prefixed_hex(text: &str, prefix: &str, digits: usize) -> bool {
    text.strip_prefix(prefix).is_some_and(|rest| {
        rest.len() == digits
            && rest
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    })
}

fn text_of<'a>(texts: &'a [(&str, Option<String>)], name: &str) -> Option<&'a String> {
    texts
        .iter()
        .find(|(known, _)| *known == name)
        .and_then(|(_, text)| text.as_ref())
}

/// A whole number of at least one, at most `PAGE_MAX`, as the JavaScript server checks `limit`.
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

/// Reads every argument of the call once, in the JavaScript server's order, into the request.
fn read_request(arguments: &Arguments) -> Result<QueryRequest, ToolError> {
    let operation_name = required_non_blank_text(arguments, "operation")?;
    let operation = Operation::parse(&operation_name).ok_or_else(|| {
        ToolError::not_an_allowed_value(
            "operation",
            ReceivedValue::Text(&operation_name),
            &Operation::names(),
        )
    })?;
    if let Some(target) = optional_non_blank_text(arguments, "targetOperation")? {
        let targets = Operation::plan_target_names();
        if !targets.contains(&target.as_str()) {
            return Err(ToolError::not_an_allowed_value(
                "targetOperation",
                ReceivedValue::Text(&target),
                &targets,
            ));
        }
    }
    let record_id = optional_non_blank_text(arguments, "recordId")?;
    let analysis_cursor = optional_non_blank_text(arguments, "analysisCursor")?;
    let analysis_mode = optional_one_of(arguments, "analysisMode", &["meaning", "architecture"])?;
    let is = |name: &str| operation.name() == name;
    if is("analysis_record") && record_id.is_none() {
        required_non_blank_text(arguments, "recordId")?;
    }
    if record_id.is_some() && !is("analysis_record") {
        return Err(invalid("recordId is only valid for analysis_record."));
    }
    if (analysis_mode.is_some() || analysis_cursor.is_some()) && !is("analysis_history") {
        return Err(invalid(
            "Analysis history filters require analysis_history.",
        ));
    }
    let limit_sent = argument(arguments, "limit")?;
    if is("analysis_history") {
        if let Some(limit) = &limit_sent {
            let fine = limit
                .as_f64()
                .is_some_and(|n| n.fract() == 0.0 && (1.0..=100.0).contains(&n));
            if !fine {
                return Err(invalid(
                    "Analysis history limit must be between 1 and 100 scanned files.",
                ));
            }
        }
    }
    let mut texts: Vec<(&str, Option<String>)> = Vec::with_capacity(TEXT_ARGUMENTS.len());
    for key in TEXT_ARGUMENTS {
        texts.push((key, optional_non_blank_text(arguments, key)?));
    }
    let detail = optional_one_of(arguments, "detail", &["compact", "full"])?;
    if detail.is_some() && !is("agent_brief") {
        return Err(invalid(
            "detail is only valid for operation \"agent_brief\".",
        ));
    }
    let compact = detail == Some("compact");
    let task = text_of(&texts, "task");
    if task.is_some() && (!is("agent_brief") || !compact) {
        return Err(invalid(
            "task is only valid for operation \"agent_brief\" with detail \"compact\".",
        ));
    }
    if is("agent_brief") && compact && task.is_none() {
        return Err(invalid("agent_brief detail \"compact\" requires task."));
    }
    if let Some(task) = task {
        if answer_format::utf16::len(task) > TASK_MAX_CHARS {
            return Err(invalid(&format!(
                "task must contain at most {TASK_MAX_CHARS} characters."
            )));
        }
    }
    let mut limit = None;
    let mut node_limit = None;
    for key in COUNT_ARGUMENTS {
        let size = if key == "limit" {
            limit_sent
                .as_ref()
                .map(|value| page_size(value, key))
                .transpose()?
        } else {
            optional_positive_integer(arguments, key, Some(PAGE_MAX))?.map(count)
        };
        match key {
            "limit" => limit = size,
            "nodeLimit" => node_limit = size,
            _ => {}
        }
    }
    let iterations =
        optional_positive_integer(arguments, "iterations", Some(ITERATIONS_MAX))?.map(count);
    let max_hops = optional_non_negative_integer(arguments, "maxHops", Some(HOPS_MAX))?.map(count);
    let depth = optional_non_negative_integer(arguments, "depth", Some(HOPS_MAX))?.map(count);
    for key in ["minDegree", "maxDegree", "minInDegree", "minOutDegree"] {
        optional_non_negative_integer(arguments, key, None)?;
    }
    let direction =
        optional_one_of(arguments, "direction", &Direction::ALLOWED)?.and_then(Direction::parse);
    optional_one_of(
        arguments,
        "sort",
        &["degree", "inDegree", "outDegree", "slug"],
    )?;
    if is("recommend_relations") {
        check_kind(&texts, &["capability", "element"])?;
    } else if is("match_nodes") {
        check_kind(&texts, &NODE_KINDS)?;
    }
    if is("match_edges") {
        check_text_in(&texts, "fromKind", &NODE_KINDS)?;
        check_text_in(&texts, "toKind", &EDGE_TARGET_KINDS)?;
    }
    let mut include_isolated = None;
    let mut include_external = None;
    let mut include_unresolved = None;
    for key in BOOLEAN_ARGUMENTS {
        let flag = optional_boolean(arguments, key)?;
        match key {
            "includeIsolated" => include_isolated = flag,
            "includeExternal" => include_external = flag,
            "includeUnresolved" => include_unresolved = flag,
            _ => {}
        }
    }
    let relations = RELATION_TYPE_VALUES.len();
    let types = optional_text_list(arguments, "types", relations)?;
    optional_text_list(arguments, "pattern", relations)?;
    optional_text_list(arguments, "phases", MAINTENANCE_PHASES)?;
    optional_text_list(arguments, "severities", MAINTENANCE_SEVERITIES)?;
    optional_text_list(arguments, "kinds", MAINTENANCE_KINDS)?;
    optional_text_list(arguments, "dependencyTypes", relations)?;
    optional_text_list(arguments, "componentTypes", relations)?;
    if is("meaning_repair_review") {
        check_meaning_repair(arguments, &texts)?;
    }
    // Judged by the operations that spend it, after they have found their nodes.
    let search_budget =
        argument(arguments, "searchBudget")?.map(|value| value.as_f64().unwrap_or(f64::NAN));

    let mut request = QueryRequest::new(operation);
    request.slug = text_of(&texts, "slug").cloned();
    request.from = text_of(&texts, "from").cloned();
    request.to = text_of(&texts, "to").cloned();
    request.limit = limit;
    request.node_limit = node_limit;
    request.iterations = iterations;
    request.max_hops = max_hops;
    request.depth = depth;
    request.search_budget = search_budget;
    request.direction = direction;
    request.types = types;
    request.include_isolated = include_isolated;
    request.include_external = include_external;
    request.include_unresolved = include_unresolved;
    Ok(request)
}

fn check_kind(texts: &[(&str, Option<String>)], allowed: &[&str]) -> Result<(), ToolError> {
    check_text_in(texts, "kind", allowed)
}

fn check_text_in(
    texts: &[(&str, Option<String>)],
    name: &str,
    allowed: &[&str],
) -> Result<(), ToolError> {
    match text_of(texts, name) {
        Some(text) if !allowed.contains(&text.as_str()) => Err(ToolError::not_an_allowed_value(
            name,
            ReceivedValue::Text(text),
            allowed,
        )),
        _ => Ok(()),
    }
}

fn check_meaning_repair(
    arguments: &Arguments,
    texts: &[(&str, Option<String>)],
) -> Result<(), ToolError> {
    if text_of(texts, "project").is_none() {
        required_non_blank_text(arguments, "project")?;
    }
    if text_of(texts, "reviewRevision").is_none() {
        required_non_blank_text(arguments, "reviewRevision")?;
    }
    let cursor = text_of(texts, "cursor");
    if cursor.is_none() {
        if text_of(texts, "expectedGraphHash").is_none() {
            required_non_blank_text(arguments, "expectedGraphHash")?;
        }
        if text_of(texts, "expectedSourceFingerprint").is_none() {
            required_non_blank_text(arguments, "expectedSourceFingerprint")?;
        }
    }
    if let Some(hash) = text_of(texts, "expectedGraphHash") {
        if !is_prefixed_hex(hash, "project-graph-v1:", 8) {
            return Err(invalid(
                "expectedGraphHash must be a project-graph-v1 hash.",
            ));
        }
    }
    if !text_of(texts, "reviewRevision")
        .is_some_and(|revision| is_prefixed_hex(revision, "sha256:", 64))
    {
        return Err(invalid("reviewRevision must be a sha256 digest."));
    }
    if let Some(fingerprint) = text_of(texts, "expectedSourceFingerprint") {
        if answer_format::utf16::len(fingerprint) > 200 {
            return Err(invalid(
                "expectedSourceFingerprint must contain at most 200 characters.",
            ));
        }
    }
    if let Some(cursor) = cursor {
        if answer_format::utf16::len(cursor) > 4096 {
            return Err(invalid("cursor must contain at most 4096 characters."));
        }
        let is_meaning_cursor = cursor.strip_prefix("mrp1.").is_some_and(|rest| {
            rest.len() == 32
                && rest
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        });
        if !is_meaning_cursor {
            return Err(invalid(
                "cursor must be an opaque meaning repair cursor returned by nextCall.",
            ));
        }
    }
    Ok(())
}

fn refusal(error: QueryError) -> ToolError {
    match error {
        QueryError::Invalid(message) => ToolError::invalid(message),
        QueryError::NotAnsweredYet(_) | QueryError::Failed(_) => {
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
            ToolError::missing_node(
                message,
                MissingNodeDetails {
                    subject: field,
                    slug: Some(name),
                    recovery_tools: vec!["list_concepts", "find_evidence"],
                    create_tool: Some("add_concepts"),
                    similar_slugs: Some(similar),
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

pub fn call(context: &CallContext<'_>, arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let request = read_request(arguments)?;
    let graph = context.compiled_graph().read(context)?;
    let answer = ontology_graph::run_query(&graph, &request).map_err(refusal)?;
    ToolOutput::json(&answer)
}
