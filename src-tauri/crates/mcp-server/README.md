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
| `src/analysis_records/` | The analysis records in `.ontology-atlas/analyses`: one record read whole, judged against its format and digests; read-only, so it needs no permit or audit line |
| `src/arguments.rs` | A call's arguments as JSON text, read by a handler as the type it expects |
| `src/answer.rs` | `ToolOutput`, what a handler returns, and `CallToolResult`, how it is written |
| `src/error.rs` | `ToolError` and `ErrorCode`: the code is chosen where the failure is made, never read from its message |
| `src/surface.rs` + `surface/` | The generated tool list the program embeds and sends as written |
| `src/suggestions.rs` | The nearest allowed name for "did you mean" |
| `src/tools/writes/` | The vault writers (and `absorb_document`, which also rewrites the document it absorbs through `confined-files::AbsorbedFile`) and the two retired singular names (`add_concept`, `add_relation`): one file per tool, and beside them what they share: the vault as a write reads it (`vault_view`), the refusals every writer makes (`write_gates`, `slug_refusal`, `object_checks`), the one patch path (`patch_document`), the lean answer parts (`write_aftermath`, `answer_fields`, `referrer_rewrites`) |
| `src/tools.rs` | The handlers. A read tool joins `call`; a write tool joins `write_handler`, which names every `WriteTool` with no catch-all; `validate_wiki` is a read tool of its own file (`src/tools/validate_wiki.rs`, over `wiki-pages`); `connect_project_source` and `disconnect_project_source` are ported (`src/tools/writes/connect_project_source.rs`, `disconnect_project_source.rs`, over `project-source`; `project_source_selection.rs` chooses the project and folder for the call and for its consent card, `src/tools/project_source_scope.rs` holds the project's documents and graph hash and `project_meaning_context.rs` every fact a judgement of its meaning reads, which `finalize_project_meaning` and `meaning_readiness_facts.rs` (the `meaning_assessment` check of `health` and `workspace_brief`) share, `plain_refusal.rs` codes a plain sentence as the script server did); the members of one saved constellation are not ported yet |
| `tests/` | `protocol_table.rs` runs the program as an agent does; `oracle.rs` compares it with the JavaScript server on the rows that are not declared changes; `plan_answers.rs` states in full the `query_plan` answers the declared rows excuse whole (`plan_answers/`: one `<case>.tsv` of answers per case, `vaults/` the planted vaults) |

Rules this crate keeps:

- An answer is a typed `#[derive(Serialize)]` struct; the field order is the key order. Nothing builds
  a JSON tree, except a write's rows, which carry values the agent sent (frontmatter of any shape)
  in an ordered `vault_edit::Setting` so their order and number text survive.
- A tool's arguments are never read until its handler asks, so any nesting depth reaches the shell.
- Half of a surrogate pair is not text: a name is read with U+FFFD, an argument that holds one is
  refused by name, and a request id is written back exactly as sent.
- A write tool takes a `Permit` and returns a `WriteDone` (its answer and what to audit). The
  permit asked first (a call that says `confirm: false` is a preview and asks nobody) and holds
  the session's write lock until `dispatch` has recorded the write, so two approved writes to one
  concept run one after the other. `permit.apply` needs a `Reservations` value, so a tool states
  how files reserved for a person are read. No write tool takes `dryRun`: a preview is a handler
  that stops before it applies its plan.
- Consent fails closed: no capability to ask, no answer within 60 seconds, a cancelled call, a
  closed connection or anything but `accept` writes nothing, and a cancelled call withdraws its
  question. A preview (`confirm: false`) asks nothing and records nothing.
- An audit line that cannot be written, or a panic while writing it, goes to standard error and
  never changes a write's answer. The sidecar files are appended with one `write` on an
  append-mode handle; the write lock, not a file lock, keeps this server's own writes apart.
- Every difference from the JavaScript server is a numbered row in the specification; its corpus
  case and `tests/differential/declared-changes.json` entry arrive with the differential harness
  (rows 6 to 11 replay from slice 10).
