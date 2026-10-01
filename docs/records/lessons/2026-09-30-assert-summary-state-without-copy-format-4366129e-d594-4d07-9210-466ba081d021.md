---
id: 4366129e-d594-4d07-9210-466ba081d021
date: 2026-09-30
kind: process
status: reported
harness_area: performance
---
**Observed**: The new source-summary update test expected `not compiled 14`, but the folded summary rendered `not compiled · 14`. The changed state and count were correct; the test accidentally assumed the punctuation of a different presentation. The assertion now checks the folded-state attribute, numeric count, and removal of the obsolete state.
**Cost**: One focused failing test run; separate elapsed time was not measured.
**Suspected cause**: Copying a nearby unfolded-summary text expectation instead of asserting the current-state behavior under test.
**Proposed change**: none; assert state and count for aggregation regressions, and leave punctuation to intentional copy tests when required.
