//! What a tool call answers: the text an agent reads and, beside it, the same answer as structure.
//!
//! A handler chooses how its answer travels: as JSON text and structure ([`ToolOutput::json`]), as
//! text alone ([`ToolOutput::text`]), or as a prompt with its structure beside it
//! ([`ToolOutput::prompt`]). Hosts forward `structuredContent` in place of the text when both are
//! there, so an answer whose rows are written as text sends them as text alone.

use answer_format::json::{to_raw, to_string};
use serde::Serialize;
use serde_json::value::RawValue;

use crate::error::ToolError;

/// A handler's successful answer.
#[derive(Debug)]
pub struct ToolOutput {
    text: String,
    structured: Option<Box<RawValue>>,
}

fn unwritable(error: &serde_json::Error) -> ToolError {
    ToolError::failed(format!("The answer could not be written: {error}"))
}

impl ToolOutput {
    /// The answer as JSON text; an answer that is an object is also sent as structure.
    pub fn json<T: Serialize + ?Sized>(answer: &T) -> Result<Self, ToolError> {
        let text = to_string(answer).map_err(|error| unwritable(&error))?;
        let structured = if text.starts_with('{') {
            Some(RawValue::from_string(text.clone()).map_err(|error| unwritable(&error))?)
        } else {
            None
        };
        Ok(Self { text, structured })
    }

    /// An answer that is text alone, such as a map or the lines of a source file.
    pub fn text(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            structured: None,
        }
    }

    /// A prompt as the text, with the rest of the answer as structure.
    pub fn prompt<T: Serialize + ?Sized>(
        prompt: impl Into<String>,
        structure: &T,
    ) -> Result<Self, ToolError> {
        Ok(Self {
            text: prompt.into(),
            structured: Some(to_raw(structure).map_err(|error| unwritable(&error))?),
        })
    }
}

#[derive(Debug, Serialize)]
struct TextContent {
    #[serde(rename = "type")]
    kind: &'static str,
    text: String,
}

impl TextContent {
    fn new(text: String) -> Self {
        Self { kind: "text", text }
    }
}

/// The result of `tools/call`, written in the order the SDK writes it.
#[derive(Debug, Serialize)]
pub struct CallToolResult {
    content: Vec<TextContent>,
    #[serde(rename = "structuredContent", skip_serializing_if = "Option::is_none")]
    structured_content: Option<Box<RawValue>>,
    #[serde(rename = "isError", skip_serializing_if = "Option::is_none")]
    is_error: Option<bool>,
}

impl CallToolResult {
    pub fn success(output: ToolOutput) -> Self {
        Self {
            content: vec![TextContent::new(output.text)],
            structured_content: output.structured,
            is_error: None,
        }
    }

    /// A failed call: the text `Error: <message>`, and the structure that lets an agent repair it.
    pub fn failure(error: &ToolError) -> Self {
        Self {
            content: vec![TextContent::new(format!("Error: {}", error.message()))],
            structured_content: to_raw(&error.structured()).ok(),
            is_error: Some(true),
        }
    }

    pub fn is_failure(&self) -> bool {
        self.is_error == Some(true)
    }

    /// Adds a line after the answer's own text.
    pub fn push_note(&mut self, note: String) {
        self.content.push(TextContent::new(note));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn written(result: &CallToolResult) -> String {
        to_string(result).expect("writes")
    }

    #[test]
    fn an_object_answer_is_text_and_structure() {
        let answer = ToolOutput::json(&json!({"byKind": {"domain": 2}, "total": 2})).expect("ok");
        assert_eq!(
            written(&CallToolResult::success(answer)),
            r#"{"content":[{"type":"text","text":"{\"byKind\":{\"domain\":2},\"total\":2}"}],"structuredContent":{"byKind":{"domain":2},"total":2}}"#
        );
    }

    #[test]
    fn an_array_answer_is_text_alone() {
        let answer = ToolOutput::json(&[1, 2]).expect("ok");
        assert_eq!(
            written(&CallToolResult::success(answer)),
            r#"{"content":[{"type":"text","text":"[1,2]"}]}"#
        );
    }

    #[test]
    fn a_text_answer_travels_as_text_alone() {
        assert_eq!(
            written(&CallToolResult::success(ToolOutput::text("line"))),
            r#"{"content":[{"type":"text","text":"line"}]}"#
        );
    }

    #[test]
    fn a_prompt_is_the_text_and_the_rest_is_structure() {
        let answer = ToolOutput::prompt("go", &json!({"focus": {"a": 1}})).expect("ok");
        assert_eq!(
            written(&CallToolResult::success(answer)),
            r#"{"content":[{"type":"text","text":"go"}],"structuredContent":{"focus":{"a":1}}}"#
        );
    }

    #[test]
    fn a_failure_carries_the_code_the_message_and_the_derived_fields() {
        let error = ToolError::unknown_tool("nope", None, &["add_concepts", "git_status"]);
        assert_eq!(
            written(&CallToolResult::failure(&error)),
            concat!(
                r#"{"content":[{"type":"text","text":"Error: Unknown tool: nope. Allowed tools: add_concepts, git_status."}],"#,
                r#""structuredContent":{"ok":false,"errorCode":"unknown_tool","#,
                r#""error":"Unknown tool: nope. Allowed tools: add_concepts, git_status.","receivedTool":"nope","#,
                r#""allowedTools":["add_concepts","git_status"]},"isError":true}"#
            )
        );
    }

    #[test]
    fn a_note_follows_the_answers_own_text() {
        let mut result = CallToolResult::success(ToolOutput::text("a"));
        result.push_note("b".to_string());
        assert!(!result.is_failure());
        assert_eq!(
            written(&result),
            r#"{"content":[{"type":"text","text":"a"},{"type":"text","text":"b"}]}"#
        );
    }
}
