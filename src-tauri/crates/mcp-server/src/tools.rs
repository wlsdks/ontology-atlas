//! The tool handlers. A family of tools joins the server by adding its names to [`call`]; a tool
//! absent from it is, in the release build, absent from dispatch: the JavaScript server stays the
//! shipped one until every tool answers here and the differential harness finds them equal.

use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::ToolError;

mod argument_checks;
mod concept_row;
mod connection_info;
mod find_backlinks;
mod find_orphans;
mod get_concepts;
mod list_concepts;
mod query_concepts;
mod read_vault;
#[cfg(feature = "test-hooks")]
mod test_hooks;

/// The result of tool `name`, or `None` when this build does not handle it.
pub fn call(
    context: &CallContext<'_>,
    name: &str,
    arguments: &Arguments,
) -> Option<Result<ToolOutput, ToolError>> {
    #[cfg(feature = "test-hooks")]
    if let Some(result) = test_hooks::call(context, name, arguments) {
        return Some(result);
    }
    match name {
        "connection_info" => Some(connection_info::call(context, arguments)),
        "list_concepts" => Some(list_concepts::call(context, arguments)),
        "get_concepts" => Some(get_concepts::call(context, arguments)),
        "find_backlinks" => Some(find_backlinks::call(context, arguments)),
        "find_orphans" => Some(find_orphans::call(context, arguments)),
        "query_concepts" => Some(query_concepts::call(context, arguments)),
        _ => None,
    }
}
