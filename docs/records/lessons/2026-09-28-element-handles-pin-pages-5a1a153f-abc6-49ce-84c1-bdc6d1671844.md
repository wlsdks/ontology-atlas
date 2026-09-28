---
id: 5a1a153f-abc6-49ce-84c1-bdc6d1671844
date: 2026-09-28
kind: tool-efficiency
status: reported
harness_area: memory-harness
---
**Observed**: the web memory audit's `/download` ↔ `/guide` harness (`exp10-download.mjs`) waited with `page.waitForSelector(...)` twenty times. With the WebGL renderer leak fixed, the page still grew 1,232 → 24,705 DOM nodes over 20 visits; a heap snapshot showed every detached `download-stage-map-frame` and `gateway-doc-body` held by "(Global handles) / DevTools console", the ElementHandles `waitForSelector` returns. The same harness with `locator(...).waitFor()` stayed at 1,238 nodes, and current main read +994 nodes a visit instead of the audit's +1,223.
**Cost**: one extra investigation round (snapshot, retainer analysis, two reruns), about 20 minutes; the audit's per-visit figure was about 20% the harness's own.
**Suspected cause**: an ElementHandle stays pinned by the DevTools session until disposed, and client-side navigation never disposes it, so a leak harness that keeps handles measures its own retention.
**Proposed change**: skill, one line in `/map-perf` or wherever heap/leak harnesses are described: wait with `locator.waitFor()` or `page.waitForFunction`, never `page.waitForSelector`, and dispose any handle before a heap count.
