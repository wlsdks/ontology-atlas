//! `compile_ontology`: the nodes, edges and issues of the vault as one graph, a summary of it by
//! default and its arrays when they are asked for.

use ontology_graph::{compile_answer, CompileRequest, COMPILE_PAGE_MAX};

use super::argument_checks::{
    optional_boolean, optional_non_negative_integer, optional_positive_integer,
};
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::ToolError;

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "each number was checked to be a whole number that is not negative"
)]
fn count(number: f64) -> usize {
    number as usize
}

pub fn call(context: &CallContext<'_>, arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let page_max = Some(COMPILE_PAGE_MAX as f64);
    let request = CompileRequest {
        include_indexes: optional_boolean(arguments, "includeIndexes")?,
        summary: optional_boolean(arguments, "summary")?,
        full: optional_boolean(arguments, "full")?,
        nodes_limit: optional_positive_integer(arguments, "nodesLimit", page_max)?.map(count),
        nodes_offset: optional_non_negative_integer(arguments, "nodesOffset", None)?.map(count),
        edges_limit: optional_positive_integer(arguments, "edgesLimit", page_max)?.map(count),
        edges_offset: optional_non_negative_integer(arguments, "edgesOffset", None)?.map(count),
    };
    let graph = context.compiled_graph().read(context)?;
    ToolOutput::json(&compile_answer(&graph, &request))
}
