//! The node an expansion starts from, named the way its operation reads the name. The operation and
//! `query_plan` both ask here, so a plan refuses the name an operation refuses and resolves the one
//! it resolves.

use super::builder_focus::slug_of_focus;
use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::node_resolution::resolve;
use crate::query::operation_defaults::{Expansion, StartName};
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;

pub(in crate::query) fn expansion_start(
    graph: &CompiledGraph,
    request: &QueryRequest,
    expansion: &Expansion,
) -> Result<NodeId, QueryError> {
    let name = match expansion.start {
        StartName::Slug => request.slug.clone(),
        StartName::SlugOrSeed => request.slug.clone().or_else(|| request.seed.clone()),
        StartName::FocusName => request
            .slug
            .as_deref()
            .or(request.seed.as_deref())
            .map(slug_of_focus),
    };
    resolve(graph, name.as_deref(), "slug")
}
