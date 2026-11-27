//! What a tool call answers: the text an agent reads and, beside it, the same answer as structure.
//!
//! An answer that is an object is held once, as the JSON text it was written to, and is the
//! `content` text and the `structuredContent` both: nothing is copied for the second, and the
//! reply writes each from that one text. Hosts forward `structuredContent` in place of the text when
//! both are there, so an answer whose rows are written as text sends them as text alone
//! ([`ToolOutput::text`]).

use answer_format::json::{to_raw, to_string};
use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};
use serde_json::value::RawValue;

use crate::error::ToolError;

/// How an answer is held: its text, and whether that text is also its structure.
#[derive(Debug)]
enum Body {
    /// Text alone, such as a map or the lines of a source file.
    Text(String),
    /// JSON text that is the text and the structure both.
    Json(Box<RawValue>),
    /// Words, with the structure that lets an agent repair the call.
    Failure(String, Box<RawValue>),
}

/// A handler's successful answer.
#[derive(Debug)]
pub struct ToolOutput(Body);

fn unwritable(error: &serde_json::Error) -> ToolError {
    ToolError::failed(format!("The answer could not be written: {error}"))
}

impl ToolOutput {
    /// The answer as JSON text; an answer that is an object is also sent as structure.
    pub fn json<T: Serialize + ?Sized>(answer: &T) -> Result<Self, ToolError> {
        let mut text = to_string(answer).map_err(|error| unwritable(&error))?;
        if text.starts_with('{') {
            // Held at exactly its length so the text becomes the raw value without a copy.
            text.shrink_to_fit();
            let raw = RawValue::from_string(text).map_err(|error| unwritable(&error))?;
            Ok(Self(Body::Json(raw)))
        } else {
            Ok(Self(Body::Text(text)))
        }
    }

    /// An answer that is text alone.
    pub fn text(text: impl Into<String>) -> Self {
        Self(Body::Text(text.into()))
    }
}

/// The result of `tools/call`, written in the order the SDK writes it: the content, then the
/// structure, then `isError`.
#[derive(Debug)]
pub struct CallToolResult {
    body: Body,
    /// Lines after the answer's own text.
    notes: Vec<String>,
}

impl CallToolResult {
    pub fn success(output: ToolOutput) -> Self {
        Self {
            body: output.0,
            notes: Vec::new(),
        }
    }

    /// A failed call: the text `Error: <message>`, and the structure that lets an agent repair it.
    pub fn failure(error: &ToolError) -> Self {
        let text = format!("Error: {}", error.message());
        let body = match to_raw(&error.structured()) {
            Ok(structure) => Body::Failure(text, structure),
            Err(_) => Body::Text(text),
        };
        Self {
            body,
            notes: Vec::new(),
        }
    }

    pub fn is_failure(&self) -> bool {
        matches!(self.body, Body::Failure(..))
    }

    /// Adds a line after the answer's own text.
    pub fn push_note(&mut self, note: String) {
        self.notes.push(note);
    }

    fn first_text(&self) -> &str {
        match &self.body {
            Body::Text(text) | Body::Failure(text, _) => text,
            Body::Json(raw) => raw.get(),
        }
    }

    fn structure(&self) -> Option<&RawValue> {
        match &self.body {
            Body::Text(_) => None,
            Body::Json(raw) | Body::Failure(_, raw) => Some(raw),
        }
    }
}

/// The `content` list: the answer's text, then each note.
struct Content<'a>(&'a CallToolResult);

#[derive(Serialize)]
struct TextContent<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    text: &'a str,
}

impl Serialize for Content<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let texts =
            std::iter::once(self.0.first_text()).chain(self.0.notes.iter().map(String::as_str));
        serializer.collect_seq(texts.map(|text| TextContent { kind: "text", text }))
    }
}

impl Serialize for CallToolResult {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("content", &Content(self))?;
        if let Some(structure) = self.structure() {
            map.serialize_entry("structuredContent", structure)?;
        }
        if self.is_failure() {
            map.serialize_entry("isError", &true)?;
        }
        map.end()
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
