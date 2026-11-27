//! `topological_order`: the order dependencies can be built in. It reads the `dependencies`
//! relation unless the call names others. The order is Kahn's algorithm by layers over distinct
//! prerequisite pairs; it holds no recursion.

use std::collections::HashSet;

use serde::Serialize;

use crate::compiled_graph::{CompiledGraph, EdgeId, NodeId};
use crate::query::node_summary::{summaries, NodeSummary};
use crate::query::query_error::QueryError;
use crate::query::relation_set::{allowed, RelationSet};
use crate::query::request::QueryRequest;

const DEFAULT_ORDER_LIMIT: usize = 100;

/// A node that waits on a cycle: prerequisites of it are still unordered when the layers end.
pub struct Blocked {
    pub node: NodeId,
    pub remaining_in_degree: usize,
}

/// The order dependencies can be built in, before any of it is written.
pub struct DependencyOrder {
    /// Nodes in the order of the graph that have a dependency edge, or all when isolated nodes
    /// were asked for.
    pub total_nodes: usize,
    pub selected_edges: usize,
    /// `layers[rank]` holds the nodes whose prerequisites all sit in earlier layers.
    pub layers: Vec<Vec<NodeId>>,
    /// The nodes no layer could take, in the order of the graph.
    pub blocked: Vec<Blocked>,
}

impl DependencyOrder {
    /// Every ordered node with its rank, prerequisites first.
    pub fn ordered(&self) -> impl Iterator<Item = (usize, NodeId)> + '_ {
        self.layers
            .iter()
            .enumerate()
            .flat_map(|(rank, layer)| layer.iter().map(move |&node| (rank, node)))
    }

    pub fn ordered_count(&self) -> usize {
        self.layers.iter().map(Vec::len).sum()
    }

    pub fn is_acyclic(&self) -> bool {
        self.blocked.is_empty()
    }
}

/// The order of the nodes joined by the edges `types` allows.
pub fn order_dependencies(
    graph: &CompiledGraph,
    types: Option<&RelationSet>,
    include_isolated: bool,
) -> DependencyOrder {
    let count = graph.nodes().len();

    let selected: Vec<EdgeId> = graph
        .edge_ids()
        .filter(|id| {
            let edge = graph.edge(*id);
            edge.is_resolved() && allowed(types, edge.via)
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
    ready.sort_unstable();
    let mut layers: Vec<Vec<NodeId>> = Vec::new();
    while !ready.is_empty() {
        let layer = std::mem::take(&mut ready);
        let mut next_ready: Vec<NodeId> = Vec::new();
        for node in &layer {
            let mut following = dependents.get(node.index()).cloned().unwrap_or_default();
            following.sort_unstable();
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
        layers.push(layer);
        ready = next_ready;
    }
    let blocked: Vec<Blocked> = slugs
        .iter()
        .filter_map(|&node| {
            let remaining_in_degree = indegree.get(node.index()).copied().unwrap_or(0);
            (remaining_in_degree > 0).then_some(Blocked {
                node,
                remaining_in_degree,
            })
        })
        .collect();
    DependencyOrder {
        total_nodes: slugs.len(),
        selected_edges: selected.len(),
        layers,
        blocked,
    }
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
    let types = RelationSet::dependencies_unless_named(request.types.as_deref())?;
    let include_isolated = request.include_isolated.unwrap_or(false);
    let order = order_dependencies(graph, types.as_ref(), include_isolated);
    let ordered_count = order.ordered_count();

    let order_rows: Vec<OrderedRow<'a>> = order
        .ordered()
        .take(limit)
        .map(|(rank, node)| OrderedRow {
            rank,
            slug: graph.node(node).slug(),
            node: NodeSummary::of(graph, node),
        })
        .collect();
    let mut remaining = limit;
    let mut layer_rows: Vec<LayerRow<'a>> = Vec::new();
    for (rank, nodes) in order.layers.iter().enumerate() {
        if remaining == 0 {
            break;
        }
        let shown = nodes.len().min(remaining);
        layer_rows.push(LayerRow {
            rank,
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
        acyclic: order.is_acyclic(),
        total_nodes: order.total_nodes,
        ordered_count,
        selected_edges: order.selected_edges,
        limited: ordered_count > limit || order.blocked.len() > limit,
        order: order_rows,
        layers: layer_rows,
        blocked: order
            .blocked
            .iter()
            .take(limit)
            .map(|blocked| BlockedRow {
                slug: graph.node(blocked.node).slug(),
                remaining_in_degree: blocked.remaining_in_degree,
                node: NodeSummary::of(graph, blocked.node),
            })
            .collect(),
    })
}
