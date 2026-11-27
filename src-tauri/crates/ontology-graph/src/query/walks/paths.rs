//! `path` and `all_paths`: how two nodes are connected. The shortest path is a breadth-first search
//! that keeps one predecessor per node; every path is a depth-first search over simple paths
//! that stops when its budget of expanded states is spent and says so.

use std::collections::{BTreeMap, HashSet};

use answer_format::collation::compare_text;
use serde::Serialize;

use indexmap::IndexMap;

use super::graph_walk::traversal_steps;
use super::hop::{path_edges, Hop};
use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::edge_rows::PathEdge;
use crate::query::name_counts::sorted_counts;
use crate::query::node_resolution::resolve;
use crate::query::node_summary::{summaries, NodeSummary};
use crate::query::query_error::QueryError;
use crate::query::relation_set::RelationSet;
use crate::query::request::{Direction, QueryRequest};

const DEFAULT_MAX_HOPS: usize = 5;
const DEFAULT_ALL_PATHS_LIMIT: usize = 25;
const DEFAULT_SEARCH_BUDGET: usize = 5000;

#[derive(Serialize)]
#[serde(untagged)]
pub enum PathAnswer<'a> {
    Found(PathFound<'a>),
    Missing(PathMissing<'a>),
}

#[derive(Serialize)]
pub struct PathFound<'a> {
    operation: &'static str,
    from: &'a str,
    to: &'a str,
    found: bool,
    #[serde(rename = "hopCount")]
    hop_count: usize,
    hops: Vec<&'a str>,
    nodes: Vec<NodeSummary<'a>>,
    edges: Vec<PathEdge<'a>>,
}

#[derive(Serialize)]
pub struct PathMissing<'a> {
    operation: &'static str,
    from: &'a str,
    to: &'a str,
    found: bool,
    #[serde(rename = "maxHops")]
    max_hops: usize,
    hops: [&'a str; 0],
    nodes: [&'a str; 0],
    edges: [&'a str; 0],
}

struct Visit {
    node: NodeId,
    depth: usize,
    parent: Option<usize>,
    via: Option<Hop>,
}

/// The fewest-hop path between two resolved nodes, as the pieces of a path.
pub(crate) struct ShortestPath {
    pub hops: Vec<NodeId>,
    pub edges: Vec<Hop>,
}

/// Breadth-first search from `from` to `to` within `max_hops`.
pub(crate) fn shortest_path(
    graph: &CompiledGraph,
    from: NodeId,
    to: NodeId,
    max_hops: usize,
    direction: Direction,
    types: Option<&RelationSet>,
) -> Option<ShortestPath> {
    if from == to {
        return Some(ShortestPath {
            hops: vec![from],
            edges: Vec::new(),
        });
    }
    let mut visited = vec![false; graph.nodes().len()];
    if let Some(slot) = visited.get_mut(from.index()) {
        *slot = true;
    }
    let mut queue = vec![Visit {
        node: from,
        depth: 0,
        parent: None,
        via: None,
    }];
    let mut head = 0;
    while let Some(current) = queue.get(head) {
        let current_index = head;
        head += 1;
        if current.depth >= max_hops {
            continue;
        }
        let (current_node, current_depth) = (current.node, current.depth);
        for step in traversal_steps(graph, current_node, direction, types) {
            if visited.get(step.next.index()).copied().unwrap_or(true) {
                continue;
            }
            if step.next == to {
                let mut hops = vec![to];
                let mut edges = vec![Hop {
                    edge: step.edge,
                    entered: current_node,
                    left: to,
                }];
                let mut at = current_index;
                while let Some(visit) = queue.get(at) {
                    let Some(parent) = visit.parent else { break };
                    hops.push(visit.node);
                    if let Some(via) = visit.via {
                        edges.push(via);
                    }
                    at = parent;
                }
                hops.push(from);
                hops.reverse();
                edges.reverse();
                return Some(ShortestPath { hops, edges });
            }
            if let Some(slot) = visited.get_mut(step.next.index()) {
                *slot = true;
            }
            queue.push(Visit {
                node: step.next,
                depth: current_depth + 1,
                parent: Some(current_index),
                via: Some(Hop {
                    edge: step.edge,
                    entered: current_node,
                    left: step.next,
                }),
            });
        }
    }
    None
}

pub fn path<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<PathAnswer<'a>, QueryError> {
    let from = resolve(graph, request.from.as_deref(), "from")?;
    let to = resolve(graph, request.to.as_deref(), "to")?;
    let max_hops = request.max_hops.unwrap_or(DEFAULT_MAX_HOPS);
    let direction = Direction::for_paths(request.direction);
    let types = RelationSet::parse(request.types.as_deref(), "types")?;
    let from_slug = graph.node(from).slug();
    let to_slug = graph.node(to).slug();
    Ok(
        match shortest_path(graph, from, to, max_hops, direction, types.as_ref()) {
            Some(found) => PathAnswer::Found(PathFound {
                operation: "path",
                from: from_slug,
                to: to_slug,
                found: true,
                hop_count: found.hops.len() - 1,
                hops: found
                    .hops
                    .iter()
                    .map(|node| graph.node(*node).slug())
                    .collect(),
                nodes: summaries(graph, found.hops.iter().copied()),
                edges: path_edges(graph, found.edges.iter().copied()),
            }),
            None => PathAnswer::Missing(PathMissing {
                operation: "path",
                from: from_slug,
                to: to_slug,
                found: false,
                max_hops,
                hops: [],
                nodes: [],
                edges: [],
            }),
        },
    )
}

/// The question an `all_paths` answer repeats, so a follow-up query can be made from it.
#[derive(Serialize, Clone)]
struct BaseQuery<'a> {
    from: &'a str,
    to: &'a str,
    direction: Direction,
    #[serde(rename = "maxHops")]
    max_hops: usize,
    limit: usize,
    #[serde(rename = "searchBudget")]
    search_budget: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    types: Option<Vec<&'static str>>,
}

#[derive(Serialize)]
struct FollowUp<'a> {
    operation: &'static str,
    #[serde(rename = "targetOperation", skip_serializing_if = "Option::is_none")]
    target_operation: Option<&'static str>,
    #[serde(flatten)]
    query: BaseQuery<'a>,
}

#[derive(Serialize)]
struct PathEvidence<'a> {
    status: &'static str,
    reason: &'static str,
    #[serde(rename = "totalPathsExact")]
    total_paths_exact: bool,
    #[serde(rename = "pathsComplete")]
    paths_complete: bool,
    #[serde(rename = "nextStep")]
    next_step: &'static str,
    recommendation: &'static str,
    #[serde(rename = "suggestedQuery")]
    suggested_query: FollowUp<'a>,
    #[serde(rename = "saferQuery", skip_serializing_if = "Option::is_none")]
    safer_query: Option<FollowUp<'a>>,
}

#[derive(Serialize)]
struct PathRow<'a> {
    #[serde(rename = "hopCount")]
    hop_count: usize,
    hops: Vec<&'a str>,
    nodes: Vec<NodeSummary<'a>>,
    edges: Vec<PathEdge<'a>>,
    #[serde(rename = "byRelation")]
    by_relation: IndexMap<String, usize>,
}

#[derive(Serialize)]
pub struct AllPathsAnswer<'a> {
    operation: &'static str,
    from: &'a str,
    to: &'a str,
    found: bool,
    direction: Direction,
    #[serde(rename = "maxHops")]
    max_hops: usize,
    limit: usize,
    #[serde(rename = "searchBudget")]
    search_budget: usize,
    #[serde(rename = "expandedStates")]
    expanded_states: usize,
    exhaustive: bool,
    #[serde(rename = "truncatedByBudget")]
    truncated_by_budget: bool,
    #[serde(rename = "totalPaths")]
    total_paths: usize,
    #[serde(rename = "totalPathsExact")]
    total_paths_exact: bool,
    limited: bool,
    #[serde(rename = "shortestHopCount")]
    shortest_hop_count: Option<usize>,
    #[serde(rename = "byLength")]
    by_length: IndexMap<String, usize>,
    evidence: PathEvidence<'a>,
    paths: Vec<PathRow<'a>>,
}

struct Walk {
    node: NodeId,
    hops: Vec<NodeId>,
    edges: Vec<Hop>,
}

pub fn all_paths<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<AllPathsAnswer<'a>, QueryError> {
    let from = resolve(graph, request.from.as_deref(), "from")?;
    let to = resolve(graph, request.to.as_deref(), "to")?;
    let max_hops = request.max_hops.unwrap_or(DEFAULT_MAX_HOPS);
    let direction = Direction::for_paths(request.direction);
    let limit = request.limit.unwrap_or(DEFAULT_ALL_PATHS_LIMIT);
    let search_budget = request.search_budget(DEFAULT_SEARCH_BUDGET)?;
    let types = RelationSet::parse(request.types.as_deref(), "types")?;

    let mut matches: Vec<Walk> = Vec::new();
    let mut expanded_states = 0_usize;
    let mut truncated_by_budget = false;
    let mut stack = vec![Walk {
        node: from,
        hops: vec![from],
        edges: Vec::new(),
    }];
    while let Some(current) = stack.pop() {
        if expanded_states >= search_budget {
            truncated_by_budget = true;
            break;
        }
        expanded_states += 1;
        if current.node == to {
            matches.push(current);
            continue;
        }
        if current.hops.len() > max_hops {
            continue;
        }
        let mut candidates = traversal_steps(graph, current.node, direction, types.as_ref());
        candidates.reverse();
        for step in candidates {
            if current.hops.contains(&step.next) {
                continue;
            }
            let mut hops = current.hops.clone();
            hops.push(step.next);
            let mut edges = current.edges.clone();
            edges.push(Hop {
                edge: step.edge,
                entered: current.node,
                left: step.next,
            });
            stack.push(Walk {
                node: step.next,
                hops,
                edges,
            });
        }
    }

    // One row per walk of the same nodes by the same relations.
    let mut seen: HashSet<(Vec<NodeId>, Vec<&'static str>)> = HashSet::new();
    let mut unique: Vec<Walk> = Vec::new();
    for walk in matches {
        let relations: Vec<&'static str> = walk
            .edges
            .iter()
            .map(|hop| graph.edge(hop.edge).via)
            .collect();
        if seen.insert((walk.hops.clone(), relations)) {
            unique.push(walk);
        }
    }
    let hops_key = |walk: &Walk| {
        walk.hops
            .iter()
            .map(|node| graph.node(*node).slug())
            .collect::<Vec<_>>()
            .join("\0")
    };
    let mut keyed: Vec<(String, Walk)> = unique
        .into_iter()
        .map(|walk| (hops_key(&walk), walk))
        .collect();
    keyed.sort_by(|left, right| {
        left.1
            .hops
            .len()
            .cmp(&right.1.hops.len())
            .then_with(|| compare_text(&left.0, &right.0))
    });
    let total = keyed.len();
    let mut lengths: BTreeMap<usize, usize> = BTreeMap::new();
    for (_, walk) in &keyed {
        *lengths.entry(walk.hops.len() - 1).or_insert(0) += 1;
    }
    let length_counts: IndexMap<String, usize> = lengths
        .into_iter()
        .map(|(length, count)| (length.to_string(), count))
        .collect();
    let shortest_hop_count = keyed.first().map(|(_, walk)| walk.hops.len() - 1);
    let paths: Vec<PathRow<'a>> = keyed
        .iter()
        .take(limit)
        .map(|(_, walk)| PathRow {
            hop_count: walk.hops.len() - 1,
            hops: walk
                .hops
                .iter()
                .map(|node| graph.node(*node).slug())
                .collect(),
            nodes: summaries(graph, walk.hops.iter().copied()),
            edges: path_edges(graph, walk.edges.iter().copied()),
            by_relation: sorted_counts(walk.edges.iter().map(|hop| graph.edge(hop.edge).via)),
        })
        .collect();

    let paths_complete = !truncated_by_budget && total <= limit;
    let base = BaseQuery {
        from: graph.node(from).slug(),
        to: graph.node(to).slug(),
        direction,
        max_hops,
        limit,
        search_budget,
        types: types.as_ref().map(RelationSet::sorted_names),
    };
    let evidence = PathEvidence {
        status: if paths_complete {
            "complete"
        } else {
            "partial"
        },
        reason: if truncated_by_budget {
            "search_budget"
        } else if total > limit {
            "limit"
        } else {
            "complete"
        },
        total_paths_exact: !truncated_by_budget,
        paths_complete,
        next_step: if paths_complete { "use" } else { "narrow" },
        recommendation: if paths_complete {
            "Safe to treat paths and totalPaths as complete for the requested bounds."
        } else if truncated_by_budget {
            "Treat returned paths as partial evidence; reduce maxHops, add relation types, or raise searchBudget before relying on missing-path absence."
        } else {
            "totalPaths is exact, but paths is truncated by limit; raise limit or narrow maxHops/types before comparing every path."
        },
        suggested_query: if paths_complete {
            FollowUp {
                operation: "all_paths",
                target_operation: None,
                query: base.clone(),
            }
        } else {
            FollowUp {
                operation: "query_plan",
                target_operation: Some("all_paths"),
                query: base.clone(),
            }
        },
        safer_query: (!paths_complete).then(|| FollowUp {
            operation: "all_paths",
            target_operation: None,
            query: BaseQuery {
                max_hops: if max_hops > 1 { max_hops - 1 } else { max_hops },
                limit: limit.min(10),
                search_budget: search_budget.min(1000),
                ..base.clone()
            },
        }),
    };
    Ok(AllPathsAnswer {
        operation: "all_paths",
        from: graph.node(from).slug(),
        to: graph.node(to).slug(),
        found: total > 0,
        direction,
        max_hops,
        limit,
        search_budget,
        expanded_states,
        exhaustive: !truncated_by_budget,
        truncated_by_budget,
        total_paths: total,
        total_paths_exact: !truncated_by_budget,
        limited: total > limit || truncated_by_budget,
        shortest_hop_count,
        by_length: length_counts,
        evidence,
        paths,
    })
}
