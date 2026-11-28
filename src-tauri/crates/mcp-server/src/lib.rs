//! The `ontology-atlas-mcp` program as a library. `README.md` maps the modules; the specification
//! `docs/specs/2026-11-27-mcp-server-in-rust.md` lists every way an answer differs from the
//! JavaScript server's.

// The unit tests read the files a write left; the program's own code reaches the disk through
// `confined-files` (`clippy.toml`).
#![cfg_attr(
    test,
    allow(
        clippy::disallowed_methods,
        clippy::disallowed_types,
        reason = "unit tests read the files a write left"
    )
)]

pub mod analysis_records;
pub mod answer;
pub mod arguments;
pub mod audit;
pub mod consent;
pub mod dispatch;
pub mod error;
pub mod protocol;
mod raw_json;
pub mod runtime;
pub mod schema_check;
pub mod server;
pub mod suggestions;
pub mod surface;
pub mod tools;
pub mod write_checkpoint;
pub mod write_tool;
