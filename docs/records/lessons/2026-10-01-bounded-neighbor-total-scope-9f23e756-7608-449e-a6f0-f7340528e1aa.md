---
id: 9f23e756-7608-449e-a6f0-f7340528e1aa
date: 2026-10-01
kind: mistake
status: reported
harness_area: graph-evidence
---
**Observed**: The prior scratch roadmap described readConcept as preserving complete neighbor counts. Current tool-executor.ts actually passes only its first 40 neighbors to packConceptEvidence, whose neighborsInfo.total counts that bounded input. The source trace disproved the scratch claim before this equivalent optimization; the caller's 40-row behavior remains unchanged.
**Cost**: One inaccurate scope statement in the external roadmap; elapsed cost unknown.
**Suspected cause**: A downstream total field was treated as a whole-graph census without checking its producer's slice.
**Proposed change**: none. Trace truncation at the producer before describing a total as complete, and keep equivalent performance work separate from a proposed public evidence-contract correction.
