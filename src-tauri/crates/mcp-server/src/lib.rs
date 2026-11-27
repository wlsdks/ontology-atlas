//! The `ontology-atlas-mcp` program as a library. `README.md` maps the modules; the specification
//! `docs/specs/2026-11-27-mcp-server-in-rust.md` lists every way an answer differs from the
//! JavaScript server's.

pub mod answer;
pub mod arguments;
pub mod dispatch;
pub mod error;
pub mod protocol;
mod raw_json;
pub mod runtime;
pub mod server;
pub mod suggestions;
pub mod surface;
pub mod tools;
