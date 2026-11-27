//! `match_nodes`: the nodes that meet every condition given, most connected first. A scan: it says
//! how many matched and lists the first `limit`, and suggests the calls that prove the first row.

use std::cmp::Ordering;

use serde::Serialize;

use super::follow_up::NodeFollowUp;
use super::graph_summary::DegreeRow;
use super::selection_request::{NodeSort, SelectionArguments};
use crate::compiled_graph::{CompiledGraph, Node, NodeId};
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;
use vault_document::frontmatter::Value;

const DEFAULT_LIMIT: usize = 100;

/// The conditions of one call, `None` meaning any.
struct NodeFilters<'a> {
    arguments: &'a SelectionArguments,
    slug_contains: Option<String>,
}

impl NodeFilters<'_> {
    fn accepts(&self, node: &Node) -> bool {
        let arguments = self.arguments;
        let (in_degree, out_degree) = (node.in_degree as usize, node.out_degree as usize);
        let degree = in_degree + out_degree;
        if arguments.kind.as_deref().is_some_and(|kind| node.kind() != kind) {
            return false;
        }
        if let Some(domain) = &arguments.domain {
            if !matches!(node.domain(), Some(Value::Text(text)) if text == domain) {
                return false;
            }
        }
        if let Some(needle) = &self.slug_contains {
            if !node.slug().to_lowercase().contains(needle.as_str()) {
                return false;
            }
        }
        arguments.min_degree.is_none_or(|least| degree >= least)
            && arguments.max_degree.is_none_or(|most| degree <= most)
            && arguments.min_in_degree.is_none_or(|least| in_degree >= least)
            && arguments.min_out_degree.is_none_or(|least| out_degree >= least)
            && arguments
                .has_incoming
                .is_none_or(|wanted| (in_degree > 0) == wanted)
            && arguments
                .has_outgoing
                .is_none_or(|wanted| (out_degree > 0) == wanted)
    }
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
    #[serde(rename = "slugContains")]
    slug_contains: Option<String>,
    #[serde(rename = "minDegree")]
    min_degree: Option<usize>,
    #[serde(rename = "maxDegree")]
    max_degree: Option<usize>,
    #[serde(rename = "minInDegree")]
    min_in_degree: Option<usize>,
    #[serde(rename = "minOutDegree")]
    min_out_degree: Option<usize>,
    #[serde(rename = "hasIncoming")]
    has_incoming: Option<bool>,
    #[serde(rename = "hasOutgoing")]
    has_outgoing: Option<bool>,
    sort: &'static str,
}

#[derive(Serialize)]
pub struct MatchNodesAnswer<'a> {
    operation: &'static str,
    filters: EchoedFilters,
    #[serde(rename = "totalMatches")]
    total_matches: usize,
    limited: bool,
    nodes: Vec<DegreeRow<'a>>,
    #[serde(rename = "followUp", skip_serializing_if = "Option::is_none")]
    follow_up: Option<NodeFollowUp<'a>>,
}

pub fn match_nodes<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<MatchNodesAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(DEFAULT_LIMIT);
    let arguments = &request.selection.arguments;
    let sort = arguments.sort.unwrap_or_default();
    let slug_contains = arguments.slug_contains.as_deref().map(str::to_lowercase);
    let filters = NodeFilters {
        arguments,
        slug_contains,
    };
    let mut matched: Vec<NodeId> = graph
        .node_ids()
        .filter(|id| filters.accepts(graph.node(*id)))
        .collect();
    let total = matched.len();
    matched.sort_by(|left, right| by_sort(graph, sort, *left, *right));
    matched.truncate(limit);
    let rows: Vec<DegreeRow<'a>> = matched
        .iter()
        .map(|id| DegreeRow::of(graph, *id))
        .collect();
    let follow_up = matched
        .first()
        .map(|first| NodeFollowUp::about(graph.node(*first).slug()));
    Ok(MatchNodesAnswer {
        operation: "match_nodes",
        filters: EchoedFilters {
            kind: arguments.kind.clone(),
            domain: arguments.domain.clone(),
            slug_contains: filters.slug_contains.clone(),
            min_degree: arguments.min_degree,
            max_degree: arguments.max_degree,
            min_in_degree: arguments.min_in_degree,
            min_out_degree: arguments.min_out_degree,
            has_incoming: arguments.has_incoming,
            has_outgoing: arguments.has_outgoing,
            sort: sort.name(),
        },
        total_matches: total,
        limited: total > limit,
        nodes: rows,
        follow_up,
    })
}
