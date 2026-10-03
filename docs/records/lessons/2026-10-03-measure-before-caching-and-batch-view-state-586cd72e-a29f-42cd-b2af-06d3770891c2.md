---
id: 586cd72e-a29f-42cd-b2af-06d3770891c2
date: 2026-10-03
kind: mistake
status: reported
harness_area: map-motion
---
**Observed**: A view-picker regression probe observed five appearance notifications for one Neural selection, with subscribers seeing partial flag combinations before the final state. Native 60 fps inspection and the on-screen rAF meter also found isolated 35-38 ms preparation gaps after the sizing fix; a 98-node Hex-layout diagnostic measured P95 0.52 ms, so layout caching lacked evidence.
**Cost**: Additional native measurement and build rounds; total cost unknown.
**Suspected cause**: Multiple synchronous preference publications may add selection work and expose intermediate view state. The native pacing cause remains a measurement question, not a conclusion from notification count alone.
**Proposed change**: none — the map-specific writer publishes only the final coherent choice and skips equal saved values while retaining explicit defaults and blocked-read write attempts. Measure native pacing again before claiming this removed the observed gap.
