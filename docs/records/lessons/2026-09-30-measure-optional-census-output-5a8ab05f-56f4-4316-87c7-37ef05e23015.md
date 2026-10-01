---
id: 5a8ab05f-56f4-4316-87c7-37ef05e23015
date: 2026-09-30
kind: process
status: reported
harness_area: performance
---
**Observed**: The preceding census benchmark measured default count-only calls. The follow-up `/Users/jinan/scratch/atlas-scale-100k/census-ids.cjs` measured `collectCapabilityIds: true` against that committed implementation: a 10,000-node chain took 4007ms and its cycle variant took 8631ms, despite fast count-only aggregation.
**Cost**: Optional enumeration remained expensive through one intermediate commit; the two baseline measurements took approximately 12.6 seconds combined.
**Suspected cause**: The initial performance probe covered default options without separately measuring the existing optional output contract.
**Proposed change**: none; include existing option variants in the benchmark inventory before describing a data-structure optimization as broadly effective. Keep optional enumeration and output-size limits explicit.
