//! The lines the server writes: a result, or an error, for one request id.

use answer_format::json::to_string;
use serde::Serialize;
use serde_json::value::RawValue;
use thiserror::Error;

use super::id::Id;

/// A request that failed at the protocol, not in a tool: the code and the words the SDK writes.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum RpcError {
    #[error("Method not found")]
    MethodNotFound,
    #[error("{0}")]
    InvalidParams(String),
    #[error("{0}")]
    Internal(String),
}

impl RpcError {
    pub fn code(&self) -> i64 {
        match self {
            Self::MethodNotFound => -32601,
            Self::InvalidParams(_) => -32602,
            Self::Internal(_) => -32603,
        }
    }

    /// What a request that fails without a word of its own is answered with.
    pub fn unexpected() -> Self {
        Self::Internal("Internal error".to_string())
    }
}

/// A successful answer. The SDK writes `result` before `jsonrpc` and `id`.
#[derive(Serialize)]
struct ResultLine<'a, T: Serialize + ?Sized> {
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

fn into_line(written: Result<String, serde_json::Error>) -> String {
    let mut line = written.unwrap_or_default();
    line.push('\n');
    line
}

/// The line for a successful answer.
pub fn result_line<T: Serialize + ?Sized>(id: &Id, result: &T) -> String {
    into_line(to_string(&ResultLine {
        result,
        jsonrpc: "2.0",
        id: &id.to_raw(),
    }))
}

/// The line for a failed answer.
pub fn error_line(id: &Id, error: &RpcError) -> String {
    let message = error.to_string();
    into_line(to_string(&ErrorLine {
        jsonrpc: "2.0",
        id: &id.to_raw(),
        error: ErrorBody {
            code: error.code(),
            message: &message,
        },
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn answers_are_written_in_the_sdks_key_order() {
        assert_eq!(
            result_line(&Id::Number(7), &serde_json::json!({})),
            "{\"result\":{},\"jsonrpc\":\"2.0\",\"id\":7}\n"
        );
        assert_eq!(
            error_line(&Id::text("a"), &RpcError::MethodNotFound),
            "{\"jsonrpc\":\"2.0\",\"id\":\"a\",\"error\":{\"code\":-32601,\"message\":\"Method not found\"}}\n"
        );
    }

    #[test]
    fn each_failure_has_its_own_code() {
        assert_eq!(RpcError::MethodNotFound.code(), -32601);
        assert_eq!(RpcError::InvalidParams(String::new()).code(), -32602);
        assert_eq!(RpcError::unexpected().code(), -32603);
        assert_eq!(RpcError::unexpected().to_string(), "Internal error");
    }
}
