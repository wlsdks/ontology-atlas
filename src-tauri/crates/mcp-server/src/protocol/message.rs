//! One line of standard input read as a message.
//!
//! A line that is not exactly a request, or the cancellation of one, gets no answer at all, which is
//! what the JavaScript SDK does: its message schema is strict, so an extra top-level key, a `null`
//! id, an id that is not a safe integer or a string, or `params` that is not an object all drop the
//! line. Nothing is read deeper than the message's own fields: what an agent nests inside `params`
//! stays text until a handler asks for it, so any depth the SDK accepts is accepted here.

use std::borrow::Cow;
use std::collections::HashMap;

use indexmap::IndexMap;
use serde_json::value::RawValue;

use super::id::Id;
use super::surrogates::{contains_lone, without_lone};
use crate::raw_json::{string_value, Kind};

/// The members of a request's `params`, in the order sent, each left as text.
#[derive(Debug, Default)]
pub struct Params {
    fields: IndexMap<String, Box<RawValue>>,
    /// The `arguments` of a `tools/call` that held half of a surrogate pair, found in the line as
    /// written: every string is read with the half replaced, so only the line can say.
    pub malformed_arguments: Vec<String>,
}

impl Params {
    pub fn from_fields(fields: IndexMap<String, Box<RawValue>>) -> Self {
        Self {
            fields,
            malformed_arguments: Vec::new(),
        }
    }

    pub fn get(&self, key: &str) -> Option<&RawValue> {
        self.fields.get(key).map(|raw| &**raw)
    }

    pub fn iter(&self) -> impl Iterator<Item = (&str, &RawValue)> {
        self.fields.iter().map(|(key, raw)| (key.as_str(), &**raw))
    }
}

#[derive(Debug)]
pub struct Request {
    pub id: Id,
    pub method: String,
    pub params: Option<Params>,
}

/// How the client answered a request the server made.
#[derive(Debug)]
pub enum ClientReply {
    Result(Box<RawValue>),
    /// The client answered with an error; its words are all a refusal needs.
    Failure {
        message: String,
    },
}

/// What the session acts on; every other line, and every notification but one, is dropped.
#[derive(Debug)]
pub enum Inbound {
    Request(Request),
    /// `notifications/cancelled`, naming the request to cancel.
    Cancel(Id),
    /// The client's answer to a request the server made (a question to a person).
    Answer {
        id: Id,
        reply: ClientReply,
    },
}

/// The top-level members of a message, each left as text.
type Members<'a> = HashMap<String, &'a RawValue>;

const RELATED_TASK_META_KEY: &str = "io.modelcontextprotocol/related-task";

fn only_keys(members: &Members<'_>, allowed: &[&str]) -> bool {
    members.keys().all(|key| allowed.contains(&key.as_str()))
}

/// `_meta` of a request or notification: an object whose `progressToken` is a string or a safe
/// integer and whose related-task entry names a task.
fn meta_is_valid(meta: &RawValue) -> bool {
    let Ok(meta) = serde_json::from_str::<Members<'_>>(meta.get()) else {
        return false;
    };
    let token_ok = meta
        .get("progressToken")
        .is_none_or(|token| Id::from_raw(token).is_some());
    let task_ok = meta.get(RELATED_TASK_META_KEY).is_none_or(|task| {
        serde_json::from_str::<Members<'_>>(task.get()).is_ok_and(|task| {
            task.get("taskId")
                .is_some_and(|id| Kind::of(id) == Kind::String)
        })
    });
    token_ok && task_ok
}

fn read_params(raw: &RawValue) -> Option<Params> {
    let fields: IndexMap<String, Box<RawValue>> = serde_json::from_str(raw.get()).ok()?;
    let params = Params::from_fields(fields);
    params
        .get("_meta")
        .is_none_or(meta_is_valid)
        .then_some(params)
}

fn cancelled_request(params: Option<&Params>) -> Option<Id> {
    params?.get("requestId").and_then(Id::from_raw)
}

/// Reads one message from `text`, which holds no lone surrogate.
fn classify(text: &str) -> Option<Inbound> {
    let members: Members<'_> = serde_json::from_str(text).ok()?;
    if string_value(members.get("jsonrpc")?).as_deref() != Some("2.0") {
        return None;
    }
    let Some(method) = members.get("method") else {
        return answer_to_server(&members);
    };
    let method = string_value(method)?;
    let params = match members.get("params") {
        Some(raw) => Some(read_params(raw)?),
        None => None,
    };
    match members.get("id") {
        Some(id) => {
            if !only_keys(&members, &["jsonrpc", "id", "method", "params"]) {
                return None;
            }
            Some(Inbound::Request(Request {
                id: Id::from_raw(id)?,
                method,
                params,
            }))
        }
        None => {
            if !only_keys(&members, &["jsonrpc", "method", "params"]) {
                return None;
            }
            if method == "notifications/cancelled" {
                cancelled_request(params.as_ref()).map(Inbound::Cancel)
            } else {
                None
            }
        }
    }
}

/// A message with no `method`: the client's answer to a request the server made. As in the SDK's
/// schema it is exactly `jsonrpc`, an `id`, and either a `result` object or an `error` with an
/// integer `code` and a string `message`; anything else is dropped.
fn answer_to_server(members: &Members<'_>) -> Option<Inbound> {
    if !only_keys(members, &["jsonrpc", "id", "result", "error"]) {
        return None;
    }
    let id = Id::from_raw(members.get("id")?)?;
    let reply = match (members.get("result"), members.get("error")) {
        (Some(result), None) if Kind::of(result) == Kind::Object => {
            ClientReply::Result(RawValue::from_string(result.get().to_string()).ok()?)
        }
        (None, Some(error)) => {
            let fields: Members<'_> = serde_json::from_str(error.get()).ok()?;
            // As in the schema, the code must be an integer, though nothing reads it.
            fields.get("code")?.get().parse::<i64>().ok()?;
            ClientReply::Failure {
                message: string_value(fields.get("message")?)?,
            }
        }
        _ => return None,
    };
    Some(Inbound::Answer { id, reply })
}

/// The names of the `tools/call` arguments of `text`, as written, that hold a lone surrogate. A line
/// whose argument names hold one cannot be read here; its arguments are then unknown ones, which
/// are refused for that reason before a value is looked at.
fn malformed_arguments(text: &str) -> Vec<String> {
    let arguments = serde_json::from_str::<Members<'_>>(text)
        .ok()
        .and_then(|members| members.get("params").copied())
        .and_then(|params| serde_json::from_str::<Members<'_>>(params.get()).ok())
        .and_then(|params| params.get("arguments").copied())
        .and_then(|arguments| serde_json::from_str::<Members<'_>>(arguments.get()).ok());
    arguments
        .into_iter()
        .flatten()
        .filter(|(_, value)| contains_lone(value.get()))
        .map(|(name, _)| name)
        .collect()
}

/// The ids of `text` as written, for a line whose lone surrogates were replaced everywhere else.
fn restore_exact_ids(text: &str, inbound: &mut Inbound) {
    let Ok(members) = serde_json::from_str::<Members<'_>>(text) else {
        return;
    };
    match inbound {
        Inbound::Request(request) => {
            if let Some(id) = members.get("id").and_then(|raw| Id::from_raw(raw)) {
                request.id = id;
            }
        }
        Inbound::Answer { .. } => {}
        Inbound::Cancel(id) => {
            let exact = members
                .get("params")
                .and_then(|raw| serde_json::from_str::<Members<'_>>(raw.get()).ok())
                .and_then(|params| params.get("requestId").and_then(|raw| Id::from_raw(raw)));
            if let Some(exact) = exact {
                *id = exact;
            }
        }
    }
}

/// One line as the reader hands it over, or `None` when the SDK would drop it unanswered. A request
/// id and a cancelled request id are read from the line as written, so a lone surrogate in one is
/// neither lost nor merged with another id, and the arguments that held one are named.
pub fn read_line(text: &str) -> Option<Inbound> {
    let readable = without_lone(text);
    let mut inbound = classify(&readable)?;
    if matches!(readable, Cow::Owned(_)) {
        restore_exact_ids(text, &mut inbound);
        if let Inbound::Request(Request {
            params: Some(params),
            ..
        }) = &mut inbound
        {
            params.malformed_arguments = malformed_arguments(text);
        }
    }
    Some(inbound)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(line: &str) -> Request {
        match read_line(line) {
            Some(Inbound::Request(request)) => request,
            other => panic!("not a request: {other:?}"),
        }
    }

    fn cancelled(line: &str) -> Option<Id> {
        match read_line(line) {
            Some(Inbound::Cancel(id)) => Some(id),
            _ => None,
        }
    }

    #[test]
    fn a_request_and_a_cancellation_are_told_apart_and_nothing_else_is_kept() {
        assert_eq!(
            request(r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#).id,
            Id::Number(1)
        );
        assert_eq!(
            cancelled(
                r#"{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":"x"}}"#
            ),
            Some(Id::text("x"))
        );
        for dropped in [
            r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#,
            r#"{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":1.5}}"#,
        ] {
            assert!(read_line(dropped).is_none(), "{dropped}");
        }
    }

    #[test]
    fn an_answer_to_a_server_request_is_a_result_object_or_an_error_with_a_code_and_words() {
        let reply = |line: &str| match read_line(line) {
            Some(Inbound::Answer { id, reply }) => Some((id, reply)),
            _ => None,
        };
        let (id, result) =
            reply(r#"{"jsonrpc":"2.0","id":0,"result":{"action":"accept"}}"#).expect("a result");
        assert_eq!(id, Id::Number(0));
        assert!(
            matches!(result, ClientReply::Result(raw) if raw.get() == r#"{"action":"accept"}"#)
        );
        let (_, failure) =
            reply(r#"{"jsonrpc":"2.0","id":"q","error":{"code":-32601,"message":"no"}}"#)
                .expect("an error");
        assert!(matches!(failure, ClientReply::Failure { message } if message == "no"));
        for dropped in [
            r#"{"jsonrpc":"2.0","id":0,"result":5}"#,
            r#"{"jsonrpc":"2.0","id":0,"result":[]}"#,
            r#"{"jsonrpc":"2.0","id":0}"#,
            r#"{"jsonrpc":"2.0","id":0,"result":{},"error":{"code":1,"message":"x"}}"#,
            r#"{"jsonrpc":"2.0","id":0,"result":{},"extra":1}"#,
            r#"{"jsonrpc":"2.0","id":null,"result":{}}"#,
            r#"{"jsonrpc":"2.0","id":0,"error":{"code":1.5,"message":"x"}}"#,
            r#"{"jsonrpc":"2.0","id":0,"error":{"code":1}}"#,
            r#"{"jsonrpc":"2.0","id":0,"error":"no"}"#,
        ] {
            assert!(reply(dropped).is_none(), "{dropped}");
        }
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
            assert!(read_line(bad).is_none(), "{bad}");
        }
        assert_eq!(
            request(r#"{"jsonrpc":"2.0","id":1e2,"method":"ping"}"#).id,
            Id::Number(100)
        );
        assert_eq!(
            request(r#"{"jsonrpc":"2.0","id":-0,"method":"ping"}"#).id,
            Id::Number(0)
        );
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
            r#"{"jsonrpc":"2.0","id":1,"method":"ping","params":{"_meta":[]}}"#,
            r#"{"jsonrpc":"2.0","id":1,"method":"ping","params":{"_meta":{"progressToken":1.5}}}"#,
            r#"{"jsonrpc":"2.0","id":1,"method":"ping","params":{"_meta":{"progressToken":null}}}"#,
            r#"{"jsonrpc":"2.0","id":1,"method":"ping","params":{"_meta":{"io.modelcontextprotocol/related-task":{}}}}"#,
            "[]",
            "5",
            "null",
            "\"x\"",
            "{not json",
            "",
        ] {
            assert!(read_line(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn nesting_is_never_read_so_any_depth_is_a_message() {
        let depth = 200_000;
        let nested = format!("{}{}", "[".repeat(depth), "]".repeat(depth));
        let line = format!(r#"{{"jsonrpc":"2.0","id":1,"method":"x","params":{{"a":{nested}}}}}"#);
        assert!(read_line(&line).is_some());
    }

    #[test]
    fn a_cancellation_finds_the_id_with_a_lone_surrogate_it_names() {
        let line = r#"{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":"a\ud800b"}}"#;
        let target = request(r#"{"jsonrpc":"2.0","id":"a\ud800b","method":"ping"}"#).id;
        assert_eq!(cancelled(line), Some(target));
        let other = request(r#"{"jsonrpc":"2.0","id":"a\ud801b","method":"ping"}"#).id;
        assert_ne!(cancelled(line), Some(other));
    }

    #[test]
    fn a_lone_surrogate_in_any_other_string_reads_as_the_replacement_character() {
        let request = request(r#"{"jsonrpc":"2.0","id":1,"method":"a\ud800b"}"#);
        assert_eq!(request.method, "a\u{fffd}b");
    }
}
