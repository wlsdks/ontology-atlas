//! `tools/call`: the checks every call passes, then the handler, then the answer.
//!
//! The order is load-bearing: the read-only refusal comes before the arguments are read, so a write
//! under `OATLAS_READ_ONLY` is refused whatever it carries; the arguments are checked before the
//! handler, so an unknown argument is named even for a tool this build has not ported, and an
//! argument that holds half of a surrogate pair is refused by name before any handler sees it. A
//! handler that panics is caught here: the call is one failed answer and the session goes on.

use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use answer_format::json::quote;
use answer_format::utf16;
use answer_format::whitespace::{is_line_terminator, trim};

use crate::answer::{CallToolResult, ToolOutput};
use crate::arguments::Arguments;
use crate::audit::WriteRecord;
use crate::error::{ToolError, UnknownField};
use crate::protocol::{ClientAnswer, ServerRequestWait, Session};
use crate::runtime::Config;
use crate::suggestions::closest_allowed_value;
use crate::surface::Surface;
use crate::tools;
use crate::write_checkpoint::{self, Permit};
use crate::write_tool::WriteTool;

/// What a handler can see of the call it answers.
pub struct CallContext<'a> {
    session: &'a Arc<Session>,
    /// Set when the client cancels the request or ends the session.
    cancelled: &'a AtomicBool,
    can_ask_client: bool,
}

impl<'a> CallContext<'a> {
    pub(crate) fn new(session: &'a Arc<Session>, cancelled: &'a AtomicBool) -> Self {
        Self {
            session,
            cancelled,
            can_ask_client: session.client_capabilities().can_ask_client(),
        }
    }

    /// The write lock, taken after a person has said yes; see `write_checkpoint`.
    pub(crate) fn lock_writes(&self) -> std::sync::MutexGuard<'a, ()> {
        let session: &'a Session = self.session;
        session.lock_writes()
    }

    pub fn audit(&self) -> &crate::audit::AuditLog {
        self.session.audit()
    }

    /// What the reads have read of each vault file so far.
    pub fn documents(&self) -> &vault_document::DocumentCache {
        self.session.documents()
    }

    /// The compiled graph kept beside the document cache.
    pub fn compiled_graph(&self) -> &crate::tools::KeptGraph {
        self.session.graph()
    }

    pub fn config(&self) -> &Config {
        self.session.config()
    }

    /// The source lines served so far through `sourceReads`.
    pub fn source_reads(&self) -> &source_reads::SessionReads {
        self.session.source_reads()
    }

    /// Whether the client cancelled this request or ended the session.
    pub fn is_cancelled(&self) -> bool {
        self.was_cancelled() || self.session.is_closed()
    }

    /// Whether the client cancelled this request. A client that sent it and closed its input (a
    /// pipe) still waits for the answer, so this one does not count the end of the session.
    pub fn was_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    /// Whether the client announced it can put a question to a person, as it did at `initialize`.
    pub fn can_ask_client(&self) -> bool {
        self.can_ask_client
    }

    /// Runs `wait`, a call that blocks until a person answers, without holding up the other
    /// requests: another worker answers them meanwhile.
    pub fn wait_off_queue<R>(&self, wait: impl FnOnce() -> R) -> R {
        self.session.wait_off_queue(wait)
    }

    /// Puts a request to the client and waits off the queue for its answer, for at most `limit`;
    /// the wait also ends when this call is cancelled or the session ends.
    pub fn ask_client<T: serde::Serialize>(
        &self,
        method: &str,
        params: &T,
        limit: std::time::Duration,
    ) -> ClientAnswer {
        let wait = ServerRequestWait {
            limit,
            cancelled: self.cancelled,
        };
        self.wait_off_queue(|| self.session.ask_client(method, params, wait))
    }

    /// The name the client gave itself in `initialize`, empty before it has.
    pub fn client_name(&self) -> String {
        self.session.client_name()
    }
}

/// The `tools/call` result for `name` called with `arguments`.
pub fn call_tool(
    context: &CallContext<'_>,
    name: &str,
    arguments: Option<Arguments>,
) -> CallToolResult {
    let surface = Surface::embedded();
    let outcome = catch_unwind(AssertUnwindSafe(|| {
        run_checked(context, surface, name, arguments)
    }))
    .unwrap_or_else(|payload| Err(unexpected_stop(name, payload.as_ref())));
    let mut result = match outcome {
        Ok(output) => CallToolResult::success(output),
        Err(error) => CallToolResult::failure(&error),
    };
    // A retired tool still answers, so an agent following older instructions keeps working, with
    // a note naming its replacement. A failure carries no note.
    if let Some(replacement) = surface.retired_replacement(name) {
        if !result.is_failure() {
            result.push_note(format!(
                "{name} is retired from tools/list and will be removed; its replacement is {replacement}."
            ));
        }
    }
    result
}

fn panic_detail(payload: &(dyn std::any::Any + Send)) -> String {
    payload
        .downcast_ref::<&str>()
        .map(|text| (*text).to_string())
        .or_else(|| payload.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "no detail".to_string())
}

fn unexpected_stop(name: &str, payload: &(dyn std::any::Any + Send)) -> ToolError {
    let detail = panic_detail(payload);
    ToolError::failed(format!("Tool \"{name}\" stopped unexpectedly: {detail}"))
}

fn run_checked(
    context: &CallContext<'_>,
    surface: &Surface,
    name: &str,
    arguments: Option<Arguments>,
) -> Result<ToolOutput, ToolError> {
    // A write tool is refused in read-only mode even when the caller's cached `tools/list` still
    // shows it, and before its arguments are read; an unknown name reaches the unknown-tool error
    // below.
    let write_tool = WriteTool::from_name(name);
    if write_tool.is_some() {
        write_checkpoint::refuse_in_read_only_mode(context, name)?;
    }
    let arguments = normalize_tool_arguments(surface, arguments, name)?;
    let Some(tool) = write_tool else {
        return tools::call(context, name, &arguments)
            .unwrap_or_else(|| Err(unported_or_unknown(surface, name)));
    };
    let handler = tools::write_handler(tool).ok_or_else(|| unported_or_unknown(surface, name))?;
    let permit = Permit::pass(context, tool, &arguments)?;
    let done = handler(&permit, &arguments)?;
    // The write is done and the answer is the tool's. The audit lines are written while the permit
    // still holds the write lock; one that cannot be written, or a panic while writing it, is said
    // on standard error and changes nothing the agent reads.
    record_audit(context, tool, name, done.record);
    drop(permit);
    Ok(done.output)
}

fn record_audit(context: &CallContext<'_>, tool: WriteTool, name: &str, record: WriteRecord) {
    let recorded = catch_unwind(AssertUnwindSafe(|| {
        context.audit().record(tool, &context.client_name(), record)
    }));
    match recorded {
        Ok(Ok(())) => {}
        Ok(Err(error)) => {
            eprintln!("[ontology-atlas-mcp] audit line not written after {name}: {error}");
        }
        Err(payload) => {
            let detail = panic_detail(payload.as_ref());
            eprintln!("[ontology-atlas-mcp] audit line not written after {name}: it stopped unexpectedly: {detail}");
        }
    }
}

#[cfg(feature = "test-hooks")]
fn unported_or_unknown(surface: &Surface, name: &str) -> ToolError {
    if surface.tool(name).is_some() {
        ToolError::new(
            crate::error::ErrorCode::NotPorted,
            format!("Tool \"{name}\" is not ported to the Rust server yet."),
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
    let suggestion = closest_allowed_value(name, &allowed).filter(|nearest| nearest != name);
    ToolError::unknown_tool(name, suggestion.as_deref(), &allowed)
}

/// The arguments of a call to `tool_name`, with an unknown argument refused by name and, for a
/// known tool, an argument that holds half of a surrogate pair (which is not text, so no handler
/// is given it), and a blank or multi-line value of a non-blank string argument, refused.
pub fn normalize_tool_arguments(
    surface: &Surface,
    arguments: Option<Arguments>,
    tool_name: &str,
) -> Result<Arguments, ToolError> {
    let arguments = arguments.unwrap_or_default();
    let Some(tool) = surface.tool(tool_name) else {
        return Ok(arguments);
    };
    let unknown: Vec<&str> = arguments
        .keys()
        .filter(|key| !tool.argument_names.iter().any(|allowed| allowed == key))
        .collect();
    if !unknown.is_empty() {
        let mut allowed = tool.argument_names.clone();
        utf16::sort(&mut allowed);
        let mut received: Vec<String> = arguments.keys().map(str::to_string).collect();
        utf16::sort(&mut received);
        let unknown = unknown
            .into_iter()
            .map(|key| UnknownField {
                name: key.to_string(),
                suggestion: closest_allowed_value(key, &allowed),
            })
            .collect();
        return Err(ToolError::unknown_arguments(
            tool_name, unknown, allowed, received,
        ));
    }
    if let Some(name) = arguments.first_malformed() {
        return Err(ToolError::invalid(format!(
            "Argument \"{name}\" holds half of a surrogate pair (a lone \\ud800 to \\udfff escape), which is not text. Send the whole character, or leave it out."
        )));
    }
    for name in surface.top_level_non_blank_arguments(tool_name) {
        if let Some(value) = arguments.string(name) {
            require_non_blank(&value, name)?;
        }
    }
    Ok(arguments)
}

/// A top-level string argument whose contract is non-blank: the specific messages first, then the
/// pattern's own refusal of a line break inside the value.
fn require_non_blank(value: &str, name: &str) -> Result<(), ToolError> {
    let trimmed = trim(value);
    if trimmed.is_empty() {
        return Err(ToolError::invalid(format!(
            "{name} must be a non-empty string."
        )));
    }
    if trimmed != value {
        return Err(ToolError::invalid(format!(
            "{name} must not have leading or trailing whitespace. Example {name}: {}.",
            quote(trimmed)
        )));
    }
    if value.contains('\0') {
        return Err(ToolError::invalid(format!(
            "{name} must not contain a null byte."
        )));
    }
    if let Some(terminator) = value
        .chars()
        .find(|character| is_line_terminator(*character))
    {
        return Err(ToolError::invalid(format!(
            "{name} must be a single line: it contains U+{:04X}, a control or invisible formatting character that breaks a line.",
            u32::from(terminator)
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn arguments(text: &str) -> Option<Arguments> {
        Some(Arguments::from_fields(
            serde_json::from_str(text).expect("arguments"),
        ))
    }

    fn message(result: Result<Arguments, ToolError>) -> String {
        result.expect_err("refused").message().to_string()
    }

    #[test]
    fn unknown_arguments_are_listed_in_the_order_sent_and_received_ones_sorted() {
        let surface = Surface::embedded();
        assert_eq!(
            message(normalize_tool_arguments(surface, arguments(r#"{"b":1,"2":2,"1":3}"#), "list_kinds")),
            "Unknown arguments for list_kinds: \"b\", \"2\", \"1\". Allowed arguments: no arguments. Received arguments: 1, 2, b."
        );
    }

    #[test]
    fn an_argument_with_half_a_surrogate_pair_is_refused_by_name_before_the_handler() {
        let surface = Surface::embedded();
        let call = arguments(r#"{"slug":"a","kind":"x"}"#)
            .map(|arguments| arguments.with_malformed(vec!["kind".to_string()]));
        assert_eq!(
            message(normalize_tool_arguments(surface, call, "list_concepts")),
            "Unknown argument \"slug\" for list_concepts. Allowed arguments: domain, filter, kind, limit, mentions, offset, since, summary. Received arguments: kind, slug."
        );
        let call = arguments(r#"{"kind":"x"}"#)
            .map(|arguments| arguments.with_malformed(vec!["kind".to_string()]));
        let refused =
            normalize_tool_arguments(surface, call, "list_concepts").expect_err("refused");
        assert_eq!(refused.code(), crate::error::ErrorCode::InvalidArguments);
        assert!(refused
            .message()
            .starts_with("Argument \"kind\" holds half of a surrogate pair"));
    }

    #[test]
    fn a_non_blank_string_argument_refuses_blank_padded_and_multi_line_values() {
        let refused = |value: &str| {
            require_non_blank(value, "slug")
                .expect_err("refused")
                .message()
                .to_string()
        };
        assert_eq!(refused("  "), "slug must be a non-empty string.");
        assert_eq!(
            refused(" a"),
            "slug must not have leading or trailing whitespace. Example slug: \"a\"."
        );
        assert_eq!(refused("a\0b"), "slug must not contain a null byte.");
        assert_eq!(
            refused("a\u{2028}b"),
            "slug must be a single line: it contains U+2028, a control or invisible formatting character that breaks a line."
        );
        assert!(require_non_blank("a b", "slug").is_ok());
    }
}
