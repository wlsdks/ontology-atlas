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

const DEGREE_FILTER: &str = "the degree filters are retired: match_nodes with sort:\"degree\" ranks nodes by their connections, and limit keeps the first rows.";

const NODE_LIMIT: &str = "nodeLimit is retired: limit sizes every section of the answer.";
const COMPONENT_LIMIT: &str = "componentLimit is retired: limit sizes every section of the answer.";
const CYCLE_LIMIT: &str = "cycleLimit is retired: limit sizes every section of the answer.";
const RECOMMENDATION_LIMIT: &str = "recommendationLimit is retired: limit sizes every section of the answer.";
const ORDER_LIMIT: &str = "orderLimit is retired: limit sizes every section of the answer.";

const DEPENDENCY_TYPES: &str = "dependencyTypes is retired: types scopes the component groups; cycles and the dependency order always follow the dependency relations.";
const COMPONENT_TYPES: &str = "componentTypes is retired: types scopes the component groups; cycles and the dependency order always follow the dependency relations.";

const FROM_KIND: &str = "fromKind is retired with match_edges: neighbors lists a node's relations with the key each one is written under.";
const TO_KIND: &str = "toKind is retired with match_edges: neighbors lists a node's relations with the key each one is written under.";

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
        &[
            ("detail", COMPACT_BRIEF),
            ("task", COMPACT_BRIEF),
            (
                "iterations",
                "iterations is retired with centrality: match_nodes with sort:\"degree\" ranks nodes by their connections.",
            ),
            ("nodeLimit", NODE_LIMIT),
            ("componentLimit", COMPONENT_LIMIT),
            ("cycleLimit", CYCLE_LIMIT),
            ("recommendationLimit", RECOMMENDATION_LIMIT),
            ("orderLimit", ORDER_LIMIT),
            ("minDegree", DEGREE_FILTER),
            ("maxDegree", DEGREE_FILTER),
            ("minInDegree", DEGREE_FILTER),
            ("minOutDegree", DEGREE_FILTER),
            (
                "slugContains",
                "slugContains is retired: list_concepts({mentions}) finds the nodes that name a word.",
            ),
            ("fromKind", FROM_KIND),
            ("toKind", TO_KIND),
            ("relation", "relation is retired: send the relation as type."),
            (
                "includeIsolated",
                "includeIsolated is retired with topological_order: health returns dependencyOrder, and unconnected nodes have no order.",
            ),
            ("dependencyTypes", DEPENDENCY_TYPES),
            ("componentTypes", COMPONENT_TYPES),
            ("seed", "seed is retired: send the node as slug."),
            (
                "analysisMode",
                "analysisMode is retired with analysis_history: the saved analyses are the files under .ontology-atlas/analyses/ in the vault.",
            ),
        ],
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
        "health: its dependencyOrder lists the nodes prerequisite first (rank, slug) and the nodes a cycle blocks; cycles reports the cycles; impact lists what depends on a node",
    ),
    (
        "meaning_repair_review",
        "validate_vault, then patch_concept on the nodes it names",
    ),
    (
        "analysis_history",
        "the saved analyses are the files in .ontology-atlas/analyses/ of the vault; the UUID that ends a file name is its recordId, and analysis_record({recordId}) reads that record",
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
