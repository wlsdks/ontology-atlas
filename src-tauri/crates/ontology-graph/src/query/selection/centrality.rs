//! `centrality`: which nodes the graph leans on. PageRank with a damping of 0.85 over `iterations`
//! rounds (20 unless asked), each score rounded to six decimals; authorities (the most nodes
//! reaching them), hubs (the most nodes they reach) and bridges (the product of the two). Each
//! counts a pair of nodes once, however many edges join them.

use std::cmp::Ordering;

use answer_format::collation::compare_text;
use serde::Serialize;

use super::clusters::DEFAULT_ITERATIONS;
use crate::compiled_graph::{CompiledGraph, EdgeId, NodeId};
use crate::query::node_summary::NodeIdentity;
use crate::query::query_error::QueryError;
use crate::query::relation_set::{allowed, RelationSet};
use crate::query::request::QueryRequest;

const DAMPING: f64 = 0.85;
const DEFAULT_LIMIT: usize = 10;

/// The share of rank each node holds after `iterations` rounds. A node with no outgoing edge
/// spreads its rank over every node.
fn row(graph: &CompiledGraph, id: NodeId, standing: Standing) -> CentralityRow<'_> {
    CentralityRow {
        identity: NodeIdentity::of(graph, id),
        in_degree: standing.in_degree,
        out_degree: standing.out_degree,
        degree: standing.degree(),
        page_rank: standing.page_rank,
        bridge_score: standing.bridge_score(),
    }
}

fn page_rank(graph: &CompiledGraph, outgoing: &[Vec<NodeId>], iterations: usize) -> Vec<f64> {
    let total = graph.nodes().len();
    if total == 0 {
        return Vec::new();
    }
    let count = total as f64;
    let mut scores = vec![1.0 / count; total];
    for _ in 0..iterations {
        let mut next = vec![(1.0 - DAMPING) / count; total];
        let mut dangling_mass = 0.0;
        for (index, targets) in outgoing.iter().enumerate() {
            let score = scores.get(index).copied().unwrap_or(0.0);
            if targets.is_empty() {
                dangling_mass += score;
                continue;
            }
            let share = score / targets.len() as f64;
            for target in targets {
                if let Some(slot) = next.get_mut(target.index()) {
                    *slot += DAMPING * share;
                }
            }
        }
        if dangling_mass > 0.0 {
            let dangling_share = (DAMPING * dangling_mass) / count;
            for slot in &mut next {
                *slot += dangling_share;
            }
        }
        scores = next;
    }
    scores
}

/// `Number(value.toFixed(6))`: six decimals, a tie rounding up. The decimal expansion of the
/// number is exact, so the seventh digit decides.
fn round_score(value: f64) -> f64 {
    let written = format!("{value:.30}");
    let Some((whole, fraction)) = written.split_once('.') else {
        return value;
    };
    let mut digits: Vec<u8> = whole.bytes().chain(fraction.bytes().take(6)).collect();
    let round_up = fraction
        .as_bytes()
        .get(6)
        .is_some_and(|digit| *digit >= b'5');
    if round_up {
        let mut at = digits.len();
        loop {
            let Some(previous) = at.checked_sub(1) else {
                digits.insert(0, b'1');
                break;
            };
            at = previous;
            match digits.get_mut(at) {
                Some(digit) if *digit == b'9' => *digit = b'0',
                Some(digit) => {
                    *digit += 1;
                    break;
                }
                None => break,
            }
        }
    }
    let split = digits.len().saturating_sub(6);
    let text = format!(
        "{}.{}",
        String::from_utf8_lossy(digits.get(..split).unwrap_or_default()),
        String::from_utf8_lossy(digits.get(split..).unwrap_or_default())
    );
    text.parse().unwrap_or(value)
}

#[derive(Serialize)]
struct CentralityRow<'a> {
    #[serde(flatten)]
    identity: NodeIdentity<'a>,
    #[serde(rename = "inDegree")]
    in_degree: usize,
    #[serde(rename = "outDegree")]
    out_degree: usize,
    degree: usize,
    #[serde(rename = "pageRank")]
    page_rank: f64,
    #[serde(rename = "bridgeScore")]
    bridge_score: usize,
}

/// What ranks a node, kept apart from the node's own fields so that ranking fifty thousand nodes
/// holds a few numbers each and an answer writes names for the few that are listed.
#[derive(Clone, Copy)]
struct Standing {
    in_degree: usize,
    out_degree: usize,
    page_rank: f64,
}

impl Standing {
    fn degree(self) -> usize {
        self.in_degree + self.out_degree
    }

    fn bridge_score(self) -> usize {
        self.in_degree * self.out_degree
    }
}

fn by_rank(graph: &CompiledGraph, standings: &[Standing], left: NodeId, right: NodeId) -> Ordering {
    let (Some(first), Some(second)) = (standings.get(left.index()), standings.get(right.index()))
    else {
        return Ordering::Equal;
    };
    second
        .page_rank
        .partial_cmp(&first.page_rank)
        .unwrap_or(Ordering::Equal)
        .then_with(|| second.degree().cmp(&first.degree()))
        .then_with(|| compare_text(graph.node(left).slug(), graph.node(right).slug()))
}

#[derive(Serialize)]
struct CentralityGraph<'a> {
    nodes: usize,
    edges: usize,
    #[serde(rename = "resolvedEdges")]
    resolved_edges: usize,
    #[serde(rename = "graphHash")]
    graph_hash: &'a str,
}

#[derive(Serialize)]
struct CentralityParameters {
    types: Option<Vec<&'static str>>,
    iterations: usize,
    limit: usize,
}

#[derive(Serialize)]
struct Rankings<'a> {
    #[serde(rename = "pageRank")]
    page_rank: Vec<CentralityRow<'a>>,
    bridges: Vec<CentralityRow<'a>>,
    authorities: Vec<CentralityRow<'a>>,
    hubs: Vec<CentralityRow<'a>>,
}

#[derive(Serialize)]
pub struct CentralityAnswer<'a> {
    operation: &'static str,
    graph: CentralityGraph<'a>,
    parameters: CentralityParameters,
    rankings: Rankings<'a>,
}

pub fn centrality<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<CentralityAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(DEFAULT_LIMIT);
    let iterations = request.iterations.unwrap_or(DEFAULT_ITERATIONS);
    let types = RelationSet::parse(request.types.as_deref(), "types")?;
    let count = graph.nodes().len();
    let selected: Vec<EdgeId> = graph
        .edge_ids()
        .filter(|id| {
            let edge = graph.edge(*id);
            edge.is_resolved() && allowed(types.as_ref(), edge.via)
        })
        .collect();
    let mut outgoing: Vec<Vec<NodeId>> = vec![Vec::new(); count];
    for id in &selected {
        let edge = graph.edge(*id);
        let Some(to) = edge.to() else { continue };
        if let Some(list) = outgoing.get_mut(edge.from.index()) {
            list.push(to);
        }
    }
    let mut in_degrees = vec![0_usize; count];
    for list in &mut outgoing {
        list.sort_unstable();
        list.dedup();
        for target in list.iter() {
            if let Some(slot) = in_degrees.get_mut(target.index()) {
                *slot += 1;
            }
        }
    }
    let scores = page_rank(graph, &outgoing, iterations);
    let standings: Vec<Standing> = (0..count)
        .map(|index| Standing {
            in_degree: in_degrees.get(index).copied().unwrap_or(0),
            out_degree: outgoing.get(index).map_or(0, Vec::len),
            page_rank: round_score(scores.get(index).copied().unwrap_or(0.0)),
        })
        .collect();
    let standing = |id: NodeId| {
        standings.get(id.index()).copied().unwrap_or(Standing {
            in_degree: 0,
            out_degree: 0,
            page_rank: 0.0,
        })
    };
    let ranked: Vec<NodeId> = {
        let mut ids: Vec<NodeId> = graph.node_ids().collect();
        ids.sort_by(|left, right| by_rank(graph, &standings, *left, *right));
        ids
    };
    let top = |key: &dyn Fn(Standing) -> usize| -> Vec<CentralityRow<'a>> {
        let mut ids = ranked.clone();
        ids.sort_by_key(|id| std::cmp::Reverse(key(standing(*id))));
        ids.into_iter()
            .take(limit)
            .map(|id| row(graph, id, standing(id)))
            .collect()
    };
    let bridges = top(&Standing::bridge_score);
    let authorities = top(&|standing| standing.in_degree);
    let hubs = top(&|standing| standing.out_degree);
    let page_rank_rows: Vec<CentralityRow<'a>> = ranked
        .iter()
        .take(limit)
        .map(|id| row(graph, *id, standing(*id)))
        .collect();
    Ok(CentralityAnswer {
        operation: "centrality",
        graph: CentralityGraph {
            nodes: count,
            edges: graph.edges().len(),
            resolved_edges: selected.len(),
            graph_hash: graph.graph_hash(),
        },
        parameters: CentralityParameters {
            types: types.as_ref().map(RelationSet::sorted_names),
            iterations,
            limit,
        },
        rankings: Rankings {
            page_rank: page_rank_rows,
            bridges,
            authorities,
            hubs,
        },
    })
}
