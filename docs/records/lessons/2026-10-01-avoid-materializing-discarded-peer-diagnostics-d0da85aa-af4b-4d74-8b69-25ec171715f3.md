---
id: d0da85aa-af4b-4d74-8b69-25ec171715f3
date: 2026-10-01
kind: gate-gap
status: reported
harness_area: performance
---
**Observed**: The concept read path materialized graph-warning text for every document although it returned one document. listConcepts likewise built every peer-list message although it returned only global error and warning counts. A 2,000-document shared-UID/shared-slug fixture measured 239.7 ms for full grouping versus 2.2 ms for selected-row grouping; count-only grouping measured 234.4 ms before versus 3.2 ms after, with exactly the same counts. New operation-count tests failed before scoped/count-only support and passed after.
**Cost**: Avoidable construction of peer-list text for discarded rows; separate engineering time and peak heap were not measured.
**Suspected cause**: Materializing a potentially quadratic diagnostic output before considering which rows or fields the caller consumes.
**Proposed change**: none; retain global validation and peer identities, but construct detailed text only where it is delivered. Compare severity/code counts and selected messages against full diagnostics to prevent false clean results.
