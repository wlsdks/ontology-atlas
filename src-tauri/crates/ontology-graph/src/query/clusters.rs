//! `components` and `communities`: how the graph falls into connected groups, and into groups
//! that are more tightly linked inside than across.
//!
//! A component is found by a breadth-first search from each node not yet reached. A community is
//! found by label propagation: each node takes the label most of its neighbours hold, in slug
//! order, until none changes or the iterations run out. Edges are counted once for every group,
//! in one pass over them.

use std::collections::HashMap;

use answer_format::collation::compare_text;
use serde::Serialize;

use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::object_map::ObjectMap;
use crate::query::query_error::QueryError;
use crate::query::relation_set::{allowed, RelationSet};
use crate::query::request::QueryRequest;
use crate::query::views::{domain_counts, kind_counts, summaries, NodeSummary, PathEdge};

const DEFAULT_GROUP_LIMIT: usize = 20;
const DEFAULT_NODE_LIMIT: usize = 25;
pub(crate) const DEFAULT_ITERATIONS: usize = 20;

/// The nodes each node shares an allowed resolved edge with, each once, in code unit order.
pub(crate) fn undirected_adjacency(
    graph: &CompiledGraph,
    types: Option<&RelationSet>,
) -> Vec<Vec<NodeId>> {
    let mut adjacency: Vec<Vec<NodeId>> = vec![Vec::new(); graph.nodes().len()];
    for edge in graph.edges() {
        let Some(to) = edge.to() else { continue };
        if !allowed(types, edge.via) {
            continue;
        }
        if let Some(list) = adjacency.get_mut(edge.from.index()) {
            list.push(to);
        }
        if let Some(list) = adjacency.get_mut(to.index()) {
            list.push(edge.from);
        }
    }
    for list in &mut adjacency {
        list.sort_unstable();
        list.dedup();
        graph.sort_by_code_units(list);
    }
    adjacency
}

/// The connected groups, the largest first, each with its nodes in code unit order.
pub(crate) fn connected_components(
    graph: &CompiledGraph,
    types: Option<&RelationSet>,
) -> Vec<Vec<NodeId>> {
    let adjacency = undirected_adjacency(graph, types);
    let mut visited = vec![false; graph.nodes().len()];
    let mut groups: Vec<Vec<NodeId>> = Vec::new();
    for start in graph.node_ids() {
        if visited.get(start.index()).copied().unwrap_or(true) {
            continue;
        }
        if let Some(slot) = visited.get_mut(start.index()) {
            *slot = true;
        }
        let mut queue = vec![start];
        let mut head = 0;
        while let Some(current) = queue.get(head).copied() {
            head += 1;
            for next in adjacency
                .get(current.index())
                .map_or(&[][..], Vec::as_slice)
            {
                if let Some(slot) = visited.get_mut(next.index()) {
                    if !*slot {
                        *slot = true;
                        queue.push(*next);
                    }
                }
            }
        }
        graph.sort_by_code_units(&mut queue);
        groups.push(queue);
    }
    groups.sort_by(|left, right| {
        right.len().cmp(&left.len()).then_with(|| {
            let slug = |group: &Vec<NodeId>| {
                group
                    .first()
                    .map_or("", |node| graph.node(*node).slug.as_str())
                    .to_string()
            };
            compare_text(&slug(left), &slug(right))
        })
    });
    groups
}

#[derive(Serialize)]
struct ComponentRow<'a> {
    id: usize,
    size: usize,
    kinds: ObjectMap<usize>,
    #[serde(rename = "nodeLimited")]
    node_limited: bool,
    nodes: Vec<NodeSummary<'a>>,
}

#[derive(Serialize)]
pub struct ComponentsAnswer<'a> {
    operation: &'static str,
    #[serde(rename = "totalComponents")]
    total_components: usize,
    #[serde(rename = "largestSize")]
    largest_size: usize,
    #[serde(rename = "singletonCount")]
    singleton_count: usize,
    limited: bool,
    components: Vec<ComponentRow<'a>>,
}

pub fn components<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<ComponentsAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(DEFAULT_GROUP_LIMIT);
    let node_limit = request.node_limit.unwrap_or(DEFAULT_NODE_LIMIT);
    let types = RelationSet::parse(request.types.as_deref(), "types")?;
    let groups = connected_components(graph, types.as_ref());
    Ok(ComponentsAnswer {
        operation: "components",
        total_components: groups.len(),
        largest_size: groups.first().map_or(0, Vec::len),
        singleton_count: groups.iter().filter(|group| group.len() == 1).count(),
        limited: groups.len() > limit,
        components: groups
            .iter()
            .take(limit)
            .enumerate()
            .map(|(index, group)| ComponentRow {
                id: index + 1,
                size: group.len(),
                kinds: kind_counts(graph, group.iter().copied()),
                node_limited: group.len() > node_limit,
                nodes: summaries(graph, group.iter().take(node_limit).copied()),
            })
            .collect(),
    })
}

/// The label each node ends with: the node whose slug names its community.
fn propagate_labels(
    graph: &CompiledGraph,
    adjacency: &[Vec<NodeId>],
    iterations: usize,
) -> Vec<NodeId> {
    let mut labels: Vec<NodeId> = graph.node_ids().collect();
    let mut in_slug_order: Vec<NodeId> = graph.node_ids().collect();
    graph.sort_by_code_units(&mut in_slug_order);
    for _ in 0..iterations {
        let mut changed = false;
        for node in &in_slug_order {
            let neighbors = adjacency.get(node.index()).map_or(&[][..], Vec::as_slice);
            if neighbors.is_empty() {
                continue;
            }
            let mut counts: HashMap<NodeId, usize> = HashMap::new();
            for neighbor in neighbors {
                let label = labels.get(neighbor.index()).copied().unwrap_or(*neighbor);
                *counts.entry(label).or_insert(0) += 1;
            }
            let Some(best) = counts
                .into_iter()
                .min_by(|left, right| {
                    right
                        .1
                        .cmp(&left.1)
                        .then_with(|| graph.compare_nodes(left.0, right.0))
                })
                .map(|(label, _)| label)
            else {
                continue;
            };
            if let Some(slot) = labels.get_mut(node.index()) {
                if *slot != best {
                    *slot = best;
                    changed = true;
                }
            }
        }
        if !changed {
            break;
        }
    }
    labels
}

struct Community {
    label: NodeId,
    nodes: Vec<NodeId>,
    internal_edges: usize,
    boundary_edges: usize,
    representative: NodeId,
}

#[derive(Serialize)]
struct CommunityRow<'a> {
    id: usize,
    label: &'a str,
    size: usize,
    #[serde(rename = "internalEdges")]
    internal_edges: usize,
    #[serde(rename = "boundaryEdges")]
    boundary_edges: usize,
    kinds: ObjectMap<usize>,
    domains: ObjectMap<usize>,
    representative: NodeSummary<'a>,
    #[serde(rename = "nodeLimited")]
    node_limited: bool,
    nodes: Vec<NodeSummary<'a>>,
}

#[derive(Serialize)]
struct CommunityParameters {
    types: Option<Vec<&'static str>>,
    iterations: usize,
    limit: usize,
    #[serde(rename = "nodeLimit")]
    node_limit: usize,
}

#[derive(Serialize)]
struct CommunitySummary {
    communities: usize,
    #[serde(rename = "largestSize")]
    largest_size: usize,
    #[serde(rename = "singletonCount")]
    singleton_count: usize,
    #[serde(rename = "crossCommunityEdges")]
    cross_community_edges: usize,
}

#[derive(Serialize)]
struct CrossEdge<'a> {
    #[serde(flatten)]
    edge: PathEdge<'a>,
    #[serde(rename = "fromCommunity")]
    from_community: usize,
    #[serde(rename = "toCommunity")]
    to_community: usize,
}

#[derive(Serialize)]
struct CrossEdges<'a> {
    total: usize,
    limited: bool,
    rows: Vec<CrossEdge<'a>>,
}

#[derive(Serialize)]
pub struct CommunitiesAnswer<'a> {
    operation: &'static str,
    parameters: CommunityParameters,
    summary: CommunitySummary,
    limited: bool,
    communities: Vec<CommunityRow<'a>>,
    #[serde(rename = "crossCommunityEdges")]
    cross_community_edges: CrossEdges<'a>,
}

pub fn communities<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<CommunitiesAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(DEFAULT_GROUP_LIMIT);
    let node_limit = request.node_limit.unwrap_or(DEFAULT_NODE_LIMIT);
    let iterations = request.iterations.unwrap_or(DEFAULT_ITERATIONS);
    let types = RelationSet::parse(request.types.as_deref(), "types")?;
    let adjacency = undirected_adjacency(graph, types.as_ref());
    let labels = propagate_labels(graph, &adjacency, iterations);

    let mut by_label: Vec<(NodeId, Vec<NodeId>)> = Vec::new();
    let mut at: HashMap<NodeId, usize> = HashMap::new();
    for node in graph.node_ids() {
        let label = labels.get(node.index()).copied().unwrap_or(node);
        let index = *at.entry(label).or_insert_with(|| {
            by_label.push((label, Vec::new()));
            by_label.len() - 1
        });
        if let Some((_, members)) = by_label.get_mut(index) {
            members.push(node);
        }
    }
    let label_of = |node: NodeId| labels.get(node.index()).copied().unwrap_or(node);
    let mut internal: HashMap<NodeId, usize> = HashMap::new();
    let mut boundary: HashMap<NodeId, usize> = HashMap::new();
    for edge in graph.edges() {
        let Some(to) = edge.to() else { continue };
        if !allowed(types.as_ref(), edge.via) {
            continue;
        }
        let (from_label, to_label) = (label_of(edge.from), label_of(to));
        if from_label == to_label {
            *internal.entry(from_label).or_insert(0) += 1;
        } else {
            *boundary.entry(from_label).or_insert(0) += 1;
            *boundary.entry(to_label).or_insert(0) += 1;
        }
    }
    let mut groups: Vec<Community> = by_label
        .into_iter()
        .map(|(label, mut nodes)| {
            graph.sort_by_code_units(&mut nodes);
            let representative = nodes
                .iter()
                .copied()
                .min_by(|left, right| {
                    graph
                        .node(*right)
                        .degree()
                        .cmp(&graph.node(*left).degree())
                        .then_with(|| graph.compare_nodes(*left, *right))
                })
                .unwrap_or(label);
            Community {
                label,
                internal_edges: internal.get(&label).copied().unwrap_or(0),
                boundary_edges: boundary.get(&label).copied().unwrap_or(0),
                representative,
                nodes,
            }
        })
        .collect();
    groups.sort_by(|left, right| {
        right
            .nodes
            .len()
            .cmp(&left.nodes.len())
            .then_with(|| right.internal_edges.cmp(&left.internal_edges))
            .then_with(|| {
                compare_text(
                    &graph.node(left.representative).slug,
                    &graph.node(right.representative).slug,
                )
            })
    });
    let mut community_of: HashMap<NodeId, usize> = HashMap::new();
    for (index, group) in groups.iter().enumerate() {
        for node in &group.nodes {
            community_of.insert(*node, index + 1);
        }
    }
    let cross: Vec<_> = graph
        .edge_ids()
        .filter(|id| {
            let edge = graph.edge(*id);
            edge.to().is_some_and(|to| {
                allowed(types.as_ref(), edge.via)
                    && community_of.get(&edge.from) != community_of.get(&to)
            })
        })
        .collect();

    let rows: Vec<CommunityRow<'a>> = groups
        .iter()
        .take(limit)
        .enumerate()
        .map(|(index, group)| CommunityRow {
            id: index + 1,
            label: &graph.node(group.label).slug,
            size: group.nodes.len(),
            internal_edges: group.internal_edges,
            boundary_edges: group.boundary_edges,
            kinds: kind_counts(graph, group.nodes.iter().copied()),
            domains: domain_counts(graph, group.nodes.iter().copied()),
            representative: NodeSummary::of(graph, group.representative),
            node_limited: group.nodes.len() > node_limit,
            nodes: summaries(graph, group.nodes.iter().take(node_limit).copied()),
        })
        .collect();
    Ok(CommunitiesAnswer {
        operation: "communities",
        parameters: CommunityParameters {
            types: types.as_ref().map(RelationSet::sorted_names),
            iterations,
            limit,
            node_limit,
        },
        summary: CommunitySummary {
            communities: groups.len(),
            largest_size: groups.first().map_or(0, |group| group.nodes.len()),
            singleton_count: groups.iter().filter(|group| group.nodes.len() == 1).count(),
            cross_community_edges: cross.len(),
        },
        limited: groups.len() > limit,
        communities: rows,
        cross_community_edges: CrossEdges {
            total: cross.len(),
            limited: cross.len() > limit,
            rows: cross
                .iter()
                .take(limit)
                .map(|id| {
                    let edge = graph.edge(*id);
                    let to = edge.to().unwrap_or(edge.from);
                    CrossEdge {
                        edge: PathEdge::of(graph, *id, edge.from, to),
                        from_community: community_of.get(&edge.from).copied().unwrap_or(0),
                        to_community: community_of.get(&to).copied().unwrap_or(0),
                    }
                })
                .collect(),
        },
    })
}
