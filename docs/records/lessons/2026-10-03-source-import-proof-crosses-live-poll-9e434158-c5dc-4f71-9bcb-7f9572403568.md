---
id: 9e434158-c5dc-4f71-9bcb-7f9572403568
date: 2026-10-03
kind: gate-gap
status: reported
harness_area: motion
---
**Observed**: The earlier Source import motion cases released their deferred write before a folder refresh. An actual source poll instead unmounted the empty-stage working control and counted the unfinished target plus `motion.txt.crswap`. The new static-export regression failed with a null original button rect before the implementation, then passed after write-path publication coordination.
**Cost**: One previously landed motion slice missed the long-write/poll interaction; exact total cost is unknown.
**Suspected cause**: The focused control checks covered picker/work/result geometry but did not cross the data observer while the write remained open.
**Proposed change**: gate, retain the condition-driven poll regression and an unrelated-source/Wiki update case so a whole-source snapshot or globally stopped watcher cannot pass as the fix.
