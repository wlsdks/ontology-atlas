---
id: 38cb1907-d982-45e6-aee2-28dfd959a860
date: 2026-09-28
kind: gate-gap
status: reported
harness_area: mcp
---
**Observed**: Three MCP answers violated the outputSchema their own `tools/list` declares, and no gate ran them against it. `find_backlinks` and `delete_concept` rows from a wiki page, a plain note or a node without a `uid:` had no `uid`/`kind` while the row schema required both; `connection_info.guide.card` and every `guideText` are multi-line and failed the single-line `NON_BLANK_STRING_SCHEMA` pattern (`$.guide.card: pattern`). `cli/src/lib/query-result-contract.mjs` had recorded the backlink drift as "a deferred drift" since #2079, and `mcp/scripts/verify.mjs` pinned the old `required` list. The pins in `verify.mjs` and `mcp/src/integration.test.mjs` assert the declared schema's shape; only four tools' real answers were checked against it (`mcp/src/response-bounds.test.mjs`).
**Cost**: no CI round; the defects shipped. A client that validates `structuredContent` against `outputSchema` rejects these answers (this session's Claude Code client accepted `connection_info`).
**Suspected cause**: gates pin what the schema says, never whether real answers satisfy it, so a schema and its answers drift apart silently.
**Proposed change**: gate: run one representative real answer per tool through `scripts/lib/output-schema-errors.mjs`; `mcp/src/output-schema-conformance.test.mjs` now covers three tools and is the place to extend to all forty.
