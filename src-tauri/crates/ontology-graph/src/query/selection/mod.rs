//! The operations that pick nodes out of the graph or summarize it: `overview`, `schema`, `facets`,
//! `components`, `communities` and `centrality`.

mod centrality;
mod clusters;
mod graph_summary;

use serde::Serialize;

use crate::compiled_graph::CompiledGraph;
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SelectionOperation {
    Overview,
    Schema,
    Facets,
    Components,
    Communities,
    Centrality,
}

impl SelectionOperation {
    pub const fn name(self) -> &'static str {
        match self {
            Self::Overview => "overview",
            Self::Schema => "schema",
            Self::Facets => "facets",
            Self::Components => "components",
            Self::Communities => "communities",
            Self::Centrality => "centrality",
        }
    }
}

#[allow(
    clippy::large_enum_variant,
    reason = "an answer is built once, written out and dropped; boxing each would only add steps"
)]
#[derive(Serialize)]
#[serde(untagged)]
pub enum SelectionAnswer<'a> {
    Overview(graph_summary::OverviewAnswer<'a>),
    Schema(graph_summary::SchemaAnswer<'a>),
    Facets(graph_summary::FacetsAnswer<'a>),
    Components(clusters::ComponentsAnswer<'a>),
    Communities(clusters::CommunitiesAnswer<'a>),
    Centrality(centrality::CentralityAnswer<'a>),
}

pub fn run<'a>(
    graph: &'a CompiledGraph,
    operation: SelectionOperation,
    request: &QueryRequest,
) -> Result<SelectionAnswer<'a>, QueryError> {
    Ok(match operation {
        SelectionOperation::Overview => {
            SelectionAnswer::Overview(graph_summary::overview(graph, request)?)
        }
        SelectionOperation::Schema => {
            SelectionAnswer::Schema(graph_summary::schema(graph, request)?)
        }
        SelectionOperation::Facets => {
            SelectionAnswer::Facets(graph_summary::facets(graph, request)?)
        }
        SelectionOperation::Components => {
            SelectionAnswer::Components(clusters::components(graph, request)?)
        }
        SelectionOperation::Communities => {
            SelectionAnswer::Communities(clusters::communities(graph, request)?)
        }
        SelectionOperation::Centrality => {
            SelectionAnswer::Centrality(centrality::centrality(graph, request)?)
        }
    })
}
