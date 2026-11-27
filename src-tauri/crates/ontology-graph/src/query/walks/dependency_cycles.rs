//! `cycles`: whether dependencies loop. It reads the `dependencies` relation unless the call names
//! others.
//!
//! The search is Johnson's minimum-vertex rule: each simple cycle is found once, from its
//! lowest-ranked node, up to `maxHops` edges long. Its recursion is as deep as the path it is
//! extending, which `maxHops` caps at twenty, and the whole search spends a budget of expanded
//! states that it reports when it runs out.

use std::collections::{HashMap, HashSet};

use answer_format::collation::compare_text;
use serde::Serialize;

use crate::compiled_graph::{CompiledGraph, EdgeId, NodeId};
use crate::query::edge_rows::CompiledEdge;
use crate::query::node_summary::{summaries, NodeSummary};
use crate::query::query_error::QueryError;
use crate::query::relation_set::{allowed, RelationSet};
use crate::query::request::QueryRequest;

const DEFAULT_CYCLE_LIMIT: usize = 20;
pub const DEFAULT_CYCLE_DEPTH: usize = 8;
pub const DEFAULT_SEARCH_BUDGET: usize = 5000;

/// A loop of dependencies, rotated to start at its lowest node and closed by repeating it.
pub struct DependencyCycle {
    /// The nodes around the loop, the first again at the end.
    pub nodes: Vec<NodeId>,
    /// The edge that leaves each node but the last.
    pub edges: Vec<EdgeId>,
    /// The nodes' slugs joined by `->`, which names the cycle.
    pub key: String,
    sort_key: String,
}

/// The cycle rotated to start at its lowest slug, closed by repeating that slug.
fn normalized(graph: &CompiledGraph, nodes: &[NodeId], edges: &[EdgeId]) -> DependencyCycle {
    let mut start = 0;
    for (index, node) in nodes.iter().enumerate().skip(1) {
        let lowest = nodes.get(start).copied().unwrap_or(*node);
        if *node < lowest {
            start = index;
        }
    }
    let mut rotated: Vec<NodeId> = nodes.get(start..).unwrap_or_default().to_vec();
    rotated.extend_from_slice(nodes.get(..start).unwrap_or_default());
    let mut rotated_edges: Vec<EdgeId> = edges.get(start..).unwrap_or_default().to_vec();
    rotated_edges.extend_from_slice(edges.get(..start).unwrap_or_default());
    let slugs: Vec<&str> = rotated
        .iter()
        .map(|node| graph.node(*node).slug())
        .collect();
    let key = slugs.join("->");
    let mut closed = rotated;
    if let Some(first) = closed.first().copied() {
        closed.push(first);
    }
    let sort_key = closed
        .iter()
        .map(|node| graph.node(*node).slug())
        .collect::<Vec<_>>()
        .join("\0");
    DependencyCycle {
        nodes: closed,
        edges: rotated_edges,
        key,
        sort_key,
    }
}

struct CycleSearch<'a> {
    graph: &'a CompiledGraph,
    successors: HashMap<NodeId, Vec<EdgeId>>,
    max_depth: usize,
    limit: usize,
    search_budget: usize,
    path: Vec<NodeId>,
    edge_path: Vec<EdgeId>,
    shortest: Vec<DependencyCycle>,
    longest_kept: usize,
    total: usize,
    expanded: usize,
    truncated: bool,
}

impl CycleSearch<'_> {
    fn expand(&mut self, start: NodeId, current: NodeId) {
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
            } else if self.path.len() < self.max_depth && to > start && !self.path.contains(&to) {
                self.edge_path.push(edge_id);
                self.expand(start, to);
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

/// A cycle as an answer writes it.
#[derive(Serialize)]
pub struct CycleRow<'a> {
    id: String,
    length: usize,
    nodes: Vec<&'a str>,
    #[serde(rename = "nodeSummaries")]
    node_summaries: Vec<NodeSummary<'a>>,
    edges: Vec<CompiledEdge<'a>>,
}

impl<'a> CycleRow<'a> {
    pub fn of(graph: &'a CompiledGraph, cycle: &DependencyCycle) -> Self {
        Self {
            id: cycle.key.clone(),
            length: cycle.nodes.len() - 1,
            nodes: cycle
                .nodes
                .iter()
                .map(|node| graph.node(*node).slug())
                .collect(),
            node_summaries: summaries(graph, cycle.nodes.iter().copied()),
            edges: cycle
                .edges
                .iter()
                .map(|edge| CompiledEdge::of(graph, *edge))
                .collect(),
        }
    }

    /// The slugs around the cycle, the first again at the end.
    pub fn nodes(&self) -> &[&'a str] {
        &self.nodes
    }
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

/// What a search for cycles found, before any of it is written.
pub struct CycleFacts {
    /// The shortest cycles, up to the limit, shortest first and equally long ones in the order
    /// of their slugs.
    pub cycles: Vec<DependencyCycle>,
    /// Every cycle found within the bounds, kept or not.
    pub total: usize,
    pub expanded_states: usize,
    /// The search spent its budget, so `total` is a lower bound.
    pub truncated: bool,
}

/// The cycles of the edges `types` allows, at most `max_depth` edges long, keeping the shortest
/// `limit`, within a budget of `search_budget` expanded states.
pub fn find_cycles(
    graph: &CompiledGraph,
    types: Option<&RelationSet>,
    max_depth: usize,
    limit: usize,
    search_budget: usize,
) -> CycleFacts {
    let mut successors: HashMap<NodeId, Vec<EdgeId>> = HashMap::new();
    for node in graph.node_ids() {
        let mut seen: HashSet<NodeId> = HashSet::new();
        let mut first_edges: Vec<EdgeId> = Vec::new();
        for &edge_id in graph.outgoing(node) {
            let edge = graph.edge(edge_id);
            if let Some(to) = edge.to() {
                if allowed(types, edge.via) && seen.insert(to) {
                    first_edges.push(edge_id);
                }
            }
        }
        if !first_edges.is_empty() {
            successors.insert(node, first_edges);
        }
    }
    let mut starts: Vec<NodeId> = successors.keys().copied().collect();
    starts.sort_unstable();

    let mut search = CycleSearch {
        graph,
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
        search.expand(start, start);
    }
    search.keep_shortest();
    CycleFacts {
        cycles: search.shortest,
        total: search.total,
        expanded_states: search.expanded,
        truncated: search.truncated,
    }
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
    let types = RelationSet::dependencies_unless_named(request.types.as_deref())?;
    let search_budget = request.search_budget(DEFAULT_SEARCH_BUDGET)?;

    let search = find_cycles(graph, types.as_ref(), max_depth, limit, search_budget);

    let complete = !search.truncated && search.total <= limit;
    let relation_types = types.as_ref().map(RelationSet::sorted_names);
    let rows: Vec<CycleRow<'a>> = search
        .cycles
        .iter()
        .map(|cycle| CycleRow::of(graph, cycle))
        .collect();
    Ok(CyclesAnswer {
        operation: "cycles",
        relation_types: relation_types.clone(),
        max_depth,
        search_budget,
        expanded_states: search.expanded_states,
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
