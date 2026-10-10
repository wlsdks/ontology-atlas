---
id: 59e792e1-fc95-4ded-a73d-c1f72aa35289
date: 2026-10-11
---
## 2026-10-11 — Split the MCP vault module by responsibility

**Why**: `mcp/src/vault.mjs` was 2,336 lines holding path confinement, document reads, the node-eligibility gate, atomic writes, document writes, graph queries and the backlink rewriter; it is now eight files in `mcp/src/vault/`. The gate fires only because two `tool-definitions/` files changed an import path.
**Prior**: 2026-10-11 "Split the MCP tool schema fragments by subject" stands: move verbatim, no barrel, importers name the owning file, old file deleted with no shim.
**Decision**: Declarations moved verbatim; the five tests whose subject is this module moved with it and changed only imports; every export's results and thrown errors over the existing test inputs were identical. `mcp/package.json` ships the eight files. The gate's state lives only in `vault/eligibility-gate.mjs`; writers reach it through `noteGateWrite`, `noteGateRemoval` and `noteParentGrowth`.
**Dissent**: The atomic writer imports the gate to drop its index on removal, which couples two files; kept because moving the invalidation is a behaviour change.
**Falsifier**: A probe difference for any export, a published package lacking one of the eight files, or a second instance of the gate state.
**Owner**: The lead agent's brief, 2026-10-11; the repository owner has not ruled on it.
