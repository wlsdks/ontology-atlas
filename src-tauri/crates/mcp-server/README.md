# mcp-server

The `ontology-atlas-mcp` program: it reads JSON-RPC lines on standard input, answers on standard
output, and hands each `tools/call` to a tool handler. Start at `src/protocol/mod.rs` to follow a
request, then `src/dispatch.rs` for the checks every call passes.

| Where | What lives there |
|---|---|
| `src/main.rs`, `src/server.rs` | Starting: the checks that stop the process, the line logged on connect, the session on standard input and output |
| `src/runtime.rs` | Modes and the vault root, read once from the environment |
| `src/protocol/` | One session: the reader thread, the worker that answers in order, cancellation, the `initialize` / `ping` / `tools/list` / `tools/call` methods, request ids, and the lines written back |
| `src/dispatch.rs` | `tools/call`: read-only refusal, unknown and malformed arguments, the handler, a handler that panics, `CallContext` (what a handler may ask of its call) |
| `src/arguments.rs` | A call's arguments as JSON text, read by a handler as the type it expects |
| `src/answer.rs` | `ToolOutput`, what a handler returns, and `CallToolResult`, how it is written |
| `src/error.rs` | `ToolError` and `ErrorCode`: the code is chosen where the failure is made, never read from its message |
| `src/surface.rs` + `surface/` | The generated tool list the program embeds and sends as written |
| `src/suggestions.rs` | The nearest allowed name for "did you mean" |
| `src/tools.rs` | The handlers. A family of tools joins by adding its names here |
| `tests/` | `protocol_table.rs` runs the program as an agent does; `oracle.rs` compares it with the JavaScript server on the rows that are not declared changes |

Rules this crate keeps:

- An answer is a typed `#[derive(Serialize)]` struct; the field order is the key order. Nothing builds
  a JSON tree.
- A tool's arguments are never read until its handler asks, so any nesting depth reaches the shell.
- Half of a surrogate pair is not text: a name is read with U+FFFD, an argument that holds one is
  refused by name, and a request id is written back exactly as sent.
- Every difference from the JavaScript server is a numbered row in the specification, with a corpus
  case in `tests/differential/corpus/shell/` and an entry in `tests/differential/declared-changes.json`.
