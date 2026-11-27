//! The `ontology-atlas-mcp` program: the stdio protocol loop, the tool registry and its generated
//! surface, the answer envelope and the tool handlers.
//!
//! The server is a port of the JavaScript one (`mcp/src`), answer for answer: the same tools, the
//! same words, the same bytes. It depends on the family crates and on no async runtime.

pub mod dispatch;
pub mod envelope;
pub mod js_text;
pub mod json;
pub mod jsonrpc;
pub mod methods;
pub mod request_validation;
pub mod runtime;
pub mod server;
pub mod session;
pub mod suggestions;
pub mod surface;
pub mod tools;
