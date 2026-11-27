//! The result and error envelope of a `tools/call` answer: how a handler's value becomes `content`
//! and `structuredContent`, and how a failure becomes a typed code, a readable message and the
//! nearest-value hints an agent recovers from. It is `mcp/src/server/rpc.mjs`, rule for rule.

mod failure_details;

use crate::json::{to_json, Object, Value};

pub use failure_details::{
    classify_error_code, structured_error_details, structured_row_error_details,
};

/// A handler's failure. The message is prose for the reader and is never parsed back into
/// fields, except where the error carries no code of its own.
#[derive(Debug, Clone, Default)]
pub struct ToolError {
    pub message: String,
    /// A code the thrower names; its repair fields are named with it.
    pub error_code: Option<String>,
    /// Fields that tell the agent how to repair the call, added after the derived details.
    pub repair_fields: Option<Object>,
    /// A hint a slug that does not resolve attaches, lifted into `structuredContent`.
    pub growth_hint: Option<Value>,
    /// The write was refused because the file changed after the agent read it.
    pub vault_conflict: bool,
}

impl ToolError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            ..Self::default()
        }
    }

    pub fn with_code(message: impl Into<String>, error_code: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            error_code: Some(error_code.into()),
            ..Self::default()
        }
    }
}

impl std::fmt::Display for ToolError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for ToolError {}

fn text_block(text: &str) -> Value {
    Value::object([
        ("type", Value::string("text")),
        ("text", Value::string(text)),
    ])
}

/// A successful handler result as the answer `tools/call` returns.
///
/// Hosts forward `structuredContent` in place of the text, so the rows a breadth map and a source
/// read write as text travel as text alone.
pub fn ok(result: Value) -> Value {
    if let Value::Object(object) = &result {
        let contract = object.get("contract").and_then(Value::as_str);
        if contract == Some("agentBriefCompact:v3") {
            if let Some(prompt) = object.get("handoffPrompt").and_then(Value::as_str) {
                let mut structure = object.clone();
                structure.remove("handoffPrompt");
                return Value::object([
                    ("content", Value::array([text_block(prompt)])),
                    ("structuredContent", Value::Object(structure)),
                ]);
            }
        }
        let text_only = contract == Some("breadthMap:v1")
            || object.get("delivery").and_then(Value::as_str) == Some("source_only");
        if text_only {
            if let Some(text) = object.get("text").and_then(Value::as_str) {
                return Value::object([("content", Value::array([text_block(text)]))]);
            }
        }
    }
    let mut response = Object::new();
    response.insert("content", Value::array([text_block(&to_json(&result))]));
    if matches!(result, Value::Object(_)) {
        response.insert("structuredContent", result);
    }
    Value::Object(response)
}

/// A failed handler as the answer `tools/call` returns: text `Error: <message>`, `isError`, and a
/// `structuredContent` with `ok: false`, the code, the message and the repair fields.
pub fn failure(error: &ToolError) -> Value {
    let message = error.message.as_str();
    let details = match &error.error_code {
        Some(_) => Object::new(),
        None => structured_error_details(message),
    };
    let error_code = match &error.error_code {
        Some(code) => code.clone(),
        None => classify_error_code(error.vault_conflict, message).to_string(),
    };
    let mut structured = Object::new();
    structured.insert("ok", Value::Bool(false));
    structured.insert("errorCode", Value::string(error_code));
    structured.insert("error", Value::string(message));
    for (key, value) in details.iter() {
        structured.insert(key, value.clone());
    }
    if let Some(repair) = &error.repair_fields {
        for (key, value) in repair.iter() {
            structured.insert(key, value.clone());
        }
    }
    if let Some(hint) = &error.growth_hint {
        structured.insert("growthHint", hint.clone());
    }
    // The JavaScript handler builds `isError` second, but the SDK parses every tools/call result
    // through its result schema, which writes `content`, `structuredContent`, `isError` in that order.
    Value::object([
        (
            "content",
            Value::array([text_block(&format!("Error: {message}"))]),
        ),
        ("structuredContent", Value::Object(structured)),
        ("isError", Value::Bool(true)),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::parse;

    fn json(text: &str) -> Value {
        parse(text).expect("parses")
    }

    #[test]
    fn an_object_result_is_text_and_structure() {
        let answer = ok(json(r#"{"total":2,"byKind":{"domain":2}}"#));
        assert_eq!(
            to_json(&answer),
            r#"{"content":[{"type":"text","text":"{\"total\":2,\"byKind\":{\"domain\":2}}"}],"structuredContent":{"total":2,"byKind":{"domain":2}}}"#
        );
    }

    #[test]
    fn an_array_result_is_text_alone() {
        assert_eq!(
            to_json(&ok(json("[1,2]"))),
            r#"{"content":[{"type":"text","text":"[1,2]"}]}"#
        );
    }

    #[test]
    fn a_source_read_and_a_breadth_map_travel_as_text_alone() {
        let source = ok(json(
            r#"{"delivery":"source_only","text":"line","extra":1}"#,
        ));
        assert_eq!(
            to_json(&source),
            r#"{"content":[{"type":"text","text":"line"}]}"#
        );
        let map = ok(json(r#"{"contract":"breadthMap:v1","text":"rows"}"#));
        assert_eq!(
            to_json(&map),
            r#"{"content":[{"type":"text","text":"rows"}]}"#
        );
        // Without a text the ordinary answer is kept.
        let kept = ok(json(r#"{"delivery":"source_only"}"#));
        assert!(to_json(&kept).contains("structuredContent"));
    }

    #[test]
    fn a_compact_agent_brief_sends_its_prompt_as_the_text_and_the_rest_as_structure() {
        let answer = ok(json(
            r#"{"contract":"agentBriefCompact:v3","handoffPrompt":"go","focus":{"a":1}}"#,
        ));
        assert_eq!(
            to_json(&answer),
            r#"{"content":[{"type":"text","text":"go"}],"structuredContent":{"contract":"agentBriefCompact:v3","focus":{"a":1}}}"#
        );
    }

    #[test]
    fn a_failure_carries_the_code_the_message_and_the_derived_details() {
        let answer = failure(&ToolError::new(
            "Unknown tool: nope. Allowed tools: add_concepts, git_status.",
        ));
        assert_eq!(
            to_json(&answer),
            concat!(
                r#"{"content":[{"type":"text","text":"Error: Unknown tool: nope. Allowed tools: add_concepts, git_status."}],"#,
                r#""structuredContent":{"ok":false,"errorCode":"unknown_tool","#,
                r#""error":"Unknown tool: nope. Allowed tools: add_concepts, git_status.","receivedTool":"nope","#,
                r#""allowedTools":["add_concepts","git_status"]},"isError":true}"#
            )
        );
    }

    #[test]
    fn a_named_code_skips_the_derived_details_and_keeps_its_repair_fields() {
        let mut repair = Object::new();
        repair.insert("expectedHead", Value::string("abc"));
        let error = ToolError {
            message: "Tool \"x\" must be fixed".to_string(),
            error_code: Some("stale_head".to_string()),
            repair_fields: Some(repair),
            growth_hint: Some(Value::string("hint")),
            vault_conflict: false,
        };
        assert_eq!(
            to_json(&failure(&error)),
            concat!(
                r#"{"content":[{"type":"text","text":"Error: Tool \"x\" must be fixed"}],"#,
                r#""structuredContent":{"ok":false,"errorCode":"stale_head","error":"Tool \"x\" must be fixed","#,
                r#""expectedHead":"abc","growthHint":"hint"},"isError":true}"#
            )
        );
    }

    #[test]
    fn a_stale_write_is_a_vault_conflict_whatever_its_words() {
        let error = ToolError {
            message: "changed since read".to_string(),
            vault_conflict: true,
            ..ToolError::default()
        };
        assert!(to_json(&failure(&error)).contains(r#""errorCode":"vault_conflict""#));
    }
}
