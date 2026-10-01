---
id: 34a22d2a-12bb-41a0-a4af-83de8c2021ff
date: 2026-10-01
kind: gate-gap
status: reported
harness_area: performance
---
**Observed**: Existing graph-request load tests did not cover standalone get_concept. A new descriptor-count probe reproduced 3 opens of the selected doc and 2 of another doc: getConcept had loaded docs locally but the dangling-warning fallback loaded the entire vault again. A separate missing-reference probe recorded 1,000,000 suffix candidate checks for 1,000 nodes and unique missing refs. Both regressions failed before the fixes and passed after.
**Cost**: The physical 100,000-document Node getConcept fixture measured 6,246.8 ms before and 3,213.1 ms after reuse. The 10,000-node unique-missing-reference grouping fixture measured 3,242.8 ms before and 18.3 ms after suffix indexing; these are single paired timings, not universal budgets.
**Suspected cause**: Coverage focused on graph operations and ordinary references, missing standalone reads and absent-target resolution fallback complexity.
**Proposed change**: none; keep operation-count regressions for standalone request inventory reuse and adversarial missing references. Preserve the selected document's fresh reread and verify same-mtime edits on the next request.
