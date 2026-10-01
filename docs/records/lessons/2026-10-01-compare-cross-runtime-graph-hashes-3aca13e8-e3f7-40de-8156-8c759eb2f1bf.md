---
id: 3aca13e8-e3f7-40de-8156-8c759eb2f1bf
date: 2026-10-01
kind: process
status: reported
harness_area: performance
---
**Observed**: The first source/bundled compile probe asserted summary/indexed hash parity within each process, but its logged graph hashes differed across Node and Bun for the same physical fixture. Comparing complete artifacts showed only issue ordering and graphHash differences. The frozen pre-change compiler reproduced the same runtime-specific hashes, so the discrepancy predates unused-index gating. Evidence: `compiler-runtime-node.log`, `compiler-runtime-bun.log`, and the artifact dumps under `/Users/jinan/scratch/atlas-scale-100k/`.
**Cost**: One incomplete parity claim was avoided by inspecting the logged hashes; one additional runtime-dump comparison was required, elapsed time unmeasured separately.
**Suspected cause**: Directory enumeration order feeds the unsorted issue array included in graphHash, despite sorted nodes and edges.
**Proposed change**: none; compare cross-runtime hashes explicitly and track canonical issue ordering as a separate follow-up. Within-runtime unchanged outputs do not prove cross-runtime determinism.
