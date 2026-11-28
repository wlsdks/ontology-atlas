//! What `match_nodes` shares with the plan of it: how many nodes the conditions let through in the
//! compiled graph, and the pagination of a page. The answer itself is
//! `match_nodes_from_files.rs`.

use serde::Serialize;

use super::selection_request::SelectionArguments;
use crate::compiled_graph::{CompiledGraph, Node};
use crate::query::request::QueryRequest;
use vault_document::frontmatter::Value;

/// Whether a node meets the conditions of a call, `None` meaning any. `excludeKinds` is left to the
/// answer: a plan counts the nodes these conditions let through.
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
