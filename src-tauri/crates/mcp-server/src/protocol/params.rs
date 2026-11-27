//! The parameter checks the JavaScript SDK runs on `initialize`, `tools/list` and `tools/call`, and
//! the exact words it answers with when one fails.
//!
//! The SDK validates with zod and answers with the issues pretty-printed as JSON, so a type mismatch
//! reads `Invalid input: expected string, received number` at a path. Only type mismatches of the
//! fields the server uses are reproduced; a deeper mistake inside an optional client capability is
//! accepted.

use std::collections::HashMap;
use std::fmt;

use answer_format::json::to_string_indented;
use indexmap::IndexMap;
use serde::Serialize;
use serde_json::value::RawValue;

use super::capabilities::ClientCapabilities;
use super::message::Params;
use crate::arguments::Arguments;
use crate::raw_json::{string_value, Kind};

#[derive(Debug, Serialize)]
struct Issue {
    expected: &'static str,
    code: &'static str,
    path: Vec<&'static str>,
    message: String,
}

/// What the check found wrong: the issues, in the schema's order. Displayed as the SDK shows them,
/// as indented JSON.
#[derive(Debug, Default)]
pub struct Issues(Vec<Issue>);

impl fmt::Display for Issues {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let text = to_string_indented(&self.0, 2).map_err(|_| fmt::Error)?;
        formatter.write_str(&text)
    }
}

impl Issues {
    fn push(&mut self, expected: &'static str, path: &[&'static str], received: &'static str) {
        self.0.push(Issue {
            expected,
            code: "invalid_type",
            path: path.to_vec(),
            message: format!("Invalid input: expected {expected}, received {received}"),
        });
    }

    fn into_result<T>(self, value: impl FnOnce() -> T) -> Result<T, Self> {
        if self.0.is_empty() {
            Ok(value())
        } else {
            Err(self)
        }
    }
}

/// The word zod reports for a value that is not the expected type.
fn received(value: Option<&RawValue>) -> &'static str {
    value.map_or("undefined", |raw| Kind::of(raw).received())
}

/// A member of an object read as text.
type Members<'a> = HashMap<String, &'a RawValue>;

fn members(raw: Option<&RawValue>) -> Option<Members<'_>> {
    serde_json::from_str(raw?.get()).ok()
}

fn expect_string(
    object: &Members<'_>,
    key: &'static str,
    path: &[&'static str],
    required: bool,
    issues: &mut Issues,
) {
    let value = object.get(key).copied();
    if value.is_some_and(|raw| Kind::of(raw) == Kind::String) || (value.is_none() && !required) {
        return;
    }
    let mut full_path = path.to_vec();
    full_path.push(key);
    issues.push("string", &full_path, received(value));
}

fn missing_params() -> Issues {
    let mut issues = Issues::default();
    issues.push("object", &["params"], "undefined");
    issues
}

fn params_members(params: &Params) -> Members<'_> {
    params
        .iter()
        .map(|(key, raw)| (key.to_string(), raw))
        .collect()
}

/// What the server keeps from a valid `initialize`.
#[derive(Debug)]
pub struct Initialize {
    pub protocol_version: String,
    pub capabilities: ClientCapabilities,
}

/// Checks `initialize` params. An invalid one is answered with error -32603 and these words.
pub fn initialize(params: Option<&Params>) -> Result<Initialize, Issues> {
    let Some(params) = params else {
        return Err(missing_params());
    };
    let members = params_members(params);
    let mut issues = Issues::default();
    expect_string(&members, "protocolVersion", &["params"], true, &mut issues);
    let capabilities = members.get("capabilities").copied();
    if capabilities.is_none_or(|raw| Kind::of(raw) != Kind::Object) {
        issues.push(
            "object",
            &["params", "capabilities"],
            received(capabilities),
        );
    }
    let client_info = members.get("clientInfo").copied();
    match members_of_object(client_info) {
        Some(info) => {
            let path = ["params", "clientInfo"];
            expect_string(&info, "name", &path, true, &mut issues);
            expect_string(&info, "title", &path, false, &mut issues);
            if let Some(icons) = info.get("icons").copied() {
                if Kind::of(icons) != Kind::Array {
                    issues.push(
                        "array",
                        &["params", "clientInfo", "icons"],
                        received(Some(icons)),
                    );
                }
            }
            expect_string(&info, "version", &path, true, &mut issues);
            expect_string(&info, "websiteUrl", &path, false, &mut issues);
            expect_string(&info, "description", &path, false, &mut issues);
        }
        None => issues.push("object", &["params", "clientInfo"], received(client_info)),
    }
    issues.into_result(|| Initialize {
        protocol_version: members
            .get("protocolVersion")
            .and_then(|raw| string_value(raw))
            .unwrap_or_default(),
        capabilities: capabilities
            .map_or_else(ClientCapabilities::default, ClientCapabilities::announced),
    })
}

/// The members of `raw` when it is an object.
fn members_of_object(raw: Option<&RawValue>) -> Option<Members<'_>> {
    raw.filter(|raw| Kind::of(raw) == Kind::Object)
        .and_then(|raw| members(Some(raw)))
}

/// Checks `tools/list` params (an optional cursor). An invalid one is answered with error -32603.
pub fn tools_list(params: Option<&Params>) -> Result<(), Issues> {
    let mut issues = Issues::default();
    if let Some(params) = params {
        expect_string(
            &params_members(params),
            "cursor",
            &["params"],
            false,
            &mut issues,
        );
    }
    issues.into_result(|| ())
}

/// A valid `tools/call`.
#[derive(Debug)]
pub struct ToolCall {
    pub name: String,
    /// `None` when the agent sent no `arguments`.
    pub arguments: Option<Arguments>,
}

/// Checks `tools/call` params. An invalid one is answered with error -32602 and
/// `Invalid tools/call request: ` before these words.
pub fn tools_call(params: Option<&Params>) -> Result<ToolCall, Issues> {
    let Some(params) = params else {
        return Err(missing_params());
    };
    let members = params_members(params);
    let mut issues = Issues::default();
    if let Some(task) = members.get("task").copied() {
        match members_of_object(Some(task)) {
            Some(task) => {
                if let Some(ttl) = task.get("ttl").copied() {
                    if Kind::of(ttl) != Kind::Number {
                        issues.push("number", &["params", "task", "ttl"], received(Some(ttl)));
                    }
                }
            }
            None => issues.push("object", &["params", "task"], received(Some(task))),
        }
    }
    expect_string(&members, "name", &["params"], true, &mut issues);
    let arguments = members.get("arguments").copied();
    if let Some(raw) = arguments {
        if Kind::of(raw) != Kind::Object {
            issues.push("record", &["params", "arguments"], received(Some(raw)));
        }
    }
    issues.into_result(|| ToolCall {
        name: members
            .get("name")
            .and_then(|raw| string_value(raw))
            .unwrap_or_default(),
        arguments: arguments
            .and_then(read_arguments)
            .map(|arguments| arguments.with_malformed(params.malformed_arguments.clone())),
    })
}

/// The `arguments` members, in the order sent; `__proto__` is a name like any other.
fn read_arguments(raw: &RawValue) -> Option<Arguments> {
    let fields: IndexMap<String, Box<RawValue>> = serde_json::from_str(raw.get()).ok()?;
    Some(Arguments::from_fields(fields))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params(text: &str) -> Params {
        Params::from_fields(serde_json::from_str(text).expect("params"))
    }

    #[test]
    fn initialize_names_every_missing_field_in_schema_order() {
        let message = initialize(Some(&params("{}")))
            .expect_err("invalid")
            .to_string();
        let issues: Vec<serde_json::Value> =
            serde_json::from_str(&message).expect("issues are JSON");
        let paths: Vec<String> = issues
            .iter()
            .map(|issue| issue["path"].to_string())
            .collect();
        assert_eq!(
            paths,
            [
                r#"["params","protocolVersion"]"#,
                r#"["params","capabilities"]"#,
                r#"["params","clientInfo"]"#
            ]
        );
    }

    #[test]
    fn a_number_where_a_string_belongs_reads_as_the_sdk_reads() {
        let message = initialize(Some(&params(
            r#"{"protocolVersion":5,"capabilities":{},"clientInfo":{"name":"t","version":"1"}}"#,
        )))
        .expect_err("invalid")
        .to_string();
        assert_eq!(
            message,
            "[\n  {\n    \"expected\": \"string\",\n    \"code\": \"invalid_type\",\n    \"path\": [\n      \"params\",\n      \"protocolVersion\"\n    ],\n    \"message\": \"Invalid input: expected string, received number\"\n  }\n]"
        );
    }

    #[test]
    fn tools_call_wants_a_name_and_a_record_of_arguments() {
        let wrong_name = tools_call(Some(&params(r#"{"name":5}"#)))
            .expect_err("invalid")
            .to_string();
        assert!(wrong_name.contains("expected string, received number"));
        let array = tools_call(Some(&params(r#"{"name":"x","arguments":[]}"#)))
            .expect_err("invalid")
            .to_string();
        assert!(array.contains("\"expected\": \"record\"") && array.contains("received array"));
        let null = tools_call(Some(&params(r#"{"name":"x","arguments":null}"#)))
            .expect_err("invalid")
            .to_string();
        assert!(null.contains("received null"));
        let valid = tools_call(Some(&params(r#"{"name":"x"}"#))).expect("valid");
        assert_eq!(
            (valid.name.as_str(), valid.arguments.is_none()),
            ("x", true)
        );
    }

    #[test]
    fn the_proto_argument_is_an_argument_like_any_other() {
        let call = tools_call(Some(&params(
            r#"{"name":"x","arguments":{"__proto__":1,"a":2}}"#,
        )))
        .expect("valid");
        let arguments = call.arguments.expect("arguments");
        assert_eq!(arguments.keys().collect::<Vec<_>>(), ["__proto__", "a"]);
    }

    #[test]
    fn a_cursor_must_be_a_string() {
        assert!(tools_list(None).is_ok());
        assert!(tools_list(Some(&params(r#"{"cursor":"x"}"#))).is_ok());
        assert!(tools_list(Some(&params(r#"{"cursor":null}"#))).is_err());
        assert!(tools_list(Some(&params(r#"{"cursor":5}"#))).is_err());
    }
}
