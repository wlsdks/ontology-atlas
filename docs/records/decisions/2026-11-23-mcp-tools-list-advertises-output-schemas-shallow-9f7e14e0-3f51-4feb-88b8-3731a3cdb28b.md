---
id: 9f7e14e0-3f51-4feb-88b8-3731a3cdb28b
date: 2026-11-23
---
## 2026-11-23 — tools/list advertises each output schema cut to its top level

**Why**: After input schemas went shallow, the full-profile `tools/list` response was still 263,560 bytes, 197,504 of them output schemas. Claude Code and Codex do not show output schemas to the model, but every connecting host still parses them, and Codex's code mode folds them into the tool descriptions its model reads.
**Prior**: Extends the 2026-11-22 decision that tools/list advertises deep input schemas shallow; the full result contracts stay in the tool definitions, and real answers are still checked against them.
**Decision**: An advertised output schema keeps the root type, `required` and `additionalProperties`, and each top-level property with its type; nested objects and arrays are open, and only the `canConfirm` description stays. The shared-subschema `$defs` hoisting is removed, since nothing repeats any more. Every answer that satisfies the contract also satisfies the advertised schema. Output schemas: 197,504 to 19,728 bytes on the full profile and 91,024 to 7,779 on construction; whole response 263,560 to 85,784 and 135,472 to 52,227. In Codex code mode the 40 tool descriptions went from 303,275 to 248,450 characters.
**Dissent**: A client that types results from the advertised schema, as Codex code mode does, now sees `unknown` below the top level and loses the enum values and the per-field descriptions.
**Falsifier**: a host that validates `structuredContent` and rejects an answer the full contract accepts, or a code-mode field trial in which builds read results worse than the base's.
**Owner**: Stark
