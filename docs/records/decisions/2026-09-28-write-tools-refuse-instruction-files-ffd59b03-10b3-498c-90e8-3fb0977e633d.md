---
id: ffd59b03-10b3-498c-90e8-3fb0977e633d
date: 2026-09-28
---
## 2026-09-28 — Write tools never author agent instruction files or hidden paths

**Why**: owner, 2026-09-27: verify security so that no issue ships. MCP and CLI write tools had no rule against naming a file coding agents load as instructions, a hidden configuration folder, or a slug with control or invisible characters, and a rename rewrote links inside any file that referred to the node.
**Prior**: extends 2026-09-27 "A change on a security surface gets the security lens" to the vault write side; `absorb_document` stays the one sanctioned rewrite of a source file, behind its dry run, backup and repository boundary.
**Decision**: one write-side slug rule, `unwritableSlugIssue` in `mcp/src/schema.mjs`, guards every MCP write primitive and lifecycle tool and the CLI's `add`, `import` and `relate`, checked on the slug as typed and on the resolved location. A write never names a segment starting with `.`, a segment ending like a Windows short name, a control or invisible character, an agent instruction file (`AGENTS`, `AGENTS.override`, `CLAUDE`, `CLAUDE.local`, `GEMINI`, in any letter case and folder), or the root `README`; the refusal names the rule and a slug to use instead, and reads are unchanged. A rename, merge or reclassify leaves a referring file it may not write as it was and names it in `warnings`, which `rename_concept`'s output schema now carries. `agent-instruction-files.contract.test.ts` keeps the rule beside the agent-files classifier.
**Dissent**: refusing the whole rename when an instruction file refers to the node would keep that file current, but it would block ordinary vault upkeep over a file a person edits by hand anyway; the warning names the file instead. A node whose own name is an instruction-file stem now needs a fuller name.
**Falsifier**: a person who needs a node named after an instruction-file stem and cannot name it otherwise, or an agent that follows a stale link a rename warning had named; the second means the rename should refuse rather than warn.
**Owner**: Stark
