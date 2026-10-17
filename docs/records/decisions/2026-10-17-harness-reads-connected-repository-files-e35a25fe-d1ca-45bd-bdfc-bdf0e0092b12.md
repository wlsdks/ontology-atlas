---
id: e35a25fe-d1ca-45bd-bdfc-bdf0e0092b12
date: 2026-10-17
---
## 2026-10-17 — Harness reads only the connected repository's harness files

**Why**: Since the vault-scope gate (#2083) the content commands refuse any root outside an opened vault, so a vault kept in its own repository (`docs/ontology`) could not read that repository's harness. On 2026-10-17 the owner chose "read only the designated files".
**Prior**: Narrows, for harness files only, the `vault_grants.rs` rule that a source root never widens what may be read and line 72 of `docs/specs/2026-09-28-gray-area-source-access.md`. Keeps 90154cfa (no sidecar or renderer path grants access) and 78daf781 (one recorded binding, separate grants).
**Decision**: Three read-only native commands take the opened vault and a project slug, never a source path. Rust resolves that project's one binding from the vault and requires the existing source grant: the repository holding a granted vault, or a folder picked in the app. Text comes only from a fixed allowlist (root guides, one-level `AGENTS.md`, `.claude` rules, hooks, skills and agents, `.agents`, `.cursor/rules`, `.codex/hooks`, `.githooks`, workflow YAML, `.gitignore`); `.mcp.json`, `.claude/settings.json`, `.codex/hooks.json`, `.codex/config.toml` and `package.json` return only server names, hooks, permissions, MCP headers and scripts. Secret names refuse every call; a link is read only to an allowlisted target inside the root; binary, FIFO and over-4 MiB files refuse. Other files are listed by name, never read. Nothing leaves the computer.
**Dissent**: Letting the content commands honour the source grant is smaller, but every vault command would then reach the whole repository. Reading all Markdown keeps transitive reach (61 named here, 19 after) by reading undesignated documents.
**Falsifier**: A file outside the allowlist, an env or header value, or a target outside the root reaches the WebView; or this repository stops yielding 12 of 13 places, 120 guides, 87 checks and 112 coverage declarations.
**Owner**: Stark
