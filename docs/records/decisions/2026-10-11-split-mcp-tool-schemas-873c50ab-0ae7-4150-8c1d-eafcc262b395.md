---
id: 873c50ab-0ae7-4150-8c1d-eafcc262b395
date: 2026-10-11
---
## 2026-10-11 — Split the MCP tool schema fragments by subject

**Why**: `mcp/src/server/tool-schemas.mjs` was 2,256 lines of JSON Schema fragments, limits and enum descriptions for every tool, so a reader looking for one result shape paged through all of them. It is now nine files in `mcp/src/server/tool-schemas/`, one per subject: repository evidence, meaning construction, vault node shapes, project source, post-write maintenance, git results, field primitives, enum descriptions and array limits. The gate fires only because the 16 `tool-definitions/` files changed their import paths.
**Prior**: 2026-10-10 "Split the MCP tool table into per-family files". That split left the schema fragments in one file. This one follows the same rule: move verbatim, no barrel, every importer names the file that owns the symbol.
**Decision**: Fragments moved verbatim; `tool-schemas.mjs` is deleted with no shim. Probe: `JSON.stringify` of every former export, `TOOLS_FOR_LIST` in the default, `OATLAS_READ_ONLY=1` and `OATLAS_TOOL_PROFILE=construction` environments, and the stdio `initialize` and `tools/list` responses were byte-identical before and after. `mcp/package.json` ships the nine files.
**Dissent**: `scripts/check-decision-record.mjs` watches `registry.mjs` and `tool-definitions/` but not this folder, as it did not watch the old file. A schema description change here reaches `tools/list` without needing a record until that gate is extended.
**Falsifier**: A `tools/list` or `initialize` byte difference appears between this split and the previous file, or a published package lacks one of the nine files.
**Owner**: The lead agent's brief for this change, 2026-10-11; the repository owner has not ruled on it.
