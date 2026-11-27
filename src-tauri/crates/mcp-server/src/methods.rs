//! The five methods the server answers: `initialize`, `ping`, `tools/list`, `tools/call`, and
//! (as a notification) cancellation, which the session handles. Every other method is `-32601
//! Method not found`, including the spec methods the server does not offer (`resources/list`,
//! `logging/setLevel`, `server/discover`, `tasks/list`).

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use crate::dispatch::{call_tool, CallContext};
use crate::json::{Object, Value};
use crate::jsonrpc::RpcError;
use crate::request_validation::{validate_initialize, validate_tools_call, validate_tools_list};
use crate::session::Session;
use crate::surface::Surface;

/// The protocol versions the server negotiates, newest first. The SDK's legacy list; a client that
/// names a version not here is answered with the first.
pub const SUPPORTED_PROTOCOL_VERSIONS: [&str; 5] = [
    "2025-11-25",
    "2025-06-18",
    "2025-03-26",
    "2024-11-05",
    "2024-10-07",
];

/// A successful answer: a value, or JSON already written.
pub enum Reply {
    Value(Value),
    RawJson(String),
}

fn negotiated_version(requested: &str) -> &'static str {
    SUPPORTED_PROTOCOL_VERSIONS
        .iter()
        .find(|version| **version == requested)
        .copied()
        .unwrap_or(SUPPORTED_PROTOCOL_VERSIONS[0])
}

pub fn handle_request(
    session: &Arc<Session>,
    method: &str,
    params: Option<&Object>,
    cancelled: &AtomicBool,
) -> Result<Reply, RpcError> {
    let surface = Surface::embedded();
    match method {
        "ping" => Ok(Reply::Value(Value::Object(Object::new()))),
        "initialize" => {
            let initialize = validate_initialize(params)
                .map_err(|message| RpcError::new(RpcError::INTERNAL_ERROR, message))?;
            session.set_client_capabilities(initialize.capabilities);
            Ok(Reply::Value(Value::object([
                (
                    "protocolVersion",
                    Value::string(negotiated_version(&initialize.protocol_version)),
                ),
                (
                    "capabilities",
                    Value::object([("tools", Value::Object(Object::new()))]),
                ),
                (
                    "serverInfo",
                    Value::object([
                        ("name", Value::string(surface.server_name.clone())),
                        ("version", Value::string(surface.server_version.clone())),
                    ]),
                ),
                (
                    "instructions",
                    Value::string(surface.instructions(&session.config.modes)),
                ),
            ])))
        }
        "tools/list" => {
            validate_tools_list(params)
                .map_err(|message| RpcError::new(RpcError::INTERNAL_ERROR, message))?;
            Ok(Reply::RawJson(
                surface.tools_list_result_json(&session.config.modes),
            ))
        }
        "tools/call" => {
            let call = validate_tools_call(params).map_err(|message| {
                RpcError::new(
                    RpcError::INVALID_PARAMS,
                    format!("Invalid tools/call request: {message}"),
                )
            })?;
            let context = CallContext { session, cancelled };
            Ok(Reply::Value(call_tool(
                &context,
                &call.name,
                call.arguments,
            )))
        }
        _ => Err(RpcError::method_not_found()),
    }
}
