---
id: 873c50ab-0ae7-4150-8c1d-eafcc262b395
date: 2026-10-11
---
## 2026-10-11 — Split the MCP tool schema fragments by subject

**Why**: `mcp/src/server/tool-schemas.mjs` was 2,256 lines of schema fragments, limits and enum descriptions, so finding one result shape meant paging through all of them. It is now ten files in `mcp/src/server/tool-schemas/`, one per subject. The gate fires only because 16 `tool-definitions/` files changed import paths.
**Prior**: 2026-10-10 "Split the MCP tool table into per-family files" stands: move verbatim, no barrel, importers name the owning file. 2026-09-12 "The MCP entry point is wiring" set the falsifier "a tool whose description or schema changes without `pnpm decisions:check` firing"; it is met for `tool-schemas/`, as for the old file, until a separate gate change makes `check-decision-record.mjs` watch the folder.
**Decision**: Fragments moved verbatim; `tool-schemas.mjs` is deleted with no shim. Every former export, `TOOLS_FOR_LIST` in three environments, and the stdio `initialize` and `tools/list` responses were byte-identical before and after. `mcp/package.json` ships the ten files.
**Dissent**: One `rg` over one file becomes a search over ten; answered by the `tool-schemas` row in `mcp/README.md`, which names each subject, not by a re-export barrel that would make the surface ambiguous again.
**Falsifier**: A `tools/list` or `initialize` byte difference appears against the previous file, or a published package lacks one of the ten files.
**Owner**: The lead agent's brief, 2026-10-11; the repository owner has not ruled on it.
