---
id: c727bda8-0875-48bc-831a-5ac213347bc7
date: 2026-10-05
kind: mistake
status: reported
harness_area: performance
---
**Observed**: Reusing output objects and trigonometric arrays in `updateDomeFrame` preserved exact frame values but increased the isolated 10,000-node median from 0.986 ms to 1.077 ms across six alternating measurements. The prototype was reverted. The before/after source and measurements are retained in the external `atlas-projection-20261006` scratch directory.
**Cost**: One rejected prototype and its paired benchmark; elapsed investigation time unknown.
**Suspected cause**: Unknown. Fewer source-level allocations do not establish lower execution cost in an optimizing JavaScript engine.
**Proposed change**: none. Preserve an exact-output reference and compare alternating old/new runs before keeping an allocation-reuse optimization.
