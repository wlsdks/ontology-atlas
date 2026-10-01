---
id: 8d25aeeb-332c-4bad-9f6a-9fb0603f6806
date: 2026-09-30
kind: process
status: reported
harness_area: performance
---
**Observed**: The dense renderer fixture supplied overview geometry but omitted `layout: "islands"`. A CPU profile of that fixture attributed 388 samples to `fillRect`; 12 profiled paints had a 72ms median. An otherwise equivalent fixture explicitly using the production overview mode had an approximately 13ms median across eight repeated paints. Evidence: `dense-profile-before.json` and `dense-overview-before.json` under `/Users/jinan/scratch/atlas-scale-100k/`.
**Cost**: The previous fallback-path result was insufficient to locate the remaining production-overview bottleneck; one extra mode-specific probe was needed, with separate elapsed time unmeasured.
**Suspected cause**: Geometry presence was mistaken for selecting the overview batching path, which additionally requires an explicit layout mode and interaction state.
**Proposed change**: none; record renderer mode and interaction flags with each benchmark, and qualify resting overview, hover/selection fallback, and force/flow separately.
