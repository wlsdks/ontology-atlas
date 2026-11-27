//! `pattern_walk`: the simple paths that follow a list of relations one step each, such as
//! `depends_on` then `contains`. The walk grows one layer per relation and keeps the first `limit`
//! paths of each layer in the order of their nodes, so what it keeps never depends on the order
//! it found them in.

use std::collections::HashSet;

use serde::Serialize;

use super::graph_walk::traversal_steps;
use super::hop::{path_edges, Hop};
use super::row_page::RowPage;
use crate::compiled_graph::{CompiledGraph, EdgeId, NodeId};
use crate::query::edge_rows::PathEdge;
use crate::query::node_resolution::resolve;
use crate::query::node_summary::{summaries, NodeSummary};
use crate::query::query_error::QueryError;
use crate::query::relation_set::RelationSet;
use crate::query::request::{Direction, QueryRequest};

const DEFAULT_LIMIT: usize = 100;
/// The relations of a pattern a walk takes; the rest are not read.
const MAX_STEPS: usize = 20;
/// The edges one walk may look at in all. A walk that runs out says it was limited.
const SCAN_BUDGET: usize = 1_000_000;

#[derive(Serialize)]
struct PatternSummary {
    steps: usize,
    #[serde(rename = "matchedPaths")]
    matched_paths: usize,
    #[serde(rename = "endNodes")]
    end_nodes: usize,
    #[serde(rename = "traversedEdges")]
    traversed_edges: usize,
}

#[derive(Serialize)]
struct PatternLayer<'a> {
    step: usize,
    relation: &'static str,
    #[serde(rename = "totalPaths")]
    total_paths: usize,
    #[serde(rename = "totalNodes")]
    total_nodes: usize,
    nodes: Vec<NodeSummary<'a>>,
}

#[derive(Serialize)]
struct MatchedPath<'a> {
    end: &'a str,
    node: NodeSummary<'a>,
    path: Vec<&'a str>,
    edges: Vec<PathEdge<'a>>,
}

#[derive(Serialize)]
struct EdgeList<'a> {
    total: usize,
    rows: Vec<PathEdge<'a>>,
}

#[derive(Serialize)]
pub struct PatternWalkAnswer<'a> {
    operation: &'static str,
    start: &'a str,
    node: NodeSummary<'a>,
    direction: Direction,
    pattern: Vec<&'static str>,
    summary: PatternSummary,
    layers: Vec<PatternLayer<'a>>,
    #[serde(rename = "endNodes")]
    end_nodes: Vec<NodeSummary<'a>>,
    paths: RowPage<MatchedPath<'a>>,
    edges: EdgeList<'a>,
}

struct Walk {
    nodes: Vec<NodeId>,
    hops: Vec<Hop>,
}

impl Walk {
    fn end(&self, start: NodeId) -> NodeId {
        self.nodes.last().copied().unwrap_or(start)
    }
}

/// The relations of the call's `pattern`, by the name edges carry, each checked in order.
fn read_pattern(request: &QueryRequest) -> Result<Vec<(&'static str, RelationSet)>, QueryError> {
    let items = request.pattern.as_deref().unwrap_or_default();
    if items.is_empty() {
        return Err(QueryError::Invalid(
            "pattern (non-empty string array) is required for pattern_walk.".to_string(),
        ));
    }
    let mut relations = Vec::with_capacity(items.len().min(MAX_STEPS));
    for item in items {
        let Some(set) = RelationSet::parse(Some(std::slice::from_ref(item)), "pattern")? else {
            continue;
        };
        if let Some(name) = set.sorted_names().first().copied() {
            relations.push((name, set));
        }
    }
    relations.truncate(MAX_STEPS);
    Ok(relations)
}

pub fn pattern_walk<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<PatternWalkAnswer<'a>, QueryError> {
    let start = resolve(graph, request.slug.as_deref(), "slug")?;
    let pattern = read_pattern(request)?;
    let direction = request.direction.unwrap_or(Direction::Outgoing);
    let limit = request.limit.unwrap_or(DEFAULT_LIMIT);

    let mut paths = vec![Walk {
        nodes: vec![start],
        hops: Vec::new(),
    }];
    let mut layers: Vec<PatternLayer<'a>> = Vec::new();
    let mut limited = false;
    let mut last_total = paths.len();
    let mut scanned = 0_usize;
    for (index, (relation, set)) in pattern.iter().enumerate() {
        let mut next_paths: Vec<Walk> = Vec::new();
        'layer: for walk in &paths {
            let at = walk.end(start);
            for step in traversal_steps(graph, at, direction, Some(set)) {
                scanned += 1;
                if scanned > SCAN_BUDGET {
                    limited = true;
                    break 'layer;
                }
                if walk.nodes.contains(&step.next) {
                    continue;
                }
                let mut nodes = walk.nodes.clone();
                nodes.push(step.next);
                let mut hops = walk.hops.clone();
                hops.push(Hop {
                    edge: step.edge,
                    entered: at,
                    left: step.next,
                });
                next_paths.push(Walk { nodes, hops });
                if next_paths.len() > limit {
                    limited = true;
                    break 'layer;
                }
            }
        }
        last_total = next_paths.len();
        next_paths.truncate(limit);
        let mut ends: Vec<NodeId> = next_paths.iter().map(|walk| walk.end(start)).collect();
        ends.sort_unstable();
        ends.dedup();
        layers.push(PatternLayer {
            step: index + 1,
            relation,
            total_paths: next_paths.len(),
            total_nodes: ends.len(),
            nodes: summaries(graph, ends),
        });
        paths = next_paths;
    }

    let mut end_nodes: Vec<NodeId> = paths.iter().map(|walk| walk.end(start)).collect();
    end_nodes.sort_unstable();
    end_nodes.dedup();
    let edges =
        distinct_hops_in_graph_order(paths.iter().flat_map(|walk| walk.hops.iter().copied()));
    Ok(PatternWalkAnswer {
        operation: "pattern_walk",
        start: graph.node(start).slug(),
        node: NodeSummary::of(graph, start),
        direction,
        pattern: pattern.iter().map(|(relation, _)| *relation).collect(),
        summary: PatternSummary {
            steps: pattern.len(),
            matched_paths: paths.len(),
            end_nodes: end_nodes.len(),
            traversed_edges: edges.len(),
        },
        layers,
        end_nodes: summaries(graph, end_nodes),
        // A layer that was cut hides paths the later layers would have grown, so `total` counts
        // the paths found in the last layer and `limited` says that more may exist.
        paths: RowPage::counted(
            last_total,
            limit,
            limited,
            paths
                .iter()
                .map(|walk| MatchedPath {
                    end: graph.node(walk.end(start)).slug(),
                    node: NodeSummary::of(graph, walk.end(start)),
                    path: walk
                        .nodes
                        .iter()
                        .map(|node| graph.node(*node).slug())
                        .collect(),
                    edges: path_edges(graph, walk.hops.iter().copied()),
                })
                .collect(),
        ),
        edges: EdgeList {
            total: edges.len(),
            rows: path_edges(graph, edges),
        },
    })
}

/// Each hop once, however many paths took it, in the order of the graph's edges.
fn distinct_hops_in_graph_order(hops: impl Iterator<Item = Hop>) -> Vec<Hop> {
    let mut seen: HashSet<(EdgeId, NodeId, NodeId)> = HashSet::new();
    let mut distinct: Vec<Hop> = hops
        .filter(|hop| seen.insert((hop.edge, hop.entered, hop.left)))
        .collect();
    distinct.sort_by_key(|hop| hop.edge);
    distinct
}
