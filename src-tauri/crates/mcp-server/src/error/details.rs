//! The fields a failure derives from the call, one type per kind of mistake an agent can repair:
//! what it got wrong, what was allowed, and the nearest allowed value. Field names are the ones the
//! agent reads in `structuredContent`; field order is the order they are written in.

use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};

use super::{Details, ErrorCode, ToolError};

/// A name the agent sent and the allowed name nearest to it, when one is near enough to be a typo.
#[derive(Debug, Serialize)]
pub struct UnknownField {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
}

fn quoted_list(unknown: &[UnknownField]) -> String {
    unknown
        .iter()
        .map(|field| match &field.suggestion {
            Some(nearest) => format!("\"{}\" (did you mean \"{nearest}\"?)", field.name),
            None => format!("\"{}\"", field.name),
        })
        .collect::<Vec<_>>()
        .join(", ")
}

fn did_you_mean(suggestion: Option<&str>) -> String {
    suggestion
        .map(|nearest| format!(" Did you mean \"{nearest}\"?"))
        .unwrap_or_default()
}

fn or_word(names: &[String], none: &str) -> String {
    if names.is_empty() {
        none.to_string()
    } else {
        names.join(", ")
    }
}

/// A tool name the server does not have, whatever the name holds: the fields are the typed values
/// the message was written from, so an empty name or one with a full stop carries them too.
#[derive(Debug, Serialize)]
pub struct UnknownToolDetails {
    #[serde(rename = "receivedTool")]
    pub received: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
    #[serde(rename = "allowedTools")]
    pub allowed: Vec<String>,
}

impl ToolError {
    /// `name` is not a tool; `allowed` are the tools that are, sorted.
    pub fn unknown_tool(name: &str, suggestion: Option<&str>, allowed: &[&str]) -> Self {
        let message = format!(
            "Unknown tool: {name}.{} Allowed tools: {}.",
            did_you_mean(suggestion),
            allowed.join(", ")
        );
        Self {
            details: Some(Box::new(Details::UnknownTool(UnknownToolDetails {
                received: name.to_string(),
                suggestion: suggestion.map(str::to_string),
                allowed: allowed.iter().map(|tool| (*tool).to_string()).collect(),
            }))),
            ..Self::new(ErrorCode::UnknownTool, message)
        }
    }

    /// The call named arguments `tool` does not take. `unknown` are those, in the order sent,
    /// `allowed` and `received` the argument names sorted.
    pub fn unknown_arguments(
        tool: &str,
        unknown: Vec<UnknownField>,
        allowed: Vec<String>,
        received: Vec<String>,
    ) -> Self {
        let allowed_text = or_word(&allowed, "no arguments");
        let received_text = or_word(&received, "none");
        let message = match unknown.as_slice() {
            [only] => format!(
                "Unknown argument \"{}\" for {tool}.{} Allowed arguments: {allowed_text}. Received arguments: {received_text}.",
                only.name,
                did_you_mean(only.suggestion.as_deref())
            ),
            _ => format!(
                "Unknown arguments for {tool}: {}. Allowed arguments: {allowed_text}. Received arguments: {received_text}.",
                quoted_list(&unknown)
            ),
        };
        Self {
            details: Some(Box::new(Details::UnknownArgument(UnknownArgumentDetails {
                tool: tool.to_string(),
                unknown,
                allowed,
                received,
            }))),
            ..Self::new(ErrorCode::UnknownArgument, message)
        }
    }
}

/// Arguments a tool does not take. One unknown argument is written with the fields of a single
/// mistake, several with the shorter list form.
#[derive(Debug)]
pub struct UnknownArgumentDetails {
    pub tool: String,
    pub unknown: Vec<UnknownField>,
    pub allowed: Vec<String>,
    pub received: Vec<String>,
}

impl Serialize for UnknownArgumentDetails {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("toolName", &self.tool)?;
        match self.unknown.as_slice() {
            [only] => {
                map.serialize_entry("receivedArgument", &only.name)?;
                if let Some(nearest) = &only.suggestion {
                    map.serialize_entry("suggestion", nearest)?;
                }
                map.serialize_entry("unknownArguments", &self.unknown)?;
                map.serialize_entry("allowedArguments", &self.allowed)?;
                map.serialize_entry("receivedArguments", &self.received)?;
            }
            _ => {
                map.serialize_entry("receivedArguments", &self.received)?;
                map.serialize_entry("unknownArguments", &self.unknown)?;
                map.serialize_entry("allowedArguments", &self.allowed)?;
            }
        }
        map.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use answer_format::json::to_string;

    fn structured(error: &ToolError) -> String {
        to_string(&error.structured()).expect("writes")
    }

    fn field(name: &str, suggestion: Option<&str>) -> UnknownField {
        UnknownField {
            name: name.to_string(),
            suggestion: suggestion.map(str::to_string),
        }
    }

    fn names(items: &[&str]) -> Vec<String> {
        items.iter().map(|item| (*item).to_string()).collect()
    }

    #[test]
    fn an_unknown_tool_with_a_suggestion_lists_what_is_allowed() {
        let error = ToolError::unknown_tool("list_concept", Some("list_concepts"), &["a", "b"]);
        assert_eq!(
            error.message(),
            r#"Unknown tool: list_concept. Did you mean "list_concepts"? Allowed tools: a, b."#
        );
        assert_eq!(
            structured(&error),
            concat!(
                r#"{"ok":false,"errorCode":"unknown_tool","error":"Unknown tool: list_concept. Did you mean \"list_concepts\"? Allowed tools: a, b.","#,
                r#""receivedTool":"list_concept","suggestion":"list_concepts","allowedTools":["a","b"]}"#
            )
        );
    }

    #[test]
    fn an_empty_name_or_one_with_a_full_stop_carries_its_fields_too() {
        assert_eq!(
            structured(&ToolError::unknown_tool("", None, &["a"])),
            r#"{"ok":false,"errorCode":"unknown_tool","error":"Unknown tool: . Allowed tools: a.","receivedTool":"","allowedTools":["a"]}"#
        );
        assert_eq!(
            structured(&ToolError::unknown_tool("srv.a", Some("a"), &["a"])),
            concat!(
                r#"{"ok":false,"errorCode":"unknown_tool","error":"Unknown tool: srv.a. Did you mean \"a\"? Allowed tools: a.","#,
                r#""receivedTool":"srv.a","suggestion":"a","allowedTools":["a"]}"#
            )
        );
        let argument =
            ToolError::unknown_arguments("t", vec![field("", None)], Vec::new(), names(&[""]));
        assert_eq!(
            structured(&argument),
            concat!(
                r#"{"ok":false,"errorCode":"unknown_argument","error":"Unknown argument \"\" for t. Allowed arguments: no arguments. Received arguments: .","#,
                r#""toolName":"t","receivedArgument":"","unknownArguments":[{"name":""}],"allowedArguments":[],"receivedArguments":[""]}"#
            )
        );
        let comma = ToolError::unknown_arguments(
            "t",
            vec![field("a,b", None), field(" c ", None)],
            Vec::new(),
            names(&[" c ", "a,b"]),
        );
        assert_eq!(
            structured(&comma),
            concat!(
                r#"{"ok":false,"errorCode":"unknown_argument","error":"Unknown arguments for t: \"a,b\", \" c \". Allowed arguments: no arguments. Received arguments:  c , a,b.","#,
                r#""toolName":"t","receivedArguments":[" c ","a,b"],"unknownArguments":[{"name":"a,b"},{"name":" c "}],"allowedArguments":[]}"#
            )
        );
    }

    #[test]
    fn a_single_unknown_argument_names_its_tool_and_the_nearest_allowed_one() {
        let error = ToolError::unknown_arguments(
            "list_concepts",
            vec![field("limt", Some("limit"))],
            names(&["domain", "limit"]),
            names(&["limt"]),
        );
        assert_eq!(
            error.message(),
            r#"Unknown argument "limt" for list_concepts. Did you mean "limit"? Allowed arguments: domain, limit. Received arguments: limt."#
        );
        assert_eq!(
            structured(&error),
            concat!(
                r#"{"ok":false,"errorCode":"unknown_argument","error":"Unknown argument \"limt\" for list_concepts. Did you mean \"limit\"? Allowed arguments: domain, limit. Received arguments: limt.","#,
                r#""toolName":"list_concepts","receivedArgument":"limt","suggestion":"limit","#,
                r#""unknownArguments":[{"name":"limt","suggestion":"limit"}],"allowedArguments":["domain","limit"],"#,
                r#""receivedArguments":["limt"]}"#
            )
        );
        let none = ToolError::unknown_arguments(
            "git_status",
            vec![field("zz", None)],
            Vec::new(),
            names(&["zz"]),
        );
        assert_eq!(
            none.message(),
            r#"Unknown argument "zz" for git_status. Allowed arguments: no arguments. Received arguments: zz."#
        );
        assert_eq!(
            structured(&none),
            concat!(
                r#"{"ok":false,"errorCode":"unknown_argument","error":"Unknown argument \"zz\" for git_status. Allowed arguments: no arguments. Received arguments: zz.","#,
                r#""toolName":"git_status","receivedArgument":"zz","unknownArguments":[{"name":"zz"}],"#,
                r#""allowedArguments":[],"receivedArguments":["zz"]}"#
            )
        );
    }

    #[test]
    fn several_unknown_arguments_each_carry_their_own_hint() {
        let error = ToolError::unknown_arguments(
            "list_concepts",
            vec![field("bogus", None), field("limt", Some("limit"))],
            names(&["domain", "limit"]),
            names(&["bogus", "limt"]),
        );
        assert_eq!(
            error.message(),
            r#"Unknown arguments for list_concepts: "bogus", "limt" (did you mean "limit"?). Allowed arguments: domain, limit. Received arguments: bogus, limt."#
        );
        assert_eq!(
            structured(&error),
            concat!(
                r#"{"ok":false,"errorCode":"unknown_argument","error":"Unknown arguments for list_concepts: \"bogus\", \"limt\" (did you mean \"limit\"?). Allowed arguments: domain, limit. Received arguments: bogus, limt.","#,
                r#""toolName":"list_concepts","receivedArguments":["bogus","limt"],"#,
                r#""unknownArguments":[{"name":"bogus"},{"name":"limt","suggestion":"limit"}],"allowedArguments":["domain","limit"]}"#
            )
        );
    }
}
