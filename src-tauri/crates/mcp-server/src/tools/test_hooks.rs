//! Tools only a test build has, to exercise what a real tool would: an unexpected stop, a call that
//! waits for a person, and arguments as the handler receives them.

use std::time::{Duration, Instant};

use crate::dispatch::CallContext;
use crate::envelope::ToolError;
use crate::json::{Object, Value};

/// A held call gives up after this, so a test that forgets to cancel it still ends.
const HOLD_LIMIT: Duration = Duration::from_secs(20);
const HOLD_POLL: Duration = Duration::from_millis(5);

pub fn call(
    context: &CallContext<'_>,
    name: &str,
    arguments: &Object,
) -> Option<Result<Value, ToolError>> {
    match name {
        "__test_panic" => Some(stop_unexpectedly()),
        "__test_hold" => Some(Ok(hold(context))),
        "__test_write_marker" => Some(write_marker(arguments)),
        "__test_echo" => Some(Ok(Value::object([(
            "echo",
            Value::Object(arguments.clone()),
        )]))),
        _ => None,
    }
}

#[allow(
    clippy::panic,
    reason = "the point of this test-only tool is to panic inside a handler"
)]
fn stop_unexpectedly() -> Result<Value, ToolError> {
    panic!("planted handler failure");
}

/// Waits off the queue until the call is cancelled or the session ends, as a consent question
/// does, and says which.
fn hold(context: &CallContext<'_>) -> Value {
    let started = Instant::now();
    let cancelled = context.session.wait_off_queue(|| {
        while !context.is_cancelled() && started.elapsed() < HOLD_LIMIT {
            std::thread::sleep(HOLD_POLL);
        }
        context.is_cancelled()
    });
    Value::object([
        ("held", Value::Bool(true)),
        ("cancelled", Value::Bool(cancelled)),
    ])
}

/// Creates the file named by the `path` argument, so a test can see that a handler ran.
fn write_marker(arguments: &Object) -> Result<Value, ToolError> {
    let path = arguments
        .get("path")
        .and_then(Value::as_str)
        .ok_or_else(|| ToolError::new("path must be a string."))?;
    std::fs::write(path, "ran").map_err(|error| ToolError::new(format!("{error}")))?;
    Ok(Value::object([("written", Value::Bool(true))]))
}
