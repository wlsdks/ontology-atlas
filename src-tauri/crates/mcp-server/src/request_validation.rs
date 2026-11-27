//! The parameter checks the JavaScript SDK runs on `initialize`, `tools/list` and `tools/call`, and
//! the exact words it answers with when one fails.
//!
//! The SDK validates with zod and answers with the issues pretty-printed as JSON, so a type
//! mismatch reads `Invalid input: expected string, received number` at a path. Only type
//! mismatches of the fields the server uses are reproduced; a deeper mistake inside an optional
//! client capability is accepted.

use crate::json::{to_json_pretty, Object, Value};

struct Issue {
    expected: &'static str,
    path: Vec<&'static str>,
    received: &'static str,
}

impl Issue {
    fn to_value(&self) -> Value {
        Value::object([
            ("expected", Value::string(self.expected)),
            ("code", Value::string("invalid_type")),
            (
                "path",
                Value::array(self.path.iter().map(|part| Value::string(*part))),
            ),
            (
                "message",
                Value::string(format!(
                    "Invalid input: expected {}, received {}",
                    self.expected, self.received
                )),
            ),
        ])
    }
}

fn issues_text(issues: &[Issue]) -> String {
    to_json_pretty(&Value::array(issues.iter().map(Issue::to_value)), 2)
}

/// The word zod reports for a value that is not the expected type.
fn received(value: Option<&Value>) -> &'static str {
    value.map_or("undefined", Value::received_kind)
}

fn expect_string(
    object: &Object,
    key: &'static str,
    path: &[&'static str],
    required: bool,
    issues: &mut Vec<Issue>,
) {
    match object.get(key) {
        Some(Value::String(_)) => {}
        None if !required => {}
        other => issues.push(Issue {
            expected: "string",
            path: path.iter().copied().chain(std::iter::once(key)).collect(),
            received: received(other),
        }),
    }
}

fn is_plain_object(value: Option<&Value>) -> bool {
    matches!(value, Some(Value::Object(_)))
}

/// What the server keeps from a valid `initialize`.
#[derive(Debug)]
pub struct InitializeParams {
    pub protocol_version: String,
    pub capabilities: Object,
}

/// Checks `initialize` params. An invalid one is answered with error -32603 and these words.
pub fn validate_initialize(params: Option<&Object>) -> Result<InitializeParams, String> {
    let Some(params) = params else {
        return Err(issues_text(&[Issue {
            expected: "object",
            path: vec!["params"],
            received: "undefined",
        }]));
    };
    let mut issues = Vec::new();
    expect_string(params, "protocolVersion", &["params"], true, &mut issues);
    let capabilities = params.get("capabilities");
    if !is_plain_object(capabilities) {
        issues.push(Issue {
            expected: "object",
            path: vec!["params", "capabilities"],
            received: received(capabilities),
        });
    }
    let client_info = params.get("clientInfo");
    match client_info {
        Some(Value::Object(info)) => {
            let path = ["params", "clientInfo"];
            expect_string(info, "name", &path, true, &mut issues);
            expect_string(info, "title", &path, false, &mut issues);
            if info
                .get("icons")
                .is_some_and(|icons| icons.as_array().is_none())
            {
                issues.push(Issue {
                    expected: "array",
                    path: vec!["params", "clientInfo", "icons"],
                    received: received(info.get("icons")),
                });
            }
            expect_string(info, "version", &path, true, &mut issues);
            expect_string(info, "websiteUrl", &path, false, &mut issues);
            expect_string(info, "description", &path, false, &mut issues);
        }
        other => issues.push(Issue {
            expected: "object",
            path: vec!["params", "clientInfo"],
            received: received(other),
        }),
    }
    if !issues.is_empty() {
        return Err(issues_text(&issues));
    }
    Ok(InitializeParams {
        protocol_version: params
            .get("protocolVersion")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        capabilities: capabilities
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default(),
    })
}

/// Checks `tools/list` params (an optional cursor). An invalid one is answered with error -32603.
pub fn validate_tools_list(params: Option<&Object>) -> Result<(), String> {
    let mut issues = Vec::new();
    if let Some(params) = params {
        expect_string(params, "cursor", &["params"], false, &mut issues);
    }
    if issues.is_empty() {
        Ok(())
    } else {
        Err(issues_text(&issues))
    }
}

/// A valid `tools/call`.
#[derive(Debug)]
pub struct CallParams {
    pub name: String,
    /// `None` when the agent sent no `arguments`.
    pub arguments: Option<Object>,
}

/// Checks `tools/call` params. An invalid one is answered with error -32602 and
/// `Invalid tools/call request: ` before these words.
pub fn validate_tools_call(params: Option<&Object>) -> Result<CallParams, String> {
    let Some(params) = params else {
        return Err(issues_text(&[Issue {
            expected: "object",
            path: vec!["params"],
            received: "undefined",
        }]));
    };
    let mut issues = Vec::new();
    if let Some(task) = params.get("task") {
        match task {
            Value::Object(task) => {
                if task.get("ttl").is_some_and(|ttl| ttl.as_f64().is_none()) {
                    issues.push(Issue {
                        expected: "number",
                        path: vec!["params", "task", "ttl"],
                        received: received(task.get("ttl")),
                    });
                }
            }
            other => issues.push(Issue {
                expected: "object",
                path: vec!["params", "task"],
                received: received(Some(other)),
            }),
        }
    }
    expect_string(params, "name", &["params"], true, &mut issues);
    let arguments = params.get("arguments");
    if let Some(arguments) = arguments {
        if !is_plain_object(Some(arguments)) {
            issues.push(Issue {
                expected: "record",
                path: vec!["params", "arguments"],
                received: received(Some(arguments)),
            });
        }
    }
    if !issues.is_empty() {
        return Err(issues_text(&issues));
    }
    // The SDK copies `arguments` into a fresh object by assignment, so an own `__proto__` key
    // (which `JSON.parse` makes) sets a prototype instead of a property and is gone.
    let arguments = arguments
        .and_then(Value::as_object)
        .cloned()
        .map(|mut object| {
            object.remove("__proto__");
            object
        });
    Ok(CallParams {
        name: params
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        arguments,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::parse;

    fn params(text: &str) -> Object {
        parse(text)
            .expect("parses")
            .as_object()
            .cloned()
            .expect("object")
    }

    #[test]
    fn initialize_names_every_missing_field_in_schema_order() {
        let message = validate_initialize(Some(&params("{}"))).expect_err("invalid");
        let value = parse(&message).expect("issues are JSON");
        let paths: Vec<String> = value
            .as_array()
            .expect("array")
            .iter()
            .map(|issue| crate::json::to_json(issue.get("path").expect("path")))
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
        let message = validate_initialize(Some(&params(
            r#"{"protocolVersion":5,"capabilities":{},"clientInfo":{"name":"t","version":"1"}}"#,
        )))
        .expect_err("invalid");
        assert_eq!(
            message,
            "[\n  {\n    \"expected\": \"string\",\n    \"code\": \"invalid_type\",\n    \"path\": [\n      \"params\",\n      \"protocolVersion\"\n    ],\n    \"message\": \"Invalid input: expected string, received number\"\n  }\n]"
        );
    }

    #[test]
    fn a_missing_params_is_an_object_expected() {
        let message = validate_initialize(None).expect_err("invalid");
        assert!(
            message.contains("\"expected\": \"object\"") && message.contains("received undefined")
        );
    }

    #[test]
    fn tools_call_wants_a_name_and_a_record_of_arguments() {
        let wrong_name = validate_tools_call(Some(&params(r#"{"name":5}"#))).expect_err("invalid");
        assert!(wrong_name.contains("expected string, received number"));
        let array = validate_tools_call(Some(&params(r#"{"name":"x","arguments":[]}"#)))
            .expect_err("invalid");
        assert!(array.contains("\"expected\": \"record\"") && array.contains("received array"));
        let null = validate_tools_call(Some(&params(r#"{"name":"x","arguments":null}"#)))
            .expect_err("invalid");
        assert!(null.contains("received null"));
        let valid = validate_tools_call(Some(&params(r#"{"name":"x"}"#))).expect("valid");
        assert_eq!(
            (valid.name.as_str(), valid.arguments.is_none()),
            ("x", true)
        );
    }

    #[test]
    fn a_cursor_must_be_a_string() {
        assert!(validate_tools_list(None).is_ok());
        assert!(validate_tools_list(Some(&params(r#"{"cursor":"x"}"#))).is_ok());
        assert!(validate_tools_list(Some(&params(r#"{"cursor":null}"#))).is_err());
        assert!(validate_tools_list(Some(&params(r#"{"cursor":5}"#))).is_err());
    }
}
