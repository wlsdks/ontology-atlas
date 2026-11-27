//! `centrality`: which nodes the graph leans on. PageRank with a damping of 0.85 and a fixed number
//! of rounds; authorities (most distinct dependents), hubs (most distinct dependencies) and bridges
//! (both at once).

use std::cmp::Ordering;

use answer_format::collation::compare_text;
use serde::Serialize;
use vault_document::frontmatter::Value;

use crate::compiled_graph::{CompiledGraph, EdgeId, NodeId};
use crate::query::clusters::DEFAULT_ITERATIONS;
use crate::query::query_error::QueryError;
use crate::query::relation_set::{allowed, RelationSet};
use crate::query::request::QueryRequest;

const DAMPING: f64 = 0.85;
const DEFAULT_LIMIT: usize = 10;

/// The share of rank each node holds after `iterations` rounds. A node with no outgoing edge
/// spreads its rank over every node.
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

#[derive(Serialize, Clone)]
struct CentralityRow<'a> {
    uid: &'a str,
    slug: &'a str,
    kind: &'a str,
    title: &'a Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    domain: Option<&'a Value>,
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

fn by_rank(left: &CentralityRow<'_>, right: &CentralityRow<'_>) -> Ordering {
    right
        .page_rank
        .partial_cmp(&left.page_rank)
        .unwrap_or(Ordering::Equal)
        .then_with(|| right.degree.cmp(&left.degree))
        .then_with(|| compare_text(left.slug, right.slug))
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
    let mut incoming: Vec<Vec<NodeId>> = vec![Vec::new(); count];
    let mut seen: std::collections::HashSet<(NodeId, NodeId)> = std::collections::HashSet::new();
    for id in &selected {
        let edge = graph.edge(*id);
        let Some(to) = edge.to() else { continue };
        if !seen.insert((edge.from, to)) {
            continue;
        }
        if let Some(list) = outgoing.get_mut(edge.from.index()) {
            list.push(to);
        }
        if let Some(list) = incoming.get_mut(to.index()) {
            list.push(edge.from);
        }
    }
    let scores = page_rank(graph, &outgoing, iterations);
    let mut rows: Vec<CentralityRow<'a>> = graph
        .node_ids()
        .map(|id| {
            let node = graph.node(id);
            let in_degree = incoming.get(id.index()).map_or(0, Vec::len);
            let out_degree = outgoing.get(id.index()).map_or(0, Vec::len);
            CentralityRow {
                uid: &node.uid,
                slug: &node.slug,
                kind: &node.kind,
                title: &node.title,
                domain: node.domain.as_ref(),
                in_degree,
                out_degree,
                degree: in_degree + out_degree,
                page_rank: round_score(scores.get(id.index()).copied().unwrap_or(0.0)),
                bridge_score: in_degree * out_degree,
            }
        })
        .collect();
    rows.sort_by(by_rank);
    let top = |mut sorted: Vec<CentralityRow<'a>>,
               order: &dyn Fn(&CentralityRow<'a>, &CentralityRow<'a>) -> Ordering| {
        sorted.sort_by(order);
        sorted.truncate(limit);
        sorted
    };
    let bridges = top(rows.clone(), &|left, right| {
        right
            .bridge_score
            .cmp(&left.bridge_score)
            .then_with(|| by_rank(left, right))
    });
    let authorities = top(rows.clone(), &|left, right| {
        right
            .in_degree
            .cmp(&left.in_degree)
            .then_with(|| by_rank(left, right))
    });
    let hubs = top(rows.clone(), &|left, right| {
        right
            .out_degree
            .cmp(&left.out_degree)
            .then_with(|| by_rank(left, right))
    });
    let mut page_rank_rows = rows;
    page_rank_rows.truncate(limit);
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
