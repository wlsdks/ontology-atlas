//! JSON-RPC messages as the JavaScript SDK reads and writes them.
//!
//! A line that is not exactly a request, a notification or a response gets no answer at all, which
//! is what the SDK does: its message schema is strict, so an extra top-level key, a `null` id, an
//! id that is not a safe integer or a string, or `params` that is not an object all drop the line.

use crate::json::{to_json, write_string_body, Object, Value, SURROGATE_ESCAPE};

/// A request id. Numbers must be safe integers; `1.5`, `null` and `true` are not ids.
///
/// A text id is kept in a reversible form so that a lone surrogate (which a Rust string cannot
/// hold) is written back as it came and two ids differing only in one stay two ids: see
/// [`crate::json::parse_keeping_surrogates`]. Build one with [`Id::text`], never from a raw string.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Id {
    Number(i64),
    Text(String),
}

impl Id {
    /// A text id for a string with no lone surrogate in it.
    pub fn text(text: &str) -> Self {
        let mut encoded = String::with_capacity(text.len());
        for character in text.chars() {
            encoded.push(character);
            if character == SURROGATE_ESCAPE {
                encoded.push(character);
            }
        }
        Self::Text(encoded)
    }

    /// The id as JSON, a lone surrogate written as the escape `JSON.stringify` gives it.
    pub fn to_json(&self) -> String {
        match self {
            Self::Number(number) => to_json(&Value::integer(*number)),
            Self::Text(encoded) => {
                let mut out = String::with_capacity(encoded.len() + 2);
                out.push('"');
                let mut plain = String::new();
                let mut characters = encoded.chars();
                while let Some(character) = characters.next() {
                    if character != SURROGATE_ESCAPE {
                        plain.push(character);
                        continue;
                    }
                    match characters.next() {
                        Some(unit @ '\u{e000}'..='\u{e7ff}') => {
                            write_string_body(&plain, &mut out);
                            plain.clear();
                            out.push_str(&format!(
                                "\\u{:04x}",
                                0xd800 + (u32::from(unit) - 0xe000)
                            ));
                        }
                        Some(other) => plain.push(other),
                        None => plain.push(SURROGATE_ESCAPE),
                    }
                }
                write_string_body(&plain, &mut out);
                out.push('"');
                out
            }
        }
    }
}

const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

/// A safe integer as an `i64`. `-0` is the number 0 once it is written back.
#[allow(
    clippy::cast_possible_truncation,
    reason = "the caller checked the value is a safe integer"
)]
pub(crate) fn safe_integer(number: f64) -> i64 {
    number as i64
}

fn read_id(value: &Value) -> Option<Id> {
    match value {
        Value::String(text) => Some(Id::text(text)),
        Value::Number(number)
            if number.is_finite() && number.fract() == 0.0 && number.abs() <= MAX_SAFE_INTEGER =>
        {
            Some(Id::Number(safe_integer(*number)))
        }
        _ => None,
    }
}

/// What one valid input line is.
#[derive(Debug, Clone, PartialEq)]
pub enum Incoming {
    Request {
        id: Id,
        method: String,
        params: Option<Object>,
    },
    Notification {
        method: String,
        params: Option<Object>,
    },
    /// An answer to something the server asked (the consent question).
    Response { id: Id, result: Object },
    ErrorResponse {
        id: Option<Id>,
        code: i64,
        message: String,
    },
}

const RELATED_TASK_META_KEY: &str = "io.modelcontextprotocol/related-task";

/// `_meta` of a request or notification: an object whose `progressToken` is a string or a safe
/// integer and whose related-task entry names a task.
fn meta_is_valid(meta: &Value) -> bool {
    let Some(meta) = meta.as_object() else {
        return false;
    };
    let token_ok = meta
        .get("progressToken")
        .is_none_or(|token| read_id(token).is_some());
    let task_ok = meta.get(RELATED_TASK_META_KEY).is_none_or(|task| {
        task.as_object()
            .is_some_and(|task| task.get("taskId").is_some_and(|id| id.as_str().is_some()))
    });
    token_ok && task_ok
}

fn read_params(object: &Object) -> Result<Option<Object>, ()> {
    match object.get("params") {
        None => Ok(None),
        Some(Value::Object(params)) => {
            if params.get("_meta").is_some_and(|meta| !meta_is_valid(meta)) {
                Err(())
            } else {
                Ok(Some(params.clone()))
            }
        }
        Some(_) => Err(()),
    }
}

fn only_keys(object: &Object, allowed: &[&str]) -> bool {
    object.keys().all(|key| allowed.contains(&key))
}

/// Reads one parsed line. `None` means the SDK would drop it without an answer.
pub fn classify(value: &Value) -> Option<Incoming> {
    let object = value.as_object()?;
    if object.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
        return None;
    }
    if let Some(method) = object.get("method") {
        let method = method.as_str()?.to_string();
        let params = read_params(object).ok()?;
        return match object.get("id") {
            Some(id) => {
                if !only_keys(object, &["jsonrpc", "id", "method", "params"]) {
                    return None;
                }
                Some(Incoming::Request {
                    id: read_id(id)?,
                    method,
                    params,
                })
            }
            None => {
                if !only_keys(object, &["jsonrpc", "method", "params"]) {
                    return None;
                }
                Some(Incoming::Notification { method, params })
            }
        };
    }
    if let Some(result) = object.get("result") {
        if !only_keys(object, &["jsonrpc", "id", "result"]) {
            return None;
        }
        let id = read_id(object.get("id")?)?;
        let result = result.as_object()?;
        if result
            .get("_meta")
            .is_some_and(|meta| meta.as_object().is_none())
        {
            return None;
        }
        return Some(Incoming::Response {
            id,
            result: result.clone(),
        });
    }
    if let Some(error) = object.get("error") {
        if !only_keys(object, &["jsonrpc", "id", "error"]) {
            return None;
        }
        let id = match object.get("id") {
            Some(id) => Some(read_id(id)?),
            None => None,
        };
        let error = error.as_object()?;
        let code = error
            .get("code")?
            .as_f64()
            .filter(|code| code.fract() == 0.0)?;
        let message = error.get("message")?.as_str()?.to_string();
        return Some(Incoming::ErrorResponse {
            id,
            code: safe_integer(code),
            message,
        });
    }
    None
}

/// A failed request: the code and the text the SDK writes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RpcError {
    pub code: i64,
    pub message: String,
}

impl RpcError {
    pub const METHOD_NOT_FOUND: i64 = -32601;
    pub const INVALID_PARAMS: i64 = -32602;
    pub const INTERNAL_ERROR: i64 = -32603;

    pub fn new(code: i64, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn method_not_found() -> Self {
        Self::new(Self::METHOD_NOT_FOUND, "Method not found")
    }
}

/// The line for a successful answer. The SDK writes `result` before `jsonrpc` and `id`.
pub fn result_line(id: &Id, result: &Value) -> String {
    raw_result_line(id, &to_json(result))
}

/// [`result_line`] for a result already written as JSON.
pub fn raw_result_line(id: &Id, result_json: &str) -> String {
    let mut line = String::with_capacity(result_json.len() + 40);
    line.push_str("{\"result\":");
    line.push_str(result_json);
    line.push_str(",\"jsonrpc\":\"2.0\",\"id\":");
    line.push_str(&id.to_json());
    line.push_str("}\n");
    line
}

/// The line for a failed answer. The SDK writes `jsonrpc` and `id` before `error`.
pub fn error_line(id: &Id, error: &RpcError) -> String {
    let body = Value::object([
        ("code", Value::integer(error.code)),
        ("message", Value::string(error.message.clone())),
    ]);
    format!(
        "{{\"jsonrpc\":\"2.0\",\"id\":{},\"error\":{}}}\n",
        id.to_json(),
        to_json(&body)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::parse;

    fn read(line: &str) -> Option<Incoming> {
        classify(&parse(line).expect("parses"))
    }

    #[test]
    fn a_request_a_notification_and_a_response_are_told_apart() {
        assert!(matches!(
            read(r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#),
            Some(Incoming::Request {
                id: Id::Number(1),
                ..
            })
        ));
        assert!(matches!(
            read(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#),
            Some(Incoming::Notification { .. })
        ));
        assert!(matches!(
            read(r#"{"jsonrpc":"2.0","id":"a","result":{}}"#),
            Some(Incoming::Response { .. })
        ));
        assert!(matches!(
            read(r#"{"jsonrpc":"2.0","id":2,"error":{"code":-1,"message":"no"}}"#),
            Some(Incoming::ErrorResponse { .. })
        ));
    }

    #[test]
    fn an_id_must_be_a_string_or_a_safe_integer() {
        for bad in [
            r#"{"jsonrpc":"2.0","id":null,"method":"ping"}"#,
            r#"{"jsonrpc":"2.0","id":1.5,"method":"ping"}"#,
            r#"{"jsonrpc":"2.0","id":true,"method":"ping"}"#,
            r#"{"jsonrpc":"2.0","id":{},"method":"ping"}"#,
            r#"{"jsonrpc":"2.0","id":9007199254740992,"method":"ping"}"#,
            r#"{"jsonrpc":"2.0","id":12345678901234567890,"method":"ping"}"#,
        ] {
            assert_eq!(read(bad), None, "{bad}");
        }
        assert!(matches!(
            read(r#"{"jsonrpc":"2.0","id":1e2,"method":"ping"}"#),
            Some(Incoming::Request {
                id: Id::Number(100),
                ..
            })
        ));
        assert!(matches!(
            read(r#"{"jsonrpc":"2.0","id":-0,"method":"ping"}"#),
            Some(Incoming::Request {
                id: Id::Number(0),
                ..
            })
        ));
        assert!(matches!(
            read(r#"{"jsonrpc":"2.0","id":9007199254740991,"method":"ping"}"#),
            Some(Incoming::Request {
                id: Id::Number(9_007_199_254_740_991),
                ..
            })
        ));
    }

    #[test]
    fn anything_else_is_dropped() {
        for bad in [
            r#"{"id":1,"method":"ping"}"#,
            r#"{"jsonrpc":"1.0","id":1,"method":"ping"}"#,
            r#"{"jsonrpc":"2.0","id":1}"#,
            r#"{"jsonrpc":"2.0","id":1,"method":5}"#,
            r#"{"jsonrpc":"2.0","id":1,"method":"ping","extra":1}"#,
            r#"{"jsonrpc":"2.0","method":"ping","extra":1}"#,
            r#"{"jsonrpc":"2.0","id":1,"method":"ping","params":null}"#,
            r#"{"jsonrpc":"2.0","id":1,"method":"ping","params":[]}"#,
            r#"{"jsonrpc":"2.0","id":1,"method":"ping","params":{"_meta":5}}"#,
            r#"{"jsonrpc":"2.0","id":1,"method":"ping","params":{"_meta":{"progressToken":1.5}}}"#,
            r#"{"jsonrpc":"2.0","id":1,"result":null}"#,
            r#"{"jsonrpc":"2.0","result":{}}"#,
            r"[]",
            r"5",
            r"null",
            r#""x""#,
        ] {
            assert_eq!(read(bad), None, "{bad}");
        }
    }

    #[test]
    fn params_keep_unknown_keys_and_a_valid_meta() {
        let incoming = read(
            r#"{"jsonrpc":"2.0","id":1,"method":"ping","params":{"a":1,"_meta":{"progressToken":"t"}}}"#,
        );
        assert!(matches!(
            incoming,
            Some(Incoming::Request {
                params: Some(_),
                ..
            })
        ));
    }

    #[test]
    fn answers_are_written_in_the_sdks_key_order() {
        assert_eq!(
            result_line(&Id::Number(7), &Value::object::<&str>([])),
            "{\"result\":{},\"jsonrpc\":\"2.0\",\"id\":7}\n"
        );
        assert_eq!(
            error_line(&Id::text("a"), &RpcError::method_not_found()),
            "{\"jsonrpc\":\"2.0\",\"id\":\"a\",\"error\":{\"code\":-32601,\"message\":\"Method not found\"}}\n"
        );
    }
}
