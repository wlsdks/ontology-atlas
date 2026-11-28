//! `agent_brief`: what an agent that has just connected needs before it edits: whether the project
//! is ready to build on, the nodes to start from, the first calls to make, and the checks to run
//! before a write. It is the counts of `workspace_brief`, the most connected nodes, and calls
//! written out with the arguments that fit this graph.
//!
//! The answer is about one project: the tool layer compiles only what that project holds
//! (`project_holdings`) and puts this operation to that graph. The project's source connection and
//! its meaning assessment belong to the project-source tools and are not part of this answer.

use std::borrow::Cow;
use std::collections::HashSet;

use indexmap::IndexMap;
use serde::Serialize;
use vault_document::frontmatter::Value;

use super::graph_summary::top_hub_ids;
use super::workspace_brief::{
    workspace_brief_of, BriefHealth, BriefSummary, NextAction, ProjectMaps,
};
use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::operation_defaults::AGENT_BRIEF_LIMIT;
use crate::query::project_root::{project_named_or_only, project_roots};
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;
use crate::query::scope::Scope;

const MEANINGFUL_KINDS: [&str; 3] = ["domain", "capability", "element"];
const NO_PROJECT: &str = "<project-slug>";
const NO_SLUG: &str = "<slug>";
const NO_OTHER_SLUG: &str = "<other-slug>";
/// The relations a first relation check looks for a neighbour along.
const DEPENDENCY_RELATIONS: [&str; 3] = ["dependencies", "depends_on", "relates"];

const WORKFLOW_GUIDE_PATH: &str = "docs/AGENT-GRAPH-WORKFLOW.md";

const MCP_UNAVAILABLE_GUIDANCE: &str = "read the vault's Markdown files directly, write nothing to the vault, and tell the person the Atlas connection is missing; the app's Connect a coding agent dialog restores it.";

/// The slugs of the nodes `project` holds, as the project the brief is about: the one a call
/// named, else the only one, or none when the vault has no project node.
pub struct ProjectHoldings {
    pub project: String,
    holds: HashSet<String>,
}

impl ProjectHoldings {
    pub fn holds(&self, slug: &str) -> bool {
        self.holds.contains(slug)
    }

    pub fn node_count(&self) -> usize {
        self.holds.len()
    }
}

/// The project an `agent_brief` is about and what it holds. `None` when the vault has no project
/// node: the brief then covers the whole vault under a placeholder name.
pub fn project_holdings(
    graph: &CompiledGraph,
    named: Option<&str>,
) -> Result<Option<ProjectHoldings>, QueryError> {
    let project = match named.filter(|name| !answer_format::whitespace::trim(name).is_empty()) {
        Some(name) => project_named_or_only(graph, Some(name), "project_scope")?,
        None => {
            let roots = project_roots(graph);
            match roots.as_slice() {
                [] => return Ok(None),
                [only] => *only,
                many => {
                    let names: Vec<&str> =
                        many.iter().map(|&root| graph.node(root).slug()).collect();
                    return Err(QueryError::Invalid(format!(
                        "project is required when the vault contains multiple project nodes. Choose one of: {}.",
                        names.join(", ")
                    )));
                }
            }
        }
    };
    let scope = Scope::of(graph, project);
    Ok(Some(ProjectHoldings {
        project: graph.node(project).slug().to_string(),
        holds: scope
            .nodes
            .iter()
            .map(|&node| graph.node(node).slug().to_string())
            .collect(),
    }))
}

/// An argument of a call the brief proposes: a name or a count.
#[derive(Serialize, Clone, Copy)]
#[serde(untagged)]
enum Argument<'a> {
    Text(&'a str),
    Count(usize),
}

impl<'a> From<&'a str> for Argument<'a> {
    fn from(text: &'a str) -> Self {
        Self::Text(text)
    }
}

impl From<usize> for Argument<'_> {
    fn from(count: usize) -> Self {
        Self::Count(count)
    }
}

#[derive(Serialize)]
struct ToolCall<'a> {
    tool: &'static str,
    arguments: IndexMap<&'static str, Argument<'a>>,
}

impl<'a> ToolCall<'a> {
    fn new(tool: &'static str) -> Self {
        Self {
            tool,
            arguments: IndexMap::new(),
        }
    }

    fn with(mut self, name: &'static str, value: impl Into<Argument<'a>>) -> Self {
        self.arguments.insert(name, value.into());
        self
    }

    fn query(operation: &'static str) -> Self {
        Self::new("query_ontology").with("operation", operation)
    }

    /// The call as the handoff prompt prints it: the tool and its arguments in one line.
    fn line(&self) -> String {
        let arguments = answer_format::json::to_string(&self.arguments).unwrap_or_default();
        format!("{} {arguments}", self.tool)
    }
}

#[derive(Serialize)]
struct Guardrail<'a> {
    id: &'static str,
    goal: &'static str,
    calls: Vec<ToolCall<'a>>,
}

#[derive(Serialize)]
struct Readiness {
    status: &'static str,
    score: u32,
    #[serde(rename = "meaningfulNodes")]
    meaningful_nodes: usize,
    #[serde(rename = "relationCount")]
    relation_count: usize,
    projects: usize,
    domains: usize,
    capabilities: usize,
    elements: usize,
    #[serde(rename = "unresolvedEdges")]
    unresolved_edges: usize,
    #[serde(rename = "externalEdges")]
    external_edges: usize,
    #[serde(rename = "growthActions")]
    growth_actions: usize,
    #[serde(rename = "healthChecks")]
    health_checks: usize,
}

#[derive(Serialize)]
struct Entrypoint<'a> {
    uid: &'a str,
    slug: &'a str,
    title: Cow<'a, Value>,
    kind: &'a str,
    degree: u32,
    #[serde(rename = "inDegree")]
    in_degree: u32,
    #[serde(rename = "outDegree")]
    out_degree: u32,
}

#[derive(Serialize)]
struct WorkflowGuide {
    path: &'static str,
    title: &'static str,
    description: &'static str,
}

#[derive(Serialize)]
struct BriefDocs {
    #[serde(rename = "workflowGuide")]
    workflow_guide: WorkflowGuide,
}

#[derive(Serialize)]
pub struct AgentBriefAnswer<'a> {
    operation: &'static str,
    #[serde(rename = "sideEffect")]
    side_effect: bool,
    #[serde(rename = "projectUid", skip_serializing_if = "Option::is_none")]
    project_uid: Option<&'a str>,
    #[serde(rename = "projectSlug")]
    project_slug: String,
    status: &'static str,
    readiness: Readiness,
    graph: BriefSummary<'a>,
    health: BriefHealth,
    #[serde(rename = "nextActions")]
    next_actions: Vec<NextAction<'a>>,
    entrypoints: Vec<Entrypoint<'a>>,
    #[serde(rename = "firstCalls")]
    first_calls: Vec<ToolCall<'a>>,
    #[serde(rename = "writeGuardrails")]
    write_guardrails: Vec<Guardrail<'a>>,
    docs: BriefDocs,
    #[serde(rename = "handoffPrompt")]
    handoff_prompt: String,
}

/// The neighbour a first relation check proposes an edge to: the node the entry point already
/// depends on or relates to, else one that does so to it.
fn path_target(graph: &CompiledGraph, entry: NodeId) -> Option<&str> {
    let entry_slug = graph.node(entry).slug();
    let is_dependency = |via: &str| DEPENDENCY_RELATIONS.contains(&via);
    let leaving = graph.edge_ids().find_map(|id| {
        let edge = graph.edge(id);
        let to = match edge.to() {
            Some(node) => graph.node(node).slug(),
            None => edge.reference.as_str(),
        };
        (edge.from == entry && is_dependency(edge.via) && to != entry_slug).then_some(to)
    });
    leaving.or_else(|| {
        graph.edge_ids().find_map(|id| {
            let edge = graph.edge(id);
            (edge.to() == Some(entry) && is_dependency(edge.via) && edge.from != entry)
                .then(|| graph.node(edge.from).slug())
        })
    })
}

struct Readings {
    meaningful: usize,
    relations: usize,
    has_hubs: bool,
}

/// The score the readiness reports: 30 for a map with at least three meaningful nodes, 25 for
/// relations that connect them, 25 for a graph that is healthy, 20 for a node to start from.
fn readiness_score(readings: &Readings, healthy: bool) -> (u32, bool, bool) {
    let shaped = readings.meaningful >= 3;
    let linked = readings.relations >= readings.meaningful.saturating_sub(1).max(1);
    let score = u32::from(shaped) * 30
        + u32::from(linked) * 25
        + u32::from(healthy) * 25
        + u32::from(readings.has_hubs) * 20;
    (score, shaped, linked)
}

fn handoff_prompt(
    readiness: &Readiness,
    graph: &BriefSummary<'_>,
    status: &str,
    first_calls: &[ToolCall<'_>],
) -> String {
    let calls: Vec<String> = first_calls
        .iter()
        .enumerate()
        .map(|(index, call)| format!("{}. {}", index + 1, call.line()))
        .collect();
    [
        "Use the ontology-atlas MCP server as the shared codebase graph memory before editing.".to_string(),
        "uid is the permanent identity of a node and slug its current address; graph relations and graph-operation inputs stay slug-based.".to_string(),
        format!(
            "Current readiness: {} {}/100; graph {} nodes, {} edges; status {status}.",
            readiness.status,
            readiness.score,
            graph.node_count(),
            graph.edge_count()
        ),
        format!("When the ontology-atlas MCP server is unavailable: {MCP_UNAVAILABLE_GUIDANCE}"),
        String::new(),
        "Run these first-contact MCP calls in order (`entrypoints` lists the nodes to start from):".to_string(),
        calls.join("\n"),
        String::new(),
        "Treat Definition and Includes lists as bounded claims, not inventories: never say only, all, every or exactly unless the body cites a source-backed boundary, and keep a qualifier such as bounded packet or selected evidence inside the same claim.".to_string(),
        "Run relation_check before add_relations and find_backlinks before rename_concept or merge_concepts; writeGuardrails lists the calls. connection_info({guide:\"construction\"}) has the kind and relation rules and connection_info({guide:\"write_safety\"}) the write gates.".to_string(),
    ]
    .join("\n")
}

pub fn agent_brief<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<AgentBriefAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(AGENT_BRIEF_LIMIT);
    let workspace = workspace_brief_of(graph, request, limit, ProjectMaps::Left)?;
    let hubs = top_hub_ids(graph, limit);
    let top = hubs.first().copied();
    let second = hubs
        .iter()
        .copied()
        .find(|&hub| Some(hub) != top)
        .map(|hub| graph.node(hub).slug());
    let project_node = match request.project.as_deref() {
        Some(name) => {
            let node = project_named_or_only(graph, Some(name), "project_scope")?;
            if graph.node(node).kind() != "project" {
                return Err(QueryError::Invalid(format!(
                    "project must resolve to a project node. Received: \"{name}\"."
                )));
            }
            Some(node)
        }
        None => project_roots(graph).first().copied(),
    };
    let meaningful = graph
        .nodes()
        .iter()
        .filter(|node| MEANINGFUL_KINDS.contains(&node.kind()))
        .count();
    let readings = Readings {
        meaningful,
        relations: graph.edges().len(),
        has_hubs: !hubs.is_empty(),
    };
    let healthy = workspace.graph_status == "healthy";
    let (mut score, shaped, linked) = readiness_score(&readings, healthy);
    let mut readiness_status = if !shaped {
        "needs_shape"
    } else if !linked || !healthy {
        "needs_attention"
    } else {
        "ready"
    };
    if healthy && workspace.status != "healthy" {
        if readiness_status == "ready" {
            readiness_status = "needs_attention";
        }
        score = score.saturating_sub(25);
    }

    let impact_slug = top.map_or(NO_SLUG, |id| graph.node(id).slug());
    let target_slug = top
        .and_then(|id| path_target(graph, id))
        .or(second)
        .unwrap_or(NO_OTHER_SLUG);
    let profile_limit = limit.max(5);
    let relation_check = || {
        ToolCall::query("relation_check")
            .with("from", impact_slug)
            .with("to", target_slug)
            .with("type", "depends_on")
    };
    let first_calls = vec![
        ToolCall::query("workspace_brief").with("limit", limit),
        ToolCall::query("health").with("limit", limit),
        ToolCall::query("query_plan")
            .with("targetOperation", "blast_radius")
            .with("slug", impact_slug)
            .with("depth", 2),
        ToolCall::query("node_profile")
            .with("slug", impact_slug)
            .with("depth", 2)
            .with("limit", profile_limit),
        relation_check(),
    ];
    let write_guardrails = vec![
        Guardrail {
            id: "preflight_relation",
            goal: "Before add_relations, prove the target edge is not duplicated, inverted, or already explained by an existing path.",
            calls: vec![
                relation_check(),
                ToolCall::query("path")
                    .with("from", impact_slug)
                    .with("to", target_slug)
                    .with("maxHops", 5),
            ],
        },
        Guardrail {
            id: "preflight_rename",
            goal: "Before rename_concept or merge_concepts, inspect backlinks and local node context for the slug being rewritten.",
            calls: vec![
                ToolCall::new("find_backlinks").with("slug", impact_slug),
                ToolCall::query("node_profile")
                    .with("slug", impact_slug)
                    .with("depth", 1)
                    .with("limit", profile_limit),
            ],
        },
        Guardrail {
            id: "post_change_sync",
            goal: "After code changes or vault writes, gate the shared graph before handing work back to another agent.",
            calls: vec![
                ToolCall::query("health").with("limit", limit),
                ToolCall::query("cycles").with("maxHops", 8),
                ToolCall::query("growth_plan").with("limit", 20),
                ToolCall::query("maintenance_plan").with("limit", 20),
                ToolCall::new("validate_vault"),
            ],
        },
    ];

    let readiness = Readiness {
        status: readiness_status,
        score,
        meaningful_nodes: meaningful,
        relation_count: graph.edges().len(),
        projects: workspace.summary.project_count(),
        domains: workspace.summary.domain_count(),
        capabilities: workspace.summary.capability_count(),
        elements: workspace.summary.element_count(),
        unresolved_edges: workspace.summary.unresolved_count(),
        external_edges: workspace.summary.external_count(),
        growth_actions: workspace.summary.growth_action_count(),
        health_checks: workspace.health.checks.len(),
    };
    let prompt = handoff_prompt(
        &readiness,
        &workspace.summary,
        workspace.status,
        &first_calls,
    );
    let entrypoints = hubs
        .iter()
        .map(|&id| {
            let node = graph.node(id);
            Entrypoint {
                uid: node.uid(),
                slug: node.slug(),
                title: node.title(),
                kind: node.kind(),
                degree: node.degree(),
                in_degree: node.in_degree,
                out_degree: node.out_degree,
            }
        })
        .collect();
    Ok(AgentBriefAnswer {
        operation: "agent_brief",
        side_effect: false,
        project_uid: project_node.map(|id| graph.node(id).uid()),
        project_slug: project_node.map_or_else(
            || NO_PROJECT.to_string(),
            |id| graph.node(id).slug().to_string(),
        ),
        status: workspace.status,
        readiness,
        graph: workspace.summary,
        health: workspace.health,
        next_actions: workspace.next_actions,
        entrypoints,
        first_calls,
        write_guardrails,
        docs: BriefDocs {
            workflow_guide: WorkflowGuide {
                path: WORKFLOW_GUIDE_PATH,
                title: "Agent Graph Workflow",
                description: "MCP-connected use and verification checks.",
            },
        },
        handoff_prompt: prompt,
    })
}
