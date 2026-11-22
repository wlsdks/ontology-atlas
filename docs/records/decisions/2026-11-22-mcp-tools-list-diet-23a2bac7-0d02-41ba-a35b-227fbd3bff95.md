---
id: 23a2bac7-0d02-41ba-a35b-227fbd3bff95
date: 2026-11-22
---
## 2026-11-22 — tools/list writes repeated output subschemas once and keeps only calling rules in prose

**Why**: every agent reads `tools/list` each session: 532,222 bytes, 391,612 of them output schemas (seven write tools repeated one 29,643-byte maintenance schema) and 134,762 model-read. `pnpm mcp:tools-list-bytes` prints it per tool.
**Prior**: 2026-10-10 "Split the MCP tool table into per-family files" makes a `tools/list` byte change a recorded change; this is it.
**Decision**: repeated output subtrees go once under the root `$defs`, referenced by a bare `$ref`; input schemas stay inline for model APIs. Descriptions keep order, write-safety, approval and evidence rules and drop restated output fields, code lists and name-only argument text. Full profile 532,222 → 319,507 wire bytes, model-read 134,762 → 114,594; construction 221,551 → 178,149, model-read 101,455 → 83,845. Without prose, every input schema, inlined output schema, annotation and order equals the old registry; tests inline each listed schema back to its definition and run real answers through the SDK's Ajv validator.
**Dissent**: `analyze_repo_structure`'s `proposal` and `qualification` still cost about 24 KB: the handler answers a schema-invalid proposal with findings, so a bare object would change what a validating host rejects.
**Falsifier**: a supported host fails a structured answer over `$ref`, or an agent makes a wrong first call the removed prose would have prevented.
**Owner**: the lead agent's brief, 2026-11-22.
