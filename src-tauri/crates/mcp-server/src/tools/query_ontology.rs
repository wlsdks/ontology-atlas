//! `query_ontology`: one question put to the compiled graph. The arguments are checked here, in
//! the order and with the sentences the JavaScript server used; the operations are
//! `ontology_graph::run_query`.

use ontology_graph::{Direction, QueryError, QueryRequest, RELATION_TYPE_VALUES};

use super::argument_checks::{
    argument, optional_boolean, optional_non_blank_text, optional_non_negative_integer,
    optional_one_of, optional_positive_integer, optional_text_list, required_non_blank_text,
};
use super::compiled_graph::read_graph;
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::{MissingNodeDetails, ReceivedValue, ToolError};

const OPERATIONS: [&str; 39] = [
    "neighbors",
    "path",
    "all_paths",
    "query_plan",
    "centrality",
    "communities",
    "similar_nodes",
    "explain_relation",
    "reachability",
    "pattern_walk",
    "impact",
    "blast_radius",
    "subgraph",
    "builder_context",
    "overview",
    "schema",
    "facets",
    "match_nodes",
    "match_edges",
    "node_profile",
    "domain_profile",
    "domain_matrix",
    "project_scope",
    "project_map",
    "relation_check",
    "components",
    "lineage",
    "containment_tree",
    "cycles",
    "topological_order",
    "recommend_relations",
    "growth_plan",
    "maintenance_plan",
    "agent_brief",
    "meaning_repair_review",
    "analysis_history",
    "analysis_record",
    "workspace_brief",
    "health",
];

/// The operations a `query_plan` may plan: all but itself and the three that read other files.
const PLAN_TARGETS: [&str; 35] = [
    "neighbors",
    "path",
    "all_paths",
    "centrality",
    "communities",
    "similar_nodes",
    "explain_relation",
    "reachability",
    "pattern_walk",
    "impact",
    "blast_radius",
    "subgraph",
    "builder_context",
    "overview",
    "schema",
    "facets",
    "match_nodes",
    "match_edges",
    "node_profile",
    "domain_profile",
    "domain_matrix",
    "project_scope",
    "project_map",
    "relation_check",
    "components",
    "lineage",
    "containment_tree",
    "cycles",
    "topological_order",
    "recommend_relations",
    "growth_plan",
    "maintenance_plan",
    "agent_brief",
    "workspace_brief",
    "health",
];

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
const MAINTENANCE_PHASES: usize = 5;
const MAINTENANCE_SEVERITIES: usize = 3;
const MAINTENANCE_KINDS: usize = 20;
const TASK_MAX_CHARS: usize = 2_000;
const PAGE_MAX: f64 = 500.0;

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

fn is_sent(arguments: &Arguments, name: &str) -> bool {
    arguments.get(name).is_some()
}

/// The checks every `query_ontology` call passes before an operation runs, in the JavaScript
/// server's order, and the operation the call names.
fn check_arguments(arguments: &Arguments) -> Result<String, ToolError> {
    let operation = required_non_blank_text(arguments, "operation")?;
    optional_one_of(arguments, "operation", &OPERATIONS)?;
    optional_non_blank_text(arguments, "targetOperation")?;
    optional_one_of(arguments, "targetOperation", &PLAN_TARGETS)?;
    optional_non_blank_text(arguments, "recordId")?;
    optional_non_blank_text(arguments, "analysisCursor")?;
    optional_one_of(arguments, "analysisMode", &["meaning", "architecture"])?;
    if operation == "analysis_record" {
        required_non_blank_text(arguments, "recordId")?;
    }
    if is_sent(arguments, "recordId") && operation != "analysis_record" {
        return Err(invalid("recordId is only valid for analysis_record."));
    }
    if (is_sent(arguments, "analysisMode") || is_sent(arguments, "analysisCursor"))
        && operation != "analysis_history"
    {
        return Err(invalid(
            "Analysis history filters require analysis_history.",
        ));
    }
    if operation == "analysis_history" {
        if let Some(limit) = argument(arguments, "limit")? {
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
    for key in [
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
    ] {
        optional_non_blank_text(arguments, key)?;
    }
    optional_one_of(arguments, "detail", &["compact", "full"])?;
    let detail = arguments.string("detail");
    if is_sent(arguments, "detail") && operation != "agent_brief" {
        return Err(invalid(
            "detail is only valid for operation \"agent_brief\".",
        ));
    }
    let compact = detail.as_deref() == Some("compact");
    if is_sent(arguments, "task") && (operation != "agent_brief" || !compact) {
        return Err(invalid(
            "task is only valid for operation \"agent_brief\" with detail \"compact\".",
        ));
    }
    if operation == "agent_brief" && compact && !is_sent(arguments, "task") {
        return Err(invalid("agent_brief detail \"compact\" requires task."));
    }
    if let Some(task) = arguments.string("task") {
        if answer_format::utf16::len(&task) > TASK_MAX_CHARS {
            return Err(invalid(&format!(
                "task must contain at most {TASK_MAX_CHARS} characters."
            )));
        }
    }
    for key in [
        "limit",
        "itemLimit",
        "nodeLimit",
        "componentLimit",
        "cycleLimit",
        "recommendationLimit",
        "orderLimit",
    ] {
        optional_positive_integer(arguments, key, Some(PAGE_MAX))?;
    }
    optional_positive_integer(arguments, "iterations", Some(100.0))?;
    optional_non_negative_integer(arguments, "maxHops", Some(20.0))?;
    optional_non_negative_integer(arguments, "depth", Some(20.0))?;
    for key in ["minDegree", "maxDegree", "minInDegree", "minOutDegree"] {
        optional_non_negative_integer(arguments, key, None)?;
    }
    optional_one_of(arguments, "direction", &Direction::ALLOWED)?;
    optional_one_of(
        arguments,
        "sort",
        &["degree", "inDegree", "outDegree", "slug"],
    )?;
    match operation.as_str() {
        "recommend_relations" => {
            optional_one_of(arguments, "kind", &["capability", "element"])?;
        }
        "match_nodes" => {
            optional_one_of(arguments, "kind", &NODE_KINDS)?;
        }
        _ => {}
    }
    if operation == "match_edges" {
        optional_one_of(arguments, "fromKind", &NODE_KINDS)?;
        optional_one_of(arguments, "toKind", &EDGE_TARGET_KINDS)?;
    }
    for key in [
        "includeExternal",
        "includeUnresolved",
        "includeIsolated",
        "includeOrphans",
        "executableOnly",
        "hasIncoming",
        "hasOutgoing",
    ] {
        optional_boolean(arguments, key)?;
    }
    let relations = RELATION_TYPE_VALUES.len();
    optional_text_list(arguments, "types", relations)?;
    optional_text_list(arguments, "pattern", relations)?;
    optional_text_list(arguments, "phases", MAINTENANCE_PHASES)?;
    optional_text_list(arguments, "severities", MAINTENANCE_SEVERITIES)?;
    optional_text_list(arguments, "kinds", MAINTENANCE_KINDS)?;
    optional_text_list(arguments, "dependencyTypes", relations)?;
    optional_text_list(arguments, "componentTypes", relations)?;
    if operation == "meaning_repair_review" {
        required_non_blank_text(arguments, "project")?;
        required_non_blank_text(arguments, "reviewRevision")?;
        let cursor = arguments.string("cursor");
        if cursor.is_none() {
            required_non_blank_text(arguments, "expectedGraphHash")?;
            required_non_blank_text(arguments, "expectedSourceFingerprint")?;
        }
        if let Some(hash) = arguments.string("expectedGraphHash") {
            if !is_prefixed_hex(&hash, "project-graph-v1:", 8) {
                return Err(invalid(
                    "expectedGraphHash must be a project-graph-v1 hash.",
                ));
            }
        }
        if !arguments
            .string("reviewRevision")
            .is_some_and(|revision| is_prefixed_hex(&revision, "sha256:", 64))
        {
            return Err(invalid("reviewRevision must be a sha256 digest."));
        }
        if let Some(fingerprint) = arguments.string("expectedSourceFingerprint") {
            if answer_format::utf16::len(&fingerprint) > 200 {
                return Err(invalid(
                    "expectedSourceFingerprint must contain at most 200 characters.",
                ));
            }
        }
        if let Some(cursor) = cursor {
            if answer_format::utf16::len(&cursor) > 4096 {
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
    }
    Ok(operation)
}

fn request_of(arguments: &Arguments) -> Result<QueryRequest, ToolError> {
    let direction =
        optional_one_of(arguments, "direction", &Direction::ALLOWED)?.and_then(Direction::parse);
    let whole = |name: &str, max: Option<f64>| -> Result<Option<usize>, ToolError> {
        Ok(optional_non_negative_integer(arguments, name, max)?.map(count))
    };
    let positive = |name: &str, max: Option<f64>| -> Result<Option<usize>, ToolError> {
        Ok(optional_positive_integer(arguments, name, max)?.map(count))
    };
    Ok(QueryRequest {
        slug: optional_non_blank_text(arguments, "slug")?,
        seed: optional_non_blank_text(arguments, "seed")?,
        from: optional_non_blank_text(arguments, "from")?,
        to: optional_non_blank_text(arguments, "to")?,
        limit: positive("limit", Some(PAGE_MAX))?,
        node_limit: positive("nodeLimit", Some(PAGE_MAX))?,
        iterations: positive("iterations", Some(100.0))?,
        max_hops: whole("maxHops", Some(20.0))?,
        depth: whole("depth", Some(20.0))?,
        search_budget: positive("searchBudget", Some(50_000.0))?,
        direction,
        types: optional_text_list(arguments, "types", RELATION_TYPE_VALUES.len())?,
        include_isolated: optional_boolean(arguments, "includeIsolated")?,
        include_external: optional_boolean(arguments, "includeExternal")?,
        include_unresolved: optional_boolean(arguments, "includeUnresolved")?,
    })
}

fn refusal(error: QueryError) -> ToolError {
    match error {
        QueryError::Invalid(message) => ToolError::invalid(message),
        QueryError::Failed(message) => ToolError::failed(message),
        missing @ QueryError::UnknownNode { .. } => {
            let message = missing.to_string();
            let QueryError::UnknownNode {
                field,
                name,
                similar,
            } = missing
            else {
                return ToolError::failed(message);
            };
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
    let operation = check_arguments(arguments)?;
    let request = request_of(arguments)?;
    if !ontology_graph::ANSWERED_OPERATIONS.contains(&operation.as_str()) {
        return Err(ToolError::failed(format!(
            "The query_ontology operation \"{operation}\" is not answered by this server yet."
        )));
    }
    let graph = read_graph(context)?;
    let answer = ontology_graph::run_query(&graph, &operation, &request).map_err(refusal)?;
    ToolOutput::json(&answer)
}
