---
id: 25acd458-37c3-40f3-aeba-c7adbe8f1319
date: 2026-10-01
kind: process
status: reported
harness_area: performance
---
**Observed**: The previous repeated `node_profile` benchmark passed a shared graph but no `sourceDocs`. Supplying the actual query option with 100,000 documents exposed an additional eager map construction on every call: 100 profiles took approximately 683ms. The query does not consume document bodies; a lazy request-local accessor removed that work. Evidence: `source-doc-context-before.jsonl` and `source-doc-context-after.jsonl` under `/Users/jinan/scratch/atlas-scale-100k/`.
**Cost**: An input-dependent query cost remained unmeasured through one preceding optimization; separate investigation time unmeasured.
**Suspected cause**: Benchmark options omitted the source documents that the production query entry supplies.
**Proposed change**: none; include production options in operation benchmarks and verify that unused source-dependent models are not built.
