//! The `ontology-atlas-mcp` program: the stdio protocol loop, the tool registry and its generated
//! surface, the answer envelope and the tool handlers.
//!
//! The server answers what the JavaScript one (`mcp/src`) answered: the same tools, the same words,
//! the same bytes, except the changes the specification declares. It is written as Rust: answers
//! are typed structs written by `serde_json`, errors are an enum with one variant per code, and a
//! tool's arguments stay JSON text until its handler reads them as the type it expects. It depends
//! on the family crates and on no async runtime.

pub mod answer;
pub mod arguments;
pub mod dispatch;
pub mod error;
mod json_text;
pub mod protocol;
pub mod runtime;
pub mod server;
pub mod suggestions;
pub mod surface;
pub mod tools;
