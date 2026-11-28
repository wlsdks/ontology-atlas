//! `match_nodes`: the nodes that meet every condition given, most connected first, answered from
//! the vault's files rather than the compiled graph. A vault whose compile fails closed on one
//! invalid `uid` still answers, and the nodes with an incoming relation and those without one split
//! an unfiltered call exactly, because one engine answers them all.

use std::cmp::Ordering;

use answer_format::collation::compare_text;
use serde::Serialize;
use vault_document::{
    match_nodes_from_files, LoadedDocument, MatchFilter, MatchedNode, ReferenceIndex,
};

use super::follow_up::NodeFollowUp;
use super::match_nodes::Pagination;
use super::selection_request::NodeSort;
use crate::query::operation_defaults::MATCH_NODES_LIMIT;
use crate::query::request::QueryRequest;

#[derive(Serialize)]
struct EchoedFilters<'a> {
    kind: Option<&'a str>,
    domain: Option<&'a str>,
    #[serde(rename = "hasIncoming")]
    has_incoming: Option<bool>,
    #[serde(rename = "hasOutgoing")]
    has_outgoing: Option<bool>,
    #[serde(rename = "excludeKinds")]
    exclude_kinds: Vec<String>,
    sort: &'static str,
}

#[derive(Serialize)]
pub struct MatchNodesAnswer<'a> {
    operation: &'static str,
    source: &'static str,
    filters: EchoedFilters<'a>,
    #[serde(rename = "totalMatches")]
    total_matches: usize,
    limited: bool,
    pagination: Pagination,
    nodes: Vec<MatchedNode<'a>>,
    #[serde(rename = "followUp", skip_serializing_if = "Option::is_none")]
    follow_up: Option<NodeFollowUp<'a>>,
}

/// Whether a call is `match_nodes`, which the tool layer answers from the files.
pub fn is_match_nodes(request: &QueryRequest) -> bool {
    request.operation.name() == "match_nodes"
}

/// The order of two rows: the measure of `sort` first, then the degree unless that was the
/// measure, then the slug.
fn by_sort(sort: NodeSort, left: &MatchedNode<'_>, right: &MatchedNode<'_>) -> Ordering {
    let measure = |node: &MatchedNode<'_>| match sort {
        NodeSort::InDegree => node.in_degree,
        NodeSort::OutDegree => node.out_degree,
        NodeSort::Degree | NodeSort::Slug => node.degree,
    };
    if sort == NodeSort::Slug {
        return compare_text(left.slug, right.slug);
    }
    let order = measure(right).cmp(&measure(left));
    let order = if sort == NodeSort::Degree {
        order
    } else {
        order.then_with(|| right.degree.cmp(&left.degree))
    };
    order.then_with(|| compare_text(left.slug, right.slug))
}

/// The matches ordered by `sort`, paged by `limit` and `offset`.
pub fn match_nodes<'a>(
    documents: &'a [LoadedDocument],
    request: &'a QueryRequest,
) -> MatchNodesAnswer<'a> {
    let arguments = &request.selection.arguments;
    let filter = MatchFilter {
        kind: arguments.kind.as_deref(),
        domain: arguments.domain.as_deref(),
        has_incoming: arguments.has_incoming,
        has_outgoing: arguments.has_outgoing,
        excluded_kinds: arguments.exclude_kinds.as_deref(),
    };
    let index = ReferenceIndex::new(documents);
    let mut matched = match_nodes_from_files(documents, &index, &filter);
    let sort = arguments.sort.unwrap_or_default();
    matched.sort_by(|left, right| by_sort(sort, left, right));
    let limit = request.limit.unwrap_or(MATCH_NODES_LIMIT);
    let offset = arguments.offset.unwrap_or(0);
    let total = matched.len();
    let page: Vec<MatchedNode<'a>> = matched.into_iter().skip(offset).take(limit).collect();
    let pagination = Pagination::of(offset, limit, page.len(), total);
    let follow_up = page.first().map(|first| NodeFollowUp::about(first.slug));
    MatchNodesAnswer {
        operation: "match_nodes",
        source: "vault_files",
        filters: EchoedFilters {
            kind: filter.kind,
            domain: filter.domain,
            has_incoming: filter.has_incoming,
            has_outgoing: filter.has_outgoing,
            exclude_kinds: filter.excluded().into_iter().map(str::to_string).collect(),
            sort: sort.name(),
        },
        total_matches: total,
        limited: pagination.has_more(),
        pagination,
        nodes: page,
        follow_up,
    }
}
