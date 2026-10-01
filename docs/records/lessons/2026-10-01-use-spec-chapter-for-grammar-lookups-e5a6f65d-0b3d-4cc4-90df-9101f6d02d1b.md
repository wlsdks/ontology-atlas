---
id: e5a6f65d-0b3d-4cc4-90df-9101f6d02d1b
date: 2026-10-01
kind: tool-efficiency
status: reported
harness_area: performance
---
**Observed**: Fetching the monolithic ECMAScript specification for the whitespace clause failed with content length over 4,194,305 bytes. Opening its official multipage lexical-grammar document succeeded. The runtime-equivalence probe separately checked every UTF-16 code unit against the existing regex.
**Cost**: One unsuccessful large-document lookup; separate elapsed time unmeasured.
**Suspected cause**: Choosing the entire specification rather than the relevant chapter.
**Proposed change**: none; use the authoritative chapter-sized specification URL for narrow grammar facts, and validate compatibility against the actual runtime when changing token classification.
