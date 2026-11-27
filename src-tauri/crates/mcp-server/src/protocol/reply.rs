//! The lines the server writes: a result, or an error, for one request id.
//!
//! A reply is written straight to the output, never held as text. Before the first byte goes out the
//! reply is written once to nowhere: a reply that cannot be written is then answered with `-32603`
//! instead, so a line is never half written and a request is never answered with an empty line.

use std::io::{self, BufWriter, Write};

use answer_format::json::to_writer;
use serde::{Serialize, Serializer};
use serde_json::value::RawValue;
use thiserror::Error;

use super::id::Id;
use super::params::Issues;
use crate::answer::CallToolResult;

/// A request that failed at the protocol, not in a tool: the code and the words the SDK writes.
#[derive(Debug, Error)]
pub enum RpcError {
    #[error("Method not found")]
    MethodNotFound,
    /// `tools/call` params that are not a call (`-32602`).
    #[error("Invalid tools/call request: {0}")]
    InvalidToolCall(Issues),
    /// `initialize` or `tools/list` params that are not valid (`-32603`, as the SDK answers).
    #[error("{0}")]
    InvalidRequest(Issues),
    /// A request that failed without a word of its own.
    #[error("Internal error")]
    Unexpected,
}

impl RpcError {
    pub fn code(&self) -> i64 {
        match self {
            Self::MethodNotFound => -32601,
            Self::InvalidToolCall(_) => -32602,
            Self::InvalidRequest(_) | Self::Unexpected => -32603,
        }
    }
}

/// The result of a request, written as it is held.
#[derive(Debug)]
pub enum Answer {
    /// A small result, already JSON.
    Raw(Box<RawValue>),
    /// A tool call's result, whose text can be large.
    Call(CallToolResult),
}

impl Serialize for Answer {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Raw(raw) => raw.serialize(serializer),
            Self::Call(result) => result.serialize(serializer),
        }
    }
}

/// A successful answer. The SDK writes `result` before `jsonrpc` and `id`.
#[derive(Serialize)]
struct ResultLine<'a, T: Serialize> {
    result: &'a T,
    jsonrpc: &'static str,
    id: &'a RawValue,
}

#[derive(Serialize)]
struct ErrorBody<'a> {
    code: i64,
    message: &'a str,
}

/// A failed answer. The SDK writes `jsonrpc` and `id` before `error`.
#[derive(Serialize)]
struct ErrorLine<'a> {
    jsonrpc: &'static str,
    id: &'a RawValue,
    error: ErrorBody<'a>,
}

const WRITE_BUFFER_BYTES: usize = 64 * 1024;

pub(super) fn write_line<T: Serialize>(output: &mut dyn Write, line: &T) -> io::Result<()> {
    let mut buffered = BufWriter::with_capacity(WRITE_BUFFER_BYTES, output);
    to_writer(&mut buffered, line)?;
    buffered.write_all(b"\n")?;
    buffered.flush()
}

fn write_error(output: &mut dyn Write, id: &RawValue, error: &RpcError) -> io::Result<()> {
    write_line(
        output,
        &ErrorLine {
            jsonrpc: "2.0",
            id,
            error: ErrorBody {
                code: error.code(),
                message: &error.to_string(),
            },
        },
    )
}

/// Writes the answer to `id`: the result, or the error. The line ends in `\n` alone, on every
/// platform.
pub fn write_reply<T: Serialize>(
    output: &mut dyn Write,
    id: &Id,
    outcome: &Result<T, RpcError>,
) -> io::Result<()> {
    let id = id.to_raw();
    match outcome {
        Ok(answer) => {
            let line = ResultLine {
                result: answer,
                jsonrpc: "2.0",
                id: &id,
            };
            if to_writer(io::sink(), &line).is_ok() {
                write_line(output, &line)
            } else {
                write_error(output, &id, &RpcError::Unexpected)
            }
        }
        Err(error) => write_error(output, &id, error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn written<T: Serialize>(id: &Id, outcome: &Result<T, RpcError>) -> String {
        let mut bytes = Vec::new();
        write_reply(&mut bytes, id, outcome).expect("writes");
        String::from_utf8(bytes).expect("utf-8")
    }

    fn raw(text: &str) -> Answer {
        Answer::Raw(RawValue::from_string(text.to_string()).expect("json"))
    }

    #[test]
    fn answers_are_written_in_the_sdks_key_order_and_end_in_a_bare_newline() {
        assert_eq!(
            written(&Id::Number(7), &Ok(raw("{}"))),
            "{\"result\":{},\"jsonrpc\":\"2.0\",\"id\":7}\n"
        );
        assert_eq!(
            written::<Answer>(&Id::text("a"), &Err(RpcError::MethodNotFound)),
            "{\"jsonrpc\":\"2.0\",\"id\":\"a\",\"error\":{\"code\":-32601,\"message\":\"Method not found\"}}\n"
        );
    }

    /// A result that fails while it is written.
    struct Unwritable;

    impl Serialize for Unwritable {
        fn serialize<S: Serializer>(&self, _: S) -> Result<S::Ok, S::Error> {
            Err(serde::ser::Error::custom("cannot be written"))
        }
    }

    #[test]
    fn a_result_that_cannot_be_written_is_answered_with_an_internal_error_never_an_empty_line() {
        assert_eq!(
            written(&Id::Number(3), &Ok(Unwritable)),
            "{\"jsonrpc\":\"2.0\",\"id\":3,\"error\":{\"code\":-32603,\"message\":\"Internal error\"}}\n"
        );
    }
}
