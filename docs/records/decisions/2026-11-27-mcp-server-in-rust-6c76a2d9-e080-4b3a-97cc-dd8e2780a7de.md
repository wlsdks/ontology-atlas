---
id: 6c76a2d9-e080-4b3a-97cc-dd8e2780a7de
date: 2026-11-27
---
## 2026-11-27 — The MCP server is ported to Rust behind a differential harness

**Why**: The owner asked to move the MCP server to Rust, cleanly, even if large. The shipped server statically links LGPL code (`NOTICE.md`), is 62 MiB, holds 51.6 MB per session at start, and its rules are written again in the app's Rust and screens.
**Prior**: Upholds 2026-07-27 "The app embeds MCP" (same path, stdio), replacing its Bun runtime. Adds a build step to the source channel of `.claude/rules/surfaces.md`; `node <checkout>/mcp/src/index.js` stays as a launcher. Acts on the falsifier of 2026-09-11 "release bundle".
**Decision**: `docs/specs/2026-11-27-mcp-server-in-rust.md`. A function-for-function port into workspace crates shared with the app, the tool surface unchanged, safety guards proven first with planted inputs, each family proven equal per request against Node and the Bun binary before it counts; every `localeCompare` pinned to `'en'` beforehand; a proven family's behaviour frozen until cut-over; the Rust server ships when equal and no measured figure is worse than the Bun binary; then the JavaScript (except the launcher), Bun and the LGPL notice are deleted. No WebAssembly.
**Dissent**: Two languages are maintained during the port on code that changed 245 times in 30 days; byte equality is stricter than an agent needs; "no worse" lets a port ship that gained little.
**Falsifier**: A defect reaches a stable release that the harness could not have expressed; or a figure is worse at cut-over; or the 14-day drift stop rule fires.
**Owner**: jinan
