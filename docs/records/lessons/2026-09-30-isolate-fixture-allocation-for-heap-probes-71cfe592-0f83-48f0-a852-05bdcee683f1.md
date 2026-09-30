---
id: 71cfe592-0f83-48f0-a852-05bdcee683f1
date: 2026-09-30
kind: tool-efficiency
status: reported
harness_area: performance
---
**Observed**: The initial retained-heap probe kept fixture allocation and measurement in one loop and reported -5.95 MiB after constructing a dense 100,000-point index. That delta could not attribute the new index's storage. Moving fixture allocation into a returned setup function and measuring after collection produced positive deltas: 0.93 MiB dense and 8.09 MiB sparse for array cells. Singleton-cell storage then measured 0.95 MiB dense and 2.75 MiB sparse. Evidence: `label-index-heap-before.jsonl`, `label-index-heap-before-fixed.jsonl`, `label-index-heap-after.jsonl` under `/Users/jinan/scratch/atlas-scale-100k/`.
**Cost**: One discarded memory sample batch and an extra measurement pass; separate elapsed time was not measured.
**Suspected cause**: Temporary fixture-allocation objects remained live in the measuring frame at the baseline collection; freeing them later contaminated the index delta.
**Proposed change**: none; construct fixtures in a separate returned function, keep only intended roots, and reject negative allocation deltas as qualification evidence.
