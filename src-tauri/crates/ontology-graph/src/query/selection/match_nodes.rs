//! `match_nodes`: the nodes that meet every condition given, most connected first. A scan: it says
//! how many matched and lists the first `limit`, and suggests the calls that prove the first row.

use std::cmp::Ordering;

use serde::Serialize;

use super::follow_up::NodeFollowUp;
use super::graph_summary::DegreeRow;
use super::selection_request::{NodeSort, SelectionArguments};
use crate::compiled_graph::{CompiledGraph, Node, NodeId};
use crate::query::operation_defaults::MATCH_NODES_LIMIT;
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;
use vault_document::frontmatter::Value;

/// Whether a node meets the conditions of a call, `None` meaning any. `excludeKinds` is applied by
/// `match_nodes` alone: a plan counts the nodes these conditions let through.
fn accepts(arguments: &SelectionArguments, node: &Node) -> bool {
    let (in_degree, out_degree) = (node.in_degree as usize, node.out_degree as usize);
    if arguments
        .kind
        .as_deref()
        .is_some_and(|kind| node.kind() != kind)
    {
        return false;
    }
    if let Some(domain) = &arguments.domain {
        if !matches!(node.domain(), Some(Value::Text(text)) if text == domain) {
            return false;
        }
    }
    arguments
        .has_incoming
        .is_none_or(|wanted| (in_degree > 0) == wanted)
        && arguments
            .has_outgoing
            .is_none_or(|wanted| (out_degree > 0) == wanted)
}

fn by_sort(graph: &CompiledGraph, sort: NodeSort, left: NodeId, right: NodeId) -> Ordering {
    let (left_node, right_node) = (graph.node(left), graph.node(right));
    let measure = |node: &Node| match sort {
        NodeSort::InDegree => node.in_degree,
        NodeSort::OutDegree => node.out_degree,
        NodeSort::Degree | NodeSort::Slug => node.degree(),
    };
    if sort == NodeSort::Slug {
        return left.cmp(&right);
    }
    measure(right_node)
        .cmp(&measure(left_node))
        .then_with(|| right_node.degree().cmp(&left_node.degree()))
        .then_with(|| left.cmp(&right))
}

#[derive(Serialize)]
struct EchoedFilters {
    kind: Option<String>,
    domain: Option<String>,
    #[serde(rename = "hasIncoming")]
    has_incoming: Option<bool>,
    #[serde(rename = "hasOutgoing")]
    has_outgoing: Option<bool>,
    #[serde(rename = "excludeKinds", skip_serializing_if = "Vec::is_empty")]
    exclude_kinds: Vec<String>,
    sort: &'static str,
}

/// Where the page sits in the whole match, and the offset that asks for the next one.
#[derive(Serialize)]
pub(super) struct Pagination {
    offset: usize,
    limit: usize,
    returned: usize,
    total: usize,
    #[serde(rename = "hasMore")]
    has_more: bool,
    #[serde(rename = "nextOffset")]
    next_offset: Option<usize>,
}

impl Pagination {
    pub(super) fn of(offset: usize, limit: usize, returned: usize, total: usize) -> Self {
        let has_more = offset + returned < total;
        Self {
            offset,
            limit,
            returned,
            total,
            has_more,
            next_offset: has_more.then_some(offset + returned),
        }
    }

    pub(super) fn has_more(&self) -> bool {
        self.has_more
    }
}

#[derive(Serialize)]
pub struct MatchNodesAnswer<'a> {
    operation: &'static str,
    filters: EchoedFilters,
    #[serde(rename = "totalMatches")]
    total_matches: usize,
    limited: bool,
    pagination: Pagination,
    nodes: Vec<DegreeRow<'a>>,
    #[serde(rename = "followUp", skip_serializing_if = "Option::is_none")]
    follow_up: Option<NodeFollowUp<'a>>,
}

/// How many nodes a call's conditions let through, which `query_plan` reports without ranking them.
pub(in crate::query) fn count_matching_nodes(
    graph: &CompiledGraph,
    request: &QueryRequest,
) -> usize {
    let arguments = &request.selection.arguments;
    graph
        .node_ids()
        .filter(|id| accepts(arguments, graph.node(*id)))
        .count()
}

/// `excludeKinds` without repeats, in the order sent.
fn distinct_kinds(arguments: &SelectionArguments) -> Vec<&str> {
    let mut kinds: Vec<&str> = Vec::new();
    for kind in arguments.exclude_kinds.iter().flatten() {
        if !kinds.contains(&kind.as_str()) {
            kinds.push(kind);
        }
    }
    kinds
}

pub fn match_nodes<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<MatchNodesAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(MATCH_NODES_LIMIT);
    let arguments = &request.selection.arguments;
    let offset = arguments.offset.unwrap_or(0);
    let sort = arguments.sort.unwrap_or_default();
    let excluded = distinct_kinds(arguments);
    let mut matched: Vec<NodeId> = graph
        .node_ids()
        .filter(|id| {
            let node = graph.node(*id);
            !excluded.contains(&node.kind()) && accepts(arguments, node)
        })
        .collect();
    let total = matched.len();
    matched.sort_by(|left, right| by_sort(graph, sort, *left, *right));
    let page: Vec<NodeId> = matched.into_iter().skip(offset).take(limit).collect();
    let has_more = offset + page.len() < total;
    let rows: Vec<DegreeRow<'a>> = page.iter().map(|id| DegreeRow::of(graph, *id)).collect();
    let follow_up = page
        .first()
        .map(|first| NodeFollowUp::about(graph.node(*first).slug()));
    Ok(MatchNodesAnswer {
        operation: "match_nodes",
        filters: EchoedFilters {
            kind: arguments.kind.clone(),
            domain: arguments.domain.clone(),
            has_incoming: arguments.has_incoming,
            has_outgoing: arguments.has_outgoing,
            exclude_kinds: excluded.into_iter().map(str::to_string).collect(),
            sort: sort.name(),
        },
        total_matches: total,
        limited: has_more,
        pagination: Pagination::of(offset, limit, page.len(), total),
        nodes: rows,
        follow_up,
    })
}
