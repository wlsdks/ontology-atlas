//! What a call is told when it still sends an argument, a `query_ontology` operation or a
//! `connection_info` guide this server stopped accepting. The refusal names what replaced it, so an
//! agent whose notes predate the removal learns the current call from the answer instead of from a
//! bare "unknown argument". Each refusal is `invalid_arguments`, and each sentence is the one the
//! script server gives (`mcp/src/server/retired-arguments.mjs`); the differential corpus
//! (`graph/retired-query-operations`, `survey/analyze-repo-structure-retired-parts`,
//! `shell/connection-info-guides`) compares them byte for byte.

use crate::arguments::Arguments;
use crate::error::ToolError;

const ANALYSIS_ROUTE: &str = "view \"analysis\", proposal and qualification are retired: the structural analysis and the review of a proposal no longer exist. Call analyze_repo_structure for the breadth map, read the code with sourceReads, then write what you found with add_concepts and add_relations.";

const COMPACT_BRIEF: &str = "agent_brief detail \"compact\" and task are retired: the compact task handoff no longer exists. Call query_ontology({operation:\"agent_brief\", project}) for the brief, then get_concepts({slugs, body:\"full\"}) for the nodes it names.";

/// Arguments no longer in a tool's input schema, in the order they are looked for, with the
/// sentence an agent that sends one is told.
const RETIRED_ARGUMENTS: [(&str, &[(&str, &str)]); 2] = [
    (
        "analyze_repo_structure",
        &[
            ("view", ANALYSIS_ROUTE),
            ("proposal", ANALYSIS_ROUTE),
            ("qualification", ANALYSIS_ROUTE),
            (
                "maxDepth",
                "maxDepth is retired: the survey never used it. Send rootPath to survey one folder.",
            ),
        ],
    ),
    (
        "query_ontology",
        &[("detail", COMPACT_BRIEF), ("task", COMPACT_BRIEF)],
    ),
];

/// `query_ontology` operations no longer offered, each with the call that answers the same
/// question.
const RETIRED_QUERY_OPERATIONS: [(&str, &str); 8] = [
    (
        "all_paths",
        "path returns the shortest connection; reachability lists everything within a depth",
    ),
    (
        "centrality",
        "match_nodes with sort:\"degree\" ranks nodes by their connections",
    ),
    (
        "builder_context",
        "get_concepts({slugs, body:\"full\"}) for the node, then neighbors or subgraph for what surrounds it",
    ),
    (
        "match_edges",
        "neighbors lists a node's relations with the key each one is written under; relation_check judges one proposed relation",
    ),
    ("domain_profile", "node_profile with the domain's slug"),
    (
        "topological_order",
        "cycles reports dependency cycles; impact lists what depends on a node",
    ),
    (
        "meaning_repair_review",
        "validate_vault, then patch_concept on the nodes it names",
    ),
    (
        "analysis_history",
        "the app lists saved analyses; analysis_record reads one by its id",
    ),
];

/// `connection_info` guide topics no longer served, with where the text went.
const RETIRED_GUIDES: [(&str, &str); 1] = [(
    "competency",
    "The answer layout is the `answers` item schema of finalize_project_meaning in tools/list: one row per fixed question with id, status, answer and the witness lists the question names.",
)];

/// `null` is no value, and `detail: "full"` asks for what a brief is anyway.
fn is_absent_or_tolerated(name: &str, raw: &str) -> bool {
    raw == "null" || (name == "detail" && raw == "\"full\"")
}

/// The refusal for the first retired argument `arguments` sends with a value. An argument that
/// carries no value (`null`, or the `detail: "full"` a brief is anyway) is taken out, so it counts
/// as not sent and is not refused as unknown either.
pub fn refuse_retired_argument(
    tool_name: &str,
    arguments: &mut Arguments,
) -> Result<(), ToolError> {
    let Some((_, retired)) = RETIRED_ARGUMENTS
        .iter()
        .find(|(tool, _)| *tool == tool_name)
    else {
        return Ok(());
    };
    for (name, message) in *retired {
        let Some(raw) = arguments.get(name) else {
            continue;
        };
        if !is_absent_or_tolerated(name, raw.get().trim()) {
            return Err(ToolError::invalid(*message));
        }
    }
    for (name, _) in *retired {
        arguments.remove(name);
    }
    Ok(())
}

/// The refusal for a retired `query_ontology` operation.
pub fn refuse_retired_query_operation(operation: &str) -> Result<(), ToolError> {
    match RETIRED_QUERY_OPERATIONS
        .iter()
        .find(|(name, _)| *name == operation)
    {
        Some((_, replacement)) => Err(ToolError::invalid(format!(
            "query_ontology operation \"{operation}\" is retired. Use {replacement}."
        ))),
        None => Ok(()),
    }
}

/// The refusal for a retired `connection_info` guide topic.
pub fn refuse_retired_guide(guide: &str) -> Result<(), ToolError> {
    match RETIRED_GUIDES.iter().find(|(name, _)| *name == guide) {
        Some((_, moved)) => Err(ToolError::invalid(format!(
            "connection_info guide \"{guide}\" is retired. {moved}"
        ))),
        None => Ok(()),
    }
}
