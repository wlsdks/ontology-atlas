# mcp-server

The `ontology-atlas-mcp` program: it reads JSON-RPC lines on standard input, answers on standard
output, and hands each `tools/call` to a tool handler. Start at `src/protocol/mod.rs` to follow a
request, then `src/dispatch.rs` for the checks every call passes.

| Where | What lives there |
|---|---|
| `src/main.rs`, `src/server.rs` | Starting: the checks that stop the process, the line logged on connect, the session on standard input and output |
| `src/runtime.rs` | Modes and the vault root, read once from the environment |
| `src/protocol/` | One session: the reader thread, the worker that answers in order, cancellation, the `initialize` / `ping` / `tools/list` / `tools/call` methods, request ids, and the lines written back |
| `src/dispatch.rs` | `tools/call`: read-only refusal, unknown and malformed arguments, the handler, a handler that panics, `CallContext` (what a handler may ask of its call, including a question to the client) |
| `src/write_tool.rs` | `WriteTool`, the closed list of tools that change a vault; a unit test holds it equal to the generated surface |
| `src/write_checkpoint.rs` | `Permit`: read-only mode, then (unless a dry run) consent and the session's write lock, then the vault and the all-or-nothing apply. A write handler is a function of a permit, and `clippy.toml` refuses a write made around it |
| `src/consent/` | The question a person is asked before a write (`elicitation/create`): its text per tool, the answer read, and every refusal in words |
| `src/audit/` | What a finished write adds to `.ontology-atlas/activity.jsonl` and `map-analysis.jsonl`, through `confined-files`' `VaultSidecar` |
| `src/arguments.rs` | A call's arguments as JSON text, read by a handler as the type it expects |
| `src/answer.rs` | `ToolOutput`, what a handler returns, and `CallToolResult`, how it is written |
| `src/error.rs` | `ToolError` and `ErrorCode`: the code is chosen where the failure is made, never read from its message |
| `src/surface.rs` + `surface/` | The generated tool list the program embeds and sends as written |
| `src/suggestions.rs` | The nearest allowed name for "did you mean" |
| `src/tools.rs` | The handlers. A read tool joins `call`; a write tool joins `write_handler`, which names every `WriteTool` with no catch-all |
| `tests/` | `protocol_table.rs` runs the program as an agent does; `oracle.rs` compares it with the JavaScript server on the rows that are not declared changes |

Rules this crate keeps:

- An answer is a typed `#[derive(Serialize)]` struct; the field order is the key order. Nothing builds
  a JSON tree.
- A tool's arguments are never read until its handler asks, so any nesting depth reaches the shell.
- Half of a surrogate pair is not text: a name is read with U+FFFD, an argument that holds one is
  refused by name, and a request id is written back exactly as sent.
- A write tool takes a `Permit` and returns a `WriteDone` (its answer and what to audit). A dry run
  gets a `PreviewPermit` that can read the vault and cannot write; anything else gets a
  `WritePermit` that asked first and holds the session's write lock until `dispatch` has recorded
  the write, so two approved writes to one concept run one after the other. `permit.apply` needs a
  `Reservations` value, so a tool states how files reserved for a person are read.
- Consent fails closed: no capability to ask, no answer within 60 seconds, a cancelled call, a
  closed connection or anything but `accept` writes nothing, and a cancelled call withdraws its
  question. A dry run asks nothing and records nothing.
- An audit line that cannot be written, or a panic while writing it, goes to standard error and
  never changes a write's answer. The sidecar files are appended with one `write` on an
  append-mode handle; the write lock, not a file lock, keeps this server's own writes apart.
- Every difference from the JavaScript server is a numbered row in the specification; its corpus
  case and `tests/differential/declared-changes.json` entry arrive with the differential harness
  (rows 6 to 11 replay from slice 10).
