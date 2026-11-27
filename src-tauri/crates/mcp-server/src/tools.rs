//! The tool handlers. A family of tools joins the server by adding its names to [`call`]; a tool
//! absent from it is, in the release build, absent from dispatch: the JavaScript server stays the
//! shipped one until every tool answers here and the differential harness finds them equal.

use crate::dispatch::CallContext;
use crate::envelope::ToolError;
use crate::json::{Object, Value};

#[cfg(feature = "test-hooks")]
mod test_hooks;

/// The result of tool `name`, or `None` when this build does not handle it.
pub fn call(
    context: &CallContext<'_>,
    name: &str,
    arguments: &Object,
) -> Option<Result<Value, ToolError>> {
    #[cfg(feature = "test-hooks")]
    if let Some(result) = test_hooks::call(context, name, arguments) {
        return Some(result);
    }
    let _ = (context, name, arguments);
    None
}
