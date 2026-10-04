---
id: 3a8c9178-4961-4c2a-8ef9-b6015ca57597
date: 2026-10-04
kind: mistake
status: reported
harness_area: ui-lifecycle
---
**Observed**: The first notification-clearance candidate attached a ref but ran its layout effect only on `open`. The unchanged `agent-activity-placement.spec.ts` failed all three static-export repetitions. `Surface` mounts through passive presence state, so the parent layout effect initially observed no panel and did not run again. A stable callback ref plus a scalar mount version handles the actual mount; the final unchanged test passed 3/3 with zero retries (`activity-final-green.log`).
**Cost**: One failed local three-repeat run; elapsed implementation time unknown.
**Suspected cause**: Treating requested visibility as equivalent to mounted DOM presence.
**Proposed change**: none. The scoped implementation now uses the existing ref/version pattern; no new general gate or resident instruction is needed.
