---
id: 8794e120-c97b-4af6-978c-197e3d151fef
date: 2026-10-04
kind: gate-gap
status: reported
harness_area: performance
---
**Observed**: Independent review removed only MCP's `active.fill(0)`. The cross-surface contract still passed24 fresh MCP calls, while an actual cached evaluator falsely mapped `ab` after matching `aaab` against `*a*a*b`. The new single-evaluation regression fails with observed edge count2 instead of1 under that defect; restoring the reset passes eight MCP tests. Earlier lesson8633a67d-5615-4f98-96ff-35374ecd0569 recognized same-instance proof, but its contract exercised only app reuse independently.
**Cost**: One reviewer fix round and targeted RED/GREEN cycle; elapsed time unknown. No failed CI round.
**Suspected cause**: Calling an API repeatedly is not proof of cache reuse when that API constructs a fresh matcher every call.
**Proposed change**: none. Keep the MCP regression at the actual evaluator owner, within one call, and probe reset omission separately in every implementation. Shared-result parity alone does not establish shared lifecycle coverage.
