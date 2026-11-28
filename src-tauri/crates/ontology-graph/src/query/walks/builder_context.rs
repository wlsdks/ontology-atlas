//! `builder_context`: what the workbench shows around a focused node, as the files hold it, so an
//! agent can write what the workbench would. Unsaved drafts are not in the files and are not here.

use serde::Serialize;

use super::builder_focus::{encode_uri_component, focus_param};
use super::subgraph::Subgraph;
use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::edge_rows::PathEdge;
use crate::query::node_summary::NodeSummary;
use crate::query::operation_defaults::BUILDER_CONTEXT;
use crate::query::query_error::QueryError;
use crate::query::request::{Direction, QueryRequest};

#[derive(Serialize)]
struct Builder {
    /// App-relative and without a locale: the caller adds the workbench origin, the locale prefix
    /// and the base path.
    href: String,
    #[serde(rename = "focusParam")]
    focus_param: String,
    #[serde(rename = "unsavedDraftsIncluded")]
    unsaved_drafts_included: bool,
}

#[derive(Serialize)]
struct CanvasPosition {
    x: f64,
    y: f64,
}

#[derive(Serialize)]
struct BuilderNode<'a> {
    slug: &'a str,
    distance: usize,
    node: NodeSummary<'a>,
    #[serde(rename = "canvasPosition")]
    canvas_position: Option<CanvasPosition>,
    expected_mtime: f64,
}

#[derive(Serialize)]
struct AgentHandoff {
    #[serde(rename = "writeTools")]
    write_tools: [&'static str; 4],
    constraints: [&'static str; 4],
}

#[derive(Serialize)]
pub struct BuilderContextAnswer<'a> {
    operation: &'static str,
    source: &'static str,
    focus: &'a str,
    builder: Builder,
    direction: Direction,
    depth: usize,
    #[serde(rename = "totalNodes")]
    total_nodes: usize,
    #[serde(rename = "totalEdges")]
    total_edges: usize,
    limited: bool,
    nodes: Vec<BuilderNode<'a>>,
    edges: Vec<PathEdge<'a>>,
    #[serde(rename = "agentHandoff")]
    agent_handoff: AgentHandoff,
}

fn builder_node(graph: &CompiledGraph, node: NodeId, distance: usize) -> BuilderNode<'_> {
    let row = graph.node(node);
    BuilderNode {
        slug: row.slug(),
        distance,
        node: NodeSummary::of(graph, node),
        canvas_position: row.canvas_position().map(|(x, y)| CanvasPosition { x, y }),
        expected_mtime: row.mtime,
    }
}

pub fn builder_context<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<BuilderContextAnswer<'a>, QueryError> {
    let slice = Subgraph::of_call(graph, request, &BUILDER_CONTEXT)?;
    let focus = graph.node(slice.seed);
    let param = focus_param(focus);
    Ok(BuilderContextAnswer {
        operation: "builder_context",
        source: "persisted_vault",
        focus: focus.slug(),
        builder: Builder {
            href: format!("/topology/?p={}&workbench=edit", encode_uri_component(&param)),
            focus_param: param,
            unsaved_drafts_included: false,
        },
        direction: slice.direction,
        depth: slice.depth,
        total_nodes: slice.total_nodes,
        total_edges: slice.total_edges,
        limited: slice.limited,
        nodes: slice
            .nodes
            .iter()
            .map(|&(node, distance)| builder_node(graph, node, distance))
            .collect(),
        edges: slice.edge_rows(graph),
        agent_handoff: AgentHandoff {
            write_tools: ["add_concepts", "relation_check", "add_relations", "patch_concept"],
            constraints: [
                "Only persisted vault documents are visible; unsaved Workshop drafts must be saved before MCP can inspect them.",
                "Run relation_check before add_relations when introducing a new edge pattern.",
                "Use patch_concept with the row expected_mtime when changing canvasPosition or other existing frontmatter.",
                "Re-run builder_context after writes to verify the persisted graph and Workshop handoff.",
            ],
        },
    })
}
