---
id: d39557a9-fc52-474e-8328-034a1cc8faf4
date: 2026-09-30
kind: process
status: reported
harness_area: performance
---
**Observed**: The preceding 100,000-node renderer fixture used hidden source labels and placed most source marks outside the canvas. Turning on every name and placing marks inside the viewport exposed a 6.3-second paint despite the cached world grid. Evidence: `labels-dense-results.json`, `labels-dense-filtered-results.json`, and subsequent qualified probes under `/Users/jinan/scratch/atlas-scale-100k/`.
**Cost**: The dense eligible-label mode remained unmeasured through the previous overview optimization; separate investigation time was not measured.
**Suspected cause**: Benchmark mode and density were treated as one fixture shape, and coarse grid cells were not tested for large candidate populations within each cell.
**Proposed change**: none; benchmark label eligibility and occupancy independently, including all-names-visible and many-marks-inside-the-viewport cases. Freeze comparative baseline helper dependencies as well as the top-level renderer.
