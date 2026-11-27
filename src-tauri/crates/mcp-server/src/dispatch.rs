//! `tools/call`: the checks every call passes, then the handler, then the answer's envelope. It is
//! `callTool` of `mcp/src/index.js` and the argument checks of `mcp/src/server/validate.mjs`.
//!
//! The order is load-bearing: the read-only refusal comes before the arguments are read, so a
//! write under `OATLAS_READ_ONLY` is refused whatever it carries; the arguments are checked before
//! the handler, so an unknown argument is named even for a tool this build has not ported.

use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::envelope::{failure, ok, ToolError};
use crate::js_text::{is_js_line_terminator, js_trim, sort_utf16};
use crate::json::{to_json, Object, Value};
use crate::session::Session;
use crate::suggestions::closest_allowed_value;
use crate::surface::Surface;
use crate::tools;

/// What a handler can see of the call it answers.
pub struct CallContext<'a> {
    pub session: &'a Arc<Session>,
    /// Set when the client cancels the request or ends the session.
    pub cancelled: &'a AtomicBool,
}

impl CallContext<'_> {
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst) || self.session.is_closed()
    }
}

/// The `tools/call` result for `name` called with `arguments`.
pub fn call_tool(context: &CallContext<'_>, name: &str, arguments: Option<Object>) -> Value {
    let surface = Surface::embedded();
    let outcome = catch_unwind(AssertUnwindSafe(|| {
        run_checked(context, surface, name, arguments)
    }))
    .unwrap_or_else(|payload| Err(unexpected_stop(name, payload.as_ref())));
    let response = match outcome {
        Ok(result) => ok(result),
        Err(error) => failure(&error),
    };
    with_retired_tool_note(surface, name, response)
}

fn unexpected_stop(name: &str, payload: &(dyn std::any::Any + Send)) -> ToolError {
    let detail = payload
        .downcast_ref::<&str>()
        .map(|text| (*text).to_string())
        .or_else(|| payload.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "no detail".to_string());
    ToolError::with_code(
        format!("Tool \"{name}\" stopped unexpectedly: {detail}"),
        "tool_error",
    )
}

fn run_checked(
    context: &CallContext<'_>,
    surface: &Surface,
    name: &str,
    arguments: Option<Object>,
) -> Result<Value, ToolError> {
    let modes = &context.session.config.modes;
    // Reject a known write tool even when the caller's cached `tools/list` still shows it; an
    // unknown name reaches the unknown-tool error below.
    if modes.read_only && surface.tool(name).is_some() && !surface.is_read_tool(name) {
        return Err(ToolError::new(format!(
            "Tool \"{name}\" is unavailable: server is in read-only mode (OATLAS_READ_ONLY). Only read tools are exposed."
        )));
    }
    let arguments = normalize_tool_arguments(surface, arguments, name)?;
    // The write checkpoint (consent) sits here, before the handler, so a tool added later is
    // covered by not being a read tool; it arrives with the safety family.
    match tools::call(context, name, &arguments) {
        Some(result) => result,
        None => Err(unported_or_unknown(surface, name)),
    }
}

#[cfg(feature = "test-hooks")]
fn unported_or_unknown(surface: &Surface, name: &str) -> ToolError {
    if surface.tool(name).is_some() {
        ToolError::with_code(
            format!("Tool \"{name}\" is not ported to the Rust server yet."),
            "not_ported",
        )
    } else {
        unknown_tool_error(surface, name)
    }
}

#[cfg(not(feature = "test-hooks"))]
fn unported_or_unknown(surface: &Surface, name: &str) -> ToolError {
    unknown_tool_error(surface, name)
}

fn unknown_tool_error(surface: &Surface, name: &str) -> ToolError {
    let allowed = surface.allowed_tool_names();
    // A name that is itself allowed reaches here only while a tool is not ported; naming it as its
    // own nearest match would be noise.
    let suggestion = closest_allowed_value(name, &allowed)
        .filter(|nearest| nearest != name)
        .map(|nearest| format!(" Did you mean \"{nearest}\"?"))
        .unwrap_or_default();
    ToolError::new(format!(
        "Unknown tool: {name}.{suggestion} Allowed tools: {}.",
        allowed.join(", ")
    ))
}

/// A retired tool still answers, so an agent following older instructions keeps working, with a
/// note naming its replacement. A failure carries no note.
fn with_retired_tool_note(surface: &Surface, name: &str, mut response: Value) -> Value {
    let Some(replacement) = surface.retired_replacement(name) else {
        return response;
    };
    if response.get("isError").and_then(Value::as_bool) == Some(true) {
        return response;
    }
    let note = Value::object([
        ("type", Value::string("text")),
        ("text", Value::string(format!("{name} is retired from tools/list and will be removed; its replacement is {replacement}."))),
    ]);
    if let Value::Object(object) = &mut response {
        let mut content = object
            .get("content")
            .and_then(Value::as_array)
            .map(<[Value]>::to_vec)
            .unwrap_or_default();
        content.push(note);
        object.insert("content", Value::Array(content));
    }
    response
}

/// `normalizeToolArguments`: the arguments as an object, with an unknown argument refused by name
/// and, for a known tool, a blank or multi-line value of a non-blank string argument refused.
pub fn normalize_tool_arguments(
    surface: &Surface,
    arguments: Option<Object>,
    tool_name: &str,
) -> Result<Object, ToolError> {
    let arguments = arguments.unwrap_or_default();
    let Some(tool) = surface.tool(tool_name) else {
        return Ok(arguments);
    };
    let unknown: Vec<&str> = arguments
        .keys()
        .filter(|key| !tool.argument_names.iter().any(|allowed| allowed == key))
        .collect();
    if !unknown.is_empty() {
        let mut allowed_names = tool.argument_names.clone();
        sort_utf16(&mut allowed_names);
        let allowed_text = if allowed_names.is_empty() {
            "no arguments".to_string()
        } else {
            allowed_names.join(", ")
        };
        let mut received_names: Vec<String> = arguments.keys().map(str::to_string).collect();
        sort_utf16(&mut received_names);
        let received_text = if received_names.is_empty() {
            "none".to_string()
        } else {
            received_names.join(", ")
        };
        if let [key] = unknown.as_slice() {
            let suggestion = closest_allowed_value(key, &allowed_names)
                .map(|nearest| format!(" Did you mean \"{nearest}\"?"))
                .unwrap_or_default();
            return Err(ToolError::new(format!(
                "Unknown argument \"{key}\" for {tool_name}.{suggestion} Allowed arguments: {allowed_text}. Received arguments: {received_text}."
            )));
        }
        let unknown_text = unknown
            .iter()
            .map(|key| match closest_allowed_value(key, &allowed_names) {
                Some(nearest) => format!("\"{key}\" (did you mean \"{nearest}\"?)"),
                None => format!("\"{key}\""),
            })
            .collect::<Vec<_>>()
            .join(", ");
        return Err(ToolError::new(format!(
            "Unknown arguments for {tool_name}: {unknown_text}. Allowed arguments: {allowed_text}. Received arguments: {received_text}."
        )));
    }
    for name in surface.top_level_non_blank_arguments(tool_name) {
        if let Some(Value::String(value)) = arguments.get(name) {
            require_non_blank(value, name)?;
        }
    }
    Ok(arguments)
}

/// A top-level string argument whose contract is non-blank: the specific messages first, then the
/// pattern's own refusal of a line break inside the value.
fn require_non_blank(value: &str, name: &str) -> Result<(), ToolError> {
    let trimmed = js_trim(value);
    if trimmed.is_empty() {
        return Err(ToolError::new(format!(
            "{name} must be a non-empty string."
        )));
    }
    if trimmed != value {
        return Err(ToolError::new(format!(
            "{name} must not have leading or trailing whitespace. Example {name}: {}.",
            to_json(&Value::string(trimmed))
        )));
    }
    if value.contains('\0') {
        return Err(ToolError::new(format!(
            "{name} must not contain a null byte."
        )));
    }
    if let Some(terminator) = value
        .chars()
        .find(|character| is_js_line_terminator(*character))
    {
        return Err(ToolError::new(format!(
            "{name} must be a single line: it contains U+{:04X}, a control or invisible formatting character that breaks a line.",
            u32::from(terminator)
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::parse;

    fn args(text: &str) -> Option<Object> {
        parse(text).expect("parses").as_object().cloned()
    }

    fn message(result: Result<Object, ToolError>) -> String {
        result.expect_err("refused").message
    }

    #[test]
    fn one_unknown_argument_is_named_with_the_nearest_allowed_one() {
        let surface = Surface::embedded();
        assert_eq!(
            message(normalize_tool_arguments(surface, args(r#"{"limt":1}"#), "list_concepts")),
            "Unknown argument \"limt\" for list_concepts. Did you mean \"limit\"? Allowed arguments: domain, kind, limit, offset, since, summary. Received arguments: limt."
        );
    }

    #[test]
    fn several_unknown_arguments_each_get_their_own_hint() {
        let surface = Surface::embedded();
        assert_eq!(
            message(normalize_tool_arguments(surface, args(r#"{"bogus":1,"limt":2}"#), "list_concepts")),
            "Unknown arguments for list_concepts: \"bogus\", \"limt\" (did you mean \"limit\"?). Allowed arguments: domain, kind, limit, offset, since, summary. Received arguments: bogus, limt."
        );
    }

    #[test]
    fn a_tool_with_no_arguments_says_so() {
        let surface = Surface::embedded();
        assert_eq!(
            message(normalize_tool_arguments(surface, args(r#"{"x":1}"#), "git_status")),
            "Unknown argument \"x\" for git_status. Allowed arguments: no arguments. Received arguments: x."
        );
    }

    #[test]
    fn an_unknown_tool_passes_through_to_the_unknown_tool_error() {
        let surface = Surface::embedded();
        assert!(normalize_tool_arguments(surface, args(r#"{"anything":1}"#), "nope").is_ok());
        let error = unknown_tool_error(surface, "list_concept");
        assert!(error.message.starts_with("Unknown tool: list_concept. Did you mean \"list_concepts\"? Allowed tools: absorb_document, add_concepts,"));
        assert!(error.message.ends_with("validate_wiki."));
    }

    #[test]
    fn a_non_blank_string_argument_refuses_blank_padded_and_multi_line_values() {
        assert_eq!(
            require_non_blank("  ", "slug").expect_err("blank").message,
            "slug must be a non-empty string."
        );
        assert_eq!(
            require_non_blank(" a", "slug").expect_err("padded").message,
            "slug must not have leading or trailing whitespace. Example slug: \"a\"."
        );
        assert_eq!(
            require_non_blank("a\0b", "slug").expect_err("null").message,
            "slug must not contain a null byte."
        );
        assert_eq!(
            require_non_blank("a\u{2028}b", "slug").expect_err("separator").message,
            "slug must be a single line: it contains U+2028, a control or invisible formatting character that breaks a line."
        );
        assert!(require_non_blank("a b", "slug").is_ok());
    }
}
