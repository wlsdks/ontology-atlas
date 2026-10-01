---
id: 700c45bd-3694-4cd2-a794-b80a343966c5
date: 2026-10-01
kind: process
status: reported
harness_area: performance
---
**Observed**: The first unchanged-mtime alias refresh probe logged `sameMtime: false` for the source process. Restoring filesystem timestamps from JavaScript Date values had lost their fractional-millisecond precision. The corrected probe assigns an exact epoch before the initial read and asserts that exact mtime after the alias edit before validating refreshed results.
**Cost**: One insufficient source-process cache-invalidation probe and one corrected source/bundled rerun; separate elapsed time unmeasured.
**Suspected cause**: Treating a Date representation as an exact round trip for filesystem timestamp precision.
**Proposed change**: none; fix the fixture timestamp to an exactly representable value before unchanged-mtime tests, and assert preservation before attributing cache refresh to fresh bytes.
