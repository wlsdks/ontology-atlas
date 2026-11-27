//! `cycles` and `topological_order`: whether dependencies loop, and in what order they can be
//! built. Both read the `dependencies` relation unless the call names others.
//!
//! The cycle search is Johnson's minimum-vertex rule: each simple cycle is found once, from its
//! lowest-ranked node, up to `maxHops` edges long. Its recursion is as deep as the path it is
//! extending, which `maxHops` caps at twenty, and the whole search spends a budget of expanded
//! states that it reports when it runs out. The order is Kahn's algorithm by layers over distinct
//! prerequisite pairs; it holds no recursion.

use std::collections::{HashMap, HashSet};

use answer_format::collation::compare_text;
use serde::Serialize;

use crate::compiled_graph::{CompiledGraph, EdgeId, NodeId};
use crate::query::query_error::QueryError;
use crate::query::relation_set::{allowed, RelationSet};
use crate::query::request::QueryRequest;
use crate::query::views::{summaries, CompiledEdge, NodeSummary};

const DEFAULT_CYCLE_LIMIT: usize = 20;
const DEFAULT_CYCLE_DEPTH: usize = 8;
const DEFAULT_SEARCH_BUDGET: usize = 5000;
const DEFAULT_ORDER_LIMIT: usize = 100;

fn dependency_types(request: &QueryRequest) -> Result<Option<RelationSet>, QueryError> {
    match &request.types {
        Some(_) => RelationSet::parse(request.types.as_deref(), "types"),
        None => Ok(Some(RelationSet::dependencies())),
    }
}

struct Cycle {
    nodes: Vec<NodeId>,
    edges: Vec<EdgeId>,
    key: String,
    sort_key: String,
}

/// The cycle rotated to start at its lowest slug, closed by repeating that slug.
fn normalized(graph: &CompiledGraph, nodes: &[NodeId], edges: &[EdgeId]) -> Cycle {
    let mut start = 0;
    for (index, node) in nodes.iter().enumerate().skip(1) {
        let lowest = nodes.get(start).copied().unwrap_or(*node);
        if compare_text(&graph.node(*node).slug, &graph.node(lowest).slug).is_lt() {
            start = index;
        }
    }
    let mut rotated: Vec<NodeId> = nodes.get(start..).unwrap_or_default().to_vec();
    rotated.extend_from_slice(nodes.get(..start).unwrap_or_default());
    let mut rotated_edges: Vec<EdgeId> = edges.get(start..).unwrap_or_default().to_vec();
    rotated_edges.extend_from_slice(edges.get(..start).unwrap_or_default());
    let slugs: Vec<&str> = rotated
        .iter()
        .map(|node| graph.node(*node).slug.as_str())
        .collect();
    let key = slugs.join("->");
    let mut closed = rotated;
    if let Some(first) = closed.first().copied() {
        closed.push(first);
    }
    let sort_key = closed
        .iter()
        .map(|node| graph.node(*node).slug.as_str())
        .collect::<Vec<_>>()
        .join("\0");
    Cycle {
        nodes: closed,
        edges: rotated_edges,
        key,
        sort_key,
    }
}

struct CycleSearch<'a> {
    graph: &'a CompiledGraph,
    rank: Vec<u32>,
    successors: HashMap<NodeId, Vec<EdgeId>>,
    max_depth: usize,
    limit: usize,
    search_budget: usize,
    path: Vec<NodeId>,
    edge_path: Vec<EdgeId>,
    shortest: Vec<Cycle>,
    longest_kept: usize,
    total: usize,
    expanded: usize,
    truncated: bool,
}

impl CycleSearch<'_> {
    fn expand(&mut self, start_rank: u32, current: NodeId) {
        if self.expanded >= self.search_budget {
            self.truncated = true;
            return;
        }
        self.expanded += 1;
        self.path.push(current);
        let edges = self.successors.get(&current).cloned().unwrap_or_default();
        for edge_id in edges {
            let Some(to) = self.graph.edge(edge_id).to() else {
                continue;
            };
            if self.path.first() == Some(&to) {
                self.record(edge_id);
            } else if self.path.len() < self.max_depth
                && self.rank.get(to.index()).copied().unwrap_or(0) > start_rank
                && !self.path.contains(&to)
            {
                self.edge_path.push(edge_id);
                self.expand(start_rank, to);
                self.edge_path.pop();
                if self.truncated {
                    break;
                }
            }
        }
        self.path.pop();
    }

    fn record(&mut self, closing: EdgeId) {
        self.total += 1;
        if self.path.len() > self.longest_kept {
            return;
        }
        let mut edges = self.edge_path.clone();
        edges.push(closing);
        self.shortest
            .push(normalized(self.graph, &self.path, &edges));
        if self.shortest.len() == 2 * self.limit {
            self.keep_shortest();
        }
    }

    fn keep_shortest(&mut self) {
        self.shortest.sort_by(|left, right| {
            left.nodes
                .len()
                .cmp(&right.nodes.len())
                .then_with(|| compare_text(&left.sort_key, &right.sort_key))
        });
        self.shortest.truncate(self.limit);
        if self.shortest.len() == self.limit {
            if let Some(last) = self.shortest.last() {
                self.longest_kept = last.nodes.len() - 1;
            }
        }
    }
}

#[derive(Serialize)]
struct CycleRow<'a> {
    id: String,
    length: usize,
    nodes: Vec<&'a str>,
    #[serde(rename = "nodeSummaries")]
    node_summaries: Vec<NodeSummary<'a>>,
    edges: Vec<CompiledEdge<'a>>,
}

#[derive(Serialize)]
struct CycleQuery {
    operation: &'static str,
    #[serde(rename = "maxHops")]
    max_hops: usize,
    limit: usize,
    #[serde(rename = "searchBudget")]
    search_budget: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    types: Option<Vec<&'static str>>,
}

#[derive(Serialize)]
struct CycleEvidence {
    status: &'static str,
    reason: &'static str,
    #[serde(rename = "nextStep")]
    next_step: &'static str,
    recommendation: &'static str,
    #[serde(rename = "saferQuery", skip_serializing_if = "Option::is_none")]
    safer_query: Option<CycleQuery>,
}

#[derive(Serialize)]
pub struct CyclesAnswer<'a> {
    operation: &'static str,
    #[serde(rename = "relationTypes")]
    relation_types: Option<Vec<&'static str>>,
    #[serde(rename = "maxDepth")]
    max_depth: usize,
    #[serde(rename = "searchBudget")]
    search_budget: usize,
    #[serde(rename = "expandedStates")]
    expanded_states: usize,
    exhaustive: bool,
    #[serde(rename = "truncatedByBudget")]
    truncated_by_budget: bool,
    #[serde(rename = "totalCycles")]
    total_cycles: usize,
    #[serde(rename = "totalCyclesExact")]
    total_cycles_exact: bool,
    limited: bool,
    cycles: Vec<CycleRow<'a>>,
    evidence: CycleEvidence,
}

pub fn cycles<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<CyclesAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(DEFAULT_CYCLE_LIMIT);
    let max_depth = request
        .max_hops
        .or(request.depth)
        .unwrap_or(DEFAULT_CYCLE_DEPTH);
    let types = dependency_types(request)?;
    let search_budget = request.search_budget.unwrap_or(DEFAULT_SEARCH_BUDGET);

    let mut by_rank: Vec<NodeId> = graph.node_ids().collect();
    by_rank.sort_by(|left, right| graph.compare_nodes(*left, *right));
    let mut rank = vec![0_u32; graph.nodes().len()];
    for (position, node) in by_rank.iter().enumerate() {
        if let Some(slot) = rank.get_mut(node.index()) {
            *slot = u32::try_from(position).unwrap_or(u32::MAX);
        }
    }
    let mut successors: HashMap<NodeId, Vec<EdgeId>> = HashMap::new();
    for node in graph.node_ids() {
        let mut seen: HashSet<NodeId> = HashSet::new();
        let mut first_edges: Vec<EdgeId> = Vec::new();
        for &edge_id in graph.outgoing(node) {
            let edge = graph.edge(edge_id);
            if let Some(to) = edge.to() {
                if allowed(types.as_ref(), edge.via) && seen.insert(to) {
                    first_edges.push(edge_id);
                }
            }
        }
        if !first_edges.is_empty() {
            successors.insert(node, first_edges);
        }
    }
    let mut starts: Vec<NodeId> = successors.keys().copied().collect();
    starts.sort_by_key(|node| rank.get(node.index()).copied().unwrap_or(u32::MAX));

    let mut search = CycleSearch {
        graph,
        rank,
        successors,
        max_depth,
        limit,
        search_budget,
        path: Vec::new(),
        edge_path: Vec::new(),
        shortest: Vec::new(),
        longest_kept: usize::MAX,
        total: 0,
        expanded: 0,
        truncated: false,
    };
    for start in starts {
        if max_depth == 0 || search.truncated {
            break;
        }
        let start_rank = search.rank.get(start.index()).copied().unwrap_or(0);
        search.expand(start_rank, start);
    }
    search.keep_shortest();

    let complete = !search.truncated && search.total <= limit;
    let relation_types = types.as_ref().map(RelationSet::sorted_names);
    let rows: Vec<CycleRow<'a>> = search
        .shortest
        .iter()
        .map(|cycle| CycleRow {
            id: cycle.key.clone(),
            length: cycle.nodes.len() - 1,
            nodes: cycle
                .nodes
                .iter()
                .map(|node| graph.node(*node).slug.as_str())
                .collect(),
            node_summaries: summaries(graph, cycle.nodes.iter().copied()),
            edges: cycle
                .edges
                .iter()
                .map(|edge| CompiledEdge::of(graph, *edge))
                .collect(),
        })
        .collect();
    Ok(CyclesAnswer {
        operation: "cycles",
        relation_types: relation_types.clone(),
        max_depth,
        search_budget,
        expanded_states: search.expanded,
        exhaustive: !search.truncated,
        truncated_by_budget: search.truncated,
        total_cycles: search.total,
        total_cycles_exact: !search.truncated,
        limited: search.total > rows.len() || search.truncated,
        cycles: rows,
        evidence: CycleEvidence {
            status: if complete { "complete" } else { "partial" },
            reason: if search.truncated {
                "search_budget"
            } else if search.total > limit {
                "limit"
            } else {
                "complete"
            },
            next_step: if complete { "use" } else { "narrow" },
            recommendation: if complete {
                "Safe to treat totalCycles as complete for the requested bounds: zero means acyclic within maxDepth."
            } else if search.truncated {
                "Search budget hit before the graph was exhausted, so totalCycles is a lower bound and zero does NOT mean acyclic. Reduce maxHops, narrow types, or raise searchBudget."
            } else {
                "totalCycles is exact, but the list holds only the shortest cycles up to limit; raise limit to see the rest."
            },
            safer_query: (!complete).then(|| CycleQuery {
                operation: "cycles",
                max_hops: if max_depth > 2 {
                    max_depth - 2
                } else {
                    max_depth
                },
                limit: limit.min(10),
                search_budget: search_budget.min(1000),
                types: relation_types,
            }),
        },
    })
}

#[derive(Serialize)]
struct OrderedRow<'a> {
    rank: usize,
    slug: &'a str,
    node: NodeSummary<'a>,
}

#[derive(Serialize)]
struct LayerRow<'a> {
    rank: usize,
    nodes: Vec<NodeSummary<'a>>,
    limited: bool,
}

#[derive(Serialize)]
struct BlockedRow<'a> {
    slug: &'a str,
    #[serde(rename = "remainingInDegree")]
    remaining_in_degree: usize,
    node: NodeSummary<'a>,
}

#[derive(Serialize)]
pub struct TopologicalOrderAnswer<'a> {
    operation: &'static str,
    #[serde(rename = "relationTypes")]
    relation_types: Option<Vec<&'static str>>,
    #[serde(rename = "prerequisiteFirst")]
    prerequisite_first: bool,
    #[serde(rename = "includeIsolated")]
    include_isolated: bool,
    acyclic: bool,
    #[serde(rename = "totalNodes")]
    total_nodes: usize,
    #[serde(rename = "orderedCount")]
    ordered_count: usize,
    #[serde(rename = "selectedEdges")]
    selected_edges: usize,
    limited: bool,
    order: Vec<OrderedRow<'a>>,
    layers: Vec<LayerRow<'a>>,
    blocked: Vec<BlockedRow<'a>>,
}

pub fn topological_order<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<TopologicalOrderAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(DEFAULT_ORDER_LIMIT);
    let types = dependency_types(request)?;
    let include_isolated = request.include_isolated.unwrap_or(false);
    let count = graph.nodes().len();

    let selected: Vec<EdgeId> = graph
        .edge_ids()
        .filter(|id| {
            let edge = graph.edge(*id);
            edge.is_resolved() && allowed(types.as_ref(), edge.via)
        })
        .collect();
    let mut in_set = vec![include_isolated; count];
    let mut dependents: Vec<Vec<NodeId>> = vec![Vec::new(); count];
    let mut indegree = vec![0_usize; count];
    let mut pairs: HashSet<(NodeId, NodeId)> = HashSet::new();
    for id in &selected {
        let edge = graph.edge(*id);
        let Some(prerequisite) = edge.to() else {
            continue;
        };
        let dependent = edge.from;
        for node in [dependent, prerequisite] {
            if let Some(slot) = in_set.get_mut(node.index()) {
                *slot = true;
            }
        }
        if !pairs.insert((prerequisite, dependent)) {
            continue;
        }
        if let Some(list) = dependents.get_mut(prerequisite.index()) {
            list.push(dependent);
        }
        if let Some(slot) = indegree.get_mut(dependent.index()) {
            *slot += 1;
        }
    }
    let slugs: Vec<NodeId> = graph
        .node_ids()
        .filter(|n| in_set.get(n.index()).copied().unwrap_or(false))
        .collect();

    let mut ready: Vec<NodeId> = slugs
        .iter()
        .copied()
        .filter(|node| indegree.get(node.index()).copied() == Some(0))
        .collect();
    graph.sort_by_code_units(&mut ready);
    let mut ordered: Vec<(usize, NodeId)> = Vec::new();
    let mut layers: Vec<(usize, Vec<NodeId>)> = Vec::new();
    let mut rank = 0;
    while !ready.is_empty() {
        let layer = std::mem::take(&mut ready);
        for node in &layer {
            ordered.push((rank, *node));
        }
        let mut next_ready: Vec<NodeId> = Vec::new();
        for node in &layer {
            let mut following = dependents.get(node.index()).cloned().unwrap_or_default();
            graph.sort_by_code_units(&mut following);
            for next in following {
                if let Some(slot) = indegree.get_mut(next.index()) {
                    *slot = slot.saturating_sub(1);
                    if *slot == 0 {
                        next_ready.push(next);
                    }
                }
            }
        }
        next_ready.sort_unstable();
        next_ready.dedup();
        graph.sort_by_code_units(&mut next_ready);
        layers.push((rank, layer));
        ready = next_ready;
        rank += 1;
    }
    let mut blocked: Vec<NodeId> = slugs
        .iter()
        .copied()
        .filter(|node| indegree.get(node.index()).copied().unwrap_or(0) > 0)
        .collect();
    graph.sort_by_code_units(&mut blocked);

    let order_rows: Vec<OrderedRow<'a>> = ordered
        .iter()
        .take(limit)
        .map(|(rank, node)| OrderedRow {
            rank: *rank,
            slug: &graph.node(*node).slug,
            node: NodeSummary::of(graph, *node),
        })
        .collect();
    let mut remaining = limit;
    let mut layer_rows: Vec<LayerRow<'a>> = Vec::new();
    for (rank, nodes) in &layers {
        if remaining == 0 {
            break;
        }
        let shown = nodes.len().min(remaining);
        layer_rows.push(LayerRow {
            rank: *rank,
            nodes: summaries(graph, nodes.iter().take(shown).copied()),
            limited: nodes.len() > shown,
        });
        remaining -= shown;
    }
    Ok(TopologicalOrderAnswer {
        operation: "topological_order",
        relation_types: types.as_ref().map(RelationSet::sorted_names),
        prerequisite_first: true,
        include_isolated,
        acyclic: blocked.is_empty(),
        total_nodes: slugs.len(),
        ordered_count: ordered.len(),
        selected_edges: selected.len(),
        limited: ordered.len() > limit,
        order: order_rows,
        layers: layer_rows,
        blocked: blocked
            .iter()
            .map(|node| BlockedRow {
                slug: &graph.node(*node).slug,
                remaining_in_degree: indegree.get(node.index()).copied().unwrap_or(0),
                node: NodeSummary::of(graph, *node),
            })
            .collect(),
    })
}
