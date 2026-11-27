//! The four methods the server answers: `initialize`, `ping`, `tools/list` and `tools/call`.
//! Every other method is `-32601 Method not found`, including the spec methods the server does not
//! offer (`resources/list`, `logging/setLevel`, `server/discover`, `tasks/list`). Cancellation is a
//! notification and belongs to the session.

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use answer_format::json::to_raw;
use serde::Serialize;
use serde_json::value::RawValue;

use super::message::Params;
use super::params::{initialize, tools_call, tools_list};
use super::reply::RpcError;
use super::Session;
use crate::dispatch::{call_tool, CallContext};
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

fn negotiated_version(requested: &str) -> &'static str {
    SUPPORTED_PROTOCOL_VERSIONS
        .iter()
        .find(|version| **version == requested)
        .copied()
        .unwrap_or(SUPPORTED_PROTOCOL_VERSIONS[0])
}

#[derive(Serialize)]
struct Empty {}

#[derive(Serialize)]
struct Capabilities {
    tools: Empty,
}

#[derive(Serialize)]
struct ServerInfo<'a> {
    name: &'a str,
    version: &'a str,
}

#[derive(Serialize)]
struct InitializeResult<'a> {
    #[serde(rename = "protocolVersion")]
    protocol_version: &'static str,
    capabilities: Capabilities,
    #[serde(rename = "serverInfo")]
    server_info: ServerInfo<'a>,
    instructions: String,
}

fn written<T: Serialize + ?Sized>(result: &T) -> Result<Box<RawValue>, RpcError> {
    to_raw(result).map_err(|_| RpcError::unexpected())
}

/// The result of one request, as JSON ready to send.
pub fn handle_request(
    session: &Arc<Session>,
    method: &str,
    params: Option<&Params>,
    cancelled: &AtomicBool,
) -> Result<Box<RawValue>, RpcError> {
    let surface = Surface::embedded();
    match method {
        "ping" => written(&Empty {}),
        "initialize" => {
            let initialize = initialize(params).map_err(RpcError::Internal)?;
            let version = negotiated_version(&initialize.protocol_version);
            session.set_client_capabilities(initialize.capabilities);
            written(&InitializeResult {
                protocol_version: version,
                capabilities: Capabilities { tools: Empty {} },
                server_info: ServerInfo {
                    name: &surface.server_name,
                    version: &surface.server_version,
                },
                instructions: surface.instructions(&session.config.modes),
            })
        }
        "tools/list" => {
            tools_list(params).map_err(RpcError::Internal)?;
            written(&surface.tools_list(&session.config.modes))
        }
        "tools/call" => {
            let call = tools_call(params).map_err(|issues| {
                RpcError::InvalidParams(format!("Invalid tools/call request: {issues}"))
            })?;
            let context = CallContext { session, cancelled };
            written(&call_tool(&context, &call.name, call.arguments))
        }
        _ => Err(RpcError::MethodNotFound),
    }
}
