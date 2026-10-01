---
id: e0bce90f-ccb4-4943-8ff4-ae57f2f068b0
date: 2026-10-01
kind: gate-gap
status: reported
harness_area: acp-startup
---
**Observed**: Removing `stream.earlyChars += chars` initially left all 17 ACP bridge tests green. The suite tested one oversized event but not the sum of individually acceptable events. Adding the two-event aggregate case made that mutation red; all four independent retention/stop mutations now fail, and restored source passes 20 bridge cases.
**Cost**: One additional local mutation round; elapsed time unknown. No CI round.
**Suspected cause**: A per-event overflow case did not exercise accumulated state, so it could not protect the total memory-retention budget.
**Proposed change**: gate. For an aggregate resource cap, include individually acceptable inputs whose combined total exceeds the cap. The ACP regression is included in this slice.
