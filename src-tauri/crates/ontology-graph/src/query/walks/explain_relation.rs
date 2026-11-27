//! `explain_relation`: how two nodes are related. The edges between them, the shortest path, the
//! nodes both touch, and which domain each belongs to, with a one-word verdict.

use serde::Serialize;

use super::graph_walk::traversal_steps;
use super::hop::path_edges;
use super::paths::shortest_path;
use crate::compiled_graph::{CompiledGraph, EdgeId, NodeId};
use crate::query::domain_lookup::DomainLookup;
use crate::query::edge_rows::{CompiledEdge, PathEdge};
use crate::query::node_resolution::resolve;
use crate::query::node_summary::{summaries, NodeSummary};
use crate::query::operation_defaults::{EXPLAIN_RELATION_LIMIT, PATH_MAX_HOPS};
use crate::query::query_error::QueryError;
use crate::query::relation_set::{allowed, RelationSet};
use crate::query::request::{Direction, QueryRequest};

use super::row_page::RowPage;

#[derive(Serialize)]
struct DomainsOfPair<'a> {
    from: Option<&'a str>,
    to: Option<&'a str>,
    #[serde(rename = "sameDomain")]
    same_domain: bool,
}

#[derive(Serialize)]
struct DirectEdge<'a> {
    #[serde(flatten)]
    edge: CompiledEdge<'a>,
    direction: &'static str,
    #[serde(rename = "fromNode")]
    from_node: NodeSummary<'a>,
    #[serde(rename = "toNode")]
    to_node: NodeSummary<'a>,
}

#[derive(Serialize)]
struct DirectEdges<'a> {
    total: usize,
    edges: Vec<DirectEdge<'a>>,
}

#[derive(Serialize)]
struct ShortestPath<'a> {
    found: bool,
    direction: Direction,
    #[serde(rename = "maxHops")]
    max_hops: usize,
    #[serde(rename = "hopCount")]
    hop_count: Option<usize>,
    hops: Vec<&'a str>,
    nodes: Vec<NodeSummary<'a>>,
    edges: Vec<PathEdge<'a>>,
}

/// An edge between a node and one of its neighbors, with the way it points from that node.
#[derive(Serialize)]
struct NeighborEdge<'a> {
    #[serde(flatten)]
    edge: PathEdge<'a>,
    direction: &'static str,
}

#[derive(Serialize)]
struct CommonNeighbor<'a> {
    slug: &'a str,
    node: NodeSummary<'a>,
    #[serde(rename = "fromEdges")]
    from_edges: Vec<NeighborEdge<'a>>,
    #[serde(rename = "toEdges")]
    to_edges: Vec<NeighborEdge<'a>>,
}

#[derive(Serialize)]
pub struct ExplainRelationAnswer<'a> {
    operation: &'static str,
    from: &'a str,
    to: &'a str,
    #[serde(rename = "fromNode")]
    from_node: NodeSummary<'a>,
    #[serde(rename = "toNode")]
    to_node: NodeSummary<'a>,
    verdict: &'static str,
    domains: DomainsOfPair<'a>,
    direct: DirectEdges<'a>,
    #[serde(rename = "shortestPath")]
    shortest_path: ShortestPath<'a>,
    #[serde(rename = "commonNeighbors")]
    common_neighbors: RowPage<CommonNeighbor<'a>>,
}

/// The edges that join `from` and `to` in either direction, in the order of the graph.
fn direct_edges(
    graph: &CompiledGraph,
    from: NodeId,
    to: NodeId,
    types: Option<&RelationSet>,
) -> Vec<EdgeId> {
    let mut edges: Vec<EdgeId> = Vec::new();
    let mut collect = |source: NodeId, target: NodeId| {
        for &id in graph.outgoing(source) {
            let edge = graph.edge(id);
            if edge.to() == Some(target) && allowed(types, edge.via) {
                edges.push(id);
            }
        }
    };
    collect(from, to);
    if from != to {
        collect(to, from);
    }
    edges.sort_unstable();
    edges
}

/// The neighbors of `node` along either direction and the edges to each, each neighbor once.
fn neighbors_with_edges(
    graph: &CompiledGraph,
    node: NodeId,
    types: Option<&RelationSet>,
) -> Vec<(NodeId, Vec<EdgeId>)> {
    let mut grouped: Vec<(NodeId, Vec<EdgeId>)> = Vec::new();
    for step in traversal_steps(graph, node, Direction::Both, types) {
        match grouped.last_mut() {
            Some((next, edges)) if *next == step.next => edges.push(step.edge),
            _ => grouped.push((step.next, vec![step.edge])),
        }
    }
    grouped
}

fn neighbor_edges<'a>(
    graph: &'a CompiledGraph,
    node: NodeId,
    neighbor: NodeId,
    edges: &[EdgeId],
    limit: usize,
) -> Vec<NeighborEdge<'a>> {
    edges
        .iter()
        .take(limit)
        .map(|&id| NeighborEdge {
            edge: PathEdge::of(graph, id, node, neighbor),
            direction: if graph.edge(id).from == node {
                "outgoing"
            } else {
                "incoming"
            },
        })
        .collect()
}

pub fn explain_relation<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<ExplainRelationAnswer<'a>, QueryError> {
    let from = resolve(graph, request.from.as_deref(), "from")?;
    let to = resolve(graph, request.to.as_deref(), "to")?;
    let limit = request.limit.unwrap_or(EXPLAIN_RELATION_LIMIT);
    let max_hops = request.max_hops.unwrap_or(PATH_MAX_HOPS);
    let direction = Direction::for_paths(request.direction);
    let types = RelationSet::parse(request.types.as_deref(), "types")?;

    let direct = direct_edges(graph, from, to, types.as_ref());
    let shortest = shortest_path(graph, from, to, max_hops, direction, types.as_ref());

    let from_neighbors = neighbors_with_edges(graph, from, types.as_ref());
    let to_neighbors = neighbors_with_edges(graph, to, types.as_ref());
    let mut common: Vec<NodeId> = from_neighbors
        .iter()
        .map(|(node, _)| *node)
        .filter(|node| {
            to_neighbors
                .binary_search_by_key(node, |(other, _)| *other)
                .is_ok()
        })
        .collect();
    common.sort_by_key(|&node| (std::cmp::Reverse(graph.node(node).degree()), node));
    let edges_of = |neighbors: &[(NodeId, Vec<EdgeId>)], neighbor: NodeId| -> Vec<EdgeId> {
        neighbors
            .binary_search_by_key(&neighbor, |(node, _)| *node)
            .ok()
            .and_then(|at| neighbors.get(at))
            .map(|(_, edges)| edges.clone())
            .unwrap_or_default()
    };
    let common_rows: Vec<CommonNeighbor<'a>> = common
        .iter()
        .take(limit)
        .map(|&neighbor| CommonNeighbor {
            slug: graph.node(neighbor).slug(),
            node: NodeSummary::of(graph, neighbor),
            from_edges: neighbor_edges(
                graph,
                from,
                neighbor,
                &edges_of(&from_neighbors, neighbor),
                limit,
            ),
            to_edges: neighbor_edges(
                graph,
                to,
                neighbor,
                &edges_of(&to_neighbors, neighbor),
                limit,
            ),
        })
        .collect();

    let verdict = if from == to {
        "same_node"
    } else if !direct.is_empty() {
        "direct"
    } else if shortest.is_some() {
        "path"
    } else if !common.is_empty() {
        "common_neighbor"
    } else {
        "unrelated_within_hops"
    };

    let mut domains = DomainLookup::new(graph);
    let (from_domain, to_domain) = (domains.slug_of(from), domains.slug_of(to));

    Ok(ExplainRelationAnswer {
        operation: "explain_relation",
        from: graph.node(from).slug(),
        to: graph.node(to).slug(),
        from_node: NodeSummary::of(graph, from),
        to_node: NodeSummary::of(graph, to),
        verdict,
        domains: DomainsOfPair {
            from: from_domain,
            to: to_domain,
            same_domain: from_domain.is_some() && from_domain == to_domain,
        },
        direct: DirectEdges {
            total: direct.len(),
            edges: direct
                .iter()
                .map(|&id| {
                    let edge = graph.edge(id);
                    DirectEdge {
                        edge: CompiledEdge::of(graph, id),
                        direction: if edge.from == from && edge.to() == Some(to) {
                            "outgoing"
                        } else {
                            "incoming"
                        },
                        from_node: NodeSummary::of(graph, edge.from),
                        to_node: NodeSummary::of(graph, edge.to().unwrap_or(edge.from)),
                    }
                })
                .collect(),
        },
        shortest_path: match shortest {
            Some(found) => ShortestPath {
                found: true,
                direction,
                max_hops,
                hop_count: Some(found.hops.len() - 1),
                hops: found
                    .hops
                    .iter()
                    .map(|node| graph.node(*node).slug())
                    .collect(),
                nodes: summaries(graph, found.hops.iter().copied()),
                edges: path_edges(graph, found.edges.iter().copied()),
            },
            None => ShortestPath {
                found: false,
                direction,
                max_hops,
                hop_count: None,
                hops: Vec::new(),
                nodes: Vec::new(),
                edges: Vec::new(),
            },
        },
        common_neighbors: RowPage::new(common.len(), limit, common_rows),
    })
}
