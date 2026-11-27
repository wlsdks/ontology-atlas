//! `ontology-atlas-mcp`: the local ontology read and write server, started by an agent over stdio.
//!
//! Environment: `OATLAS_VAULT` (vault root, default the working folder), `OATLAS_READ_ONLY`,
//! `OATLAS_TOOL_PROFILE`, `OATLAS_WRITE_CONSENT`.

fn main() {
    std::process::exit(mcp_server::server::run_stdio());
}
