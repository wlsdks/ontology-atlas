---
id: 9c93aaae-a8d7-4192-8d83-567306142203
date: 2026-10-04
kind: gate-gap
status: reported
harness_area: performance
---
**Observed**: Independent review found four new suggestion regressions outside the `suggestions` suite. The established focused command filters `suggestions|suggests close enum values`, so those four were absent even though full MCP units passed. Adding the stable `suggestions:` subject prefix makes the actual focused command run all eight suggestion cases plus its existing enum case; no command or CI script changed.
**Cost**: One reviewer fix round and focused inventory/check cycle; elapsed time unknown. No failed CI round.
**Suspected cause**: New top-level test names did not inherit the suite name that the focused command selects.
**Proposed change**: none. Verify focused subject membership as well as full-suite GREEN when adding cases; keep new cases in the existing selected suite or use its stable subject prefix.
