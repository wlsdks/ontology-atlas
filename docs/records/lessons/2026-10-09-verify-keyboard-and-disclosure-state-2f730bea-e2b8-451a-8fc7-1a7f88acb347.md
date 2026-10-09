---
id: 2f730bea-e2b8-451a-8fc7-1a7f88acb347
date: 2026-10-09
kind: mistake
status: reported
harness_area: browser-input
---
**Observed**: The new Flow request browser test initially used `Control+End` on the macOS runner. It focused the correct request but left 292 pixels below the viewport and failed after the 15-second condition timeout. A native Computer Use pass showed that `End` reached the request's last line; replacing the test key with `End` made all three targeted browser cases pass. The saved-answer unit case also initially queried a region inside a closed disclosure; opening that disclosure before querying made its visible state match the intended user path.
**Cost**: One failed browser run took 23.0 seconds; no CI round was spent. Other local verification time is unknown.
**Suspected cause**: The test assumed a platform-specific key chord and omitted the disclosure-opening step, despite the intended behavior being visible keyboard reading.
**Proposed change**: none — keep the corrected platform-neutral End key and the explicit disclosure-opening step in the regression tests; verify input behavior in the actual window before extending keyboard assertions.
