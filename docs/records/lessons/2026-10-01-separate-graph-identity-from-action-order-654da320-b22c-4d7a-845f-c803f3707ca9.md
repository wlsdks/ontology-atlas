---
id: 654da320-b22c-4d7a-845f-c803f3707ca9
date: 2026-10-01
kind: tool-efficiency
status: reported
harness_area: performance
---
**Observed**: At 100,000 physical synthetic documents, Node and Bun produced the same graphHash and JSON byte count, but different complete-artifact SHA-256 digests. Per-field hashes localized the difference to canonicalizationActions. Comparing its serialized action multiset, with duplicates retained, matched across runtimes; every other field already matched exactly. The compiler builds actions in source enumeration order and excludes them from graphHash.
**Cost**: Additional physical-fixture reads and per-field comparison runs; separate elapsed time unmeasured.
**Suspected cause**: Treating graphHash as proof of byte-identical delivery conflates the structural hash contract with source-ordered repair proposals.
**Proposed change**: none; report graph identity, exact field identity, and source-ordered action content separately. Clarify the existing order contract in mcp/README.md without changing action selection or vault data.
