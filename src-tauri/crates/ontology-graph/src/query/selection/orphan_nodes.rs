//! `match_nodes` with `hasIncoming: false`: the orphan question, answered from the vault's files
//! rather than the compiled graph. A vault whose compile fails closed on one invalid `uid` still
//! answers, and a short reference that several nodes share counts as a reference to each of them,
//! as the graph keys are read everywhere else.

use std::cmp::Ordering;

use answer_format::collation::compare_text;
use serde::Serialize;
use vault_document::{find_orphans, LoadedDocument, Orphan, OrphanFilter, ReferenceIndex};

use super::follow_up::NodeFollowUp;
use super::match_nodes::Pagination;
use super::selection_request::NodeSort;
use crate::query::operation_defaults::MATCH_NODES_LIMIT;
use crate::query::request::QueryRequest;

#[derive(Serialize)]
struct OrphanFilters<'a> {
    kind: Option<&'a str>,
    domain: Option<&'a str>,
    #[serde(rename = "hasIncoming")]
    has_incoming: bool,
    #[serde(rename = "hasOutgoing")]
    has_outgoing: Option<bool>,
    #[serde(rename = "excludeKinds")]
    exclude_kinds: Vec<String>,
    sort: &'static str,
}

#[derive(Serialize)]
pub struct OrphanNodesAnswer<'a> {
    operation: &'static str,
    source: &'static str,
    filters: OrphanFilters<'a>,
    #[serde(rename = "totalMatches")]
    total_matches: usize,
    limited: bool,
    pagination: Pagination,
    nodes: Vec<Orphan<'a>>,
    #[serde(rename = "followUp", skip_serializing_if = "Option::is_none")]
    follow_up: Option<NodeFollowUp<'a>>,
}

/// Whether a call is the orphan question: `match_nodes` asking for nodes nothing points at.
pub fn asks_for_orphans(request: &QueryRequest) -> bool {
    request.operation.name() == "match_nodes"
        && request.selection.arguments.has_incoming == Some(false)
}

/// Every orphan, most connected first by `sort` and then by slug, paged by `limit` and `offset`.
pub fn orphan_nodes<'a>(
    documents: &'a [LoadedDocument],
    request: &'a QueryRequest,
) -> OrphanNodesAnswer<'a> {
    let arguments = &request.selection.arguments;
    let filter = OrphanFilter {
        kind: arguments.kind.as_deref(),
        domain: arguments.domain.as_deref(),
        has_outgoing: arguments.has_outgoing,
        excluded_kinds: arguments.exclude_kinds.as_deref(),
    };
    let index = ReferenceIndex::new(documents);
    let mut orphans = find_orphans(documents, &index, &filter);
    let sort = arguments.sort.unwrap_or_default();
    orphans.sort_by(|left, right| {
        let by_connections = match sort {
            NodeSort::Degree | NodeSort::OutDegree => right.out_degree.cmp(&left.out_degree),
            NodeSort::InDegree | NodeSort::Slug => Ordering::Equal,
        };
        by_connections.then_with(|| compare_text(left.slug, right.slug))
    });
    let limit = request.limit.unwrap_or(MATCH_NODES_LIMIT);
    let offset = arguments.offset.unwrap_or(0);
    let total = orphans.len();
    let page: Vec<Orphan<'a>> = orphans.into_iter().skip(offset).take(limit).collect();
    let pagination = Pagination::of(offset, limit, page.len(), total);
    let follow_up = page.first().map(|first| NodeFollowUp::about(first.slug));
    OrphanNodesAnswer {
        operation: "match_nodes",
        source: "vault_files",
        filters: OrphanFilters {
            kind: filter.kind,
            domain: filter.domain,
            has_incoming: false,
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
