---
id: d23b1449-91a9-4342-8e6b-3a67d40ac2d5
date: 2026-10-05
kind: process
status: reported
harness_area: rendering
---
**Observed**: A candidate cleanup added forceContextLoss after renderer.dispose. The method-call regression passed, but seven repeated route cycles still retained 46 DOM nodes and five listeners per cycle. Independent review also showed that the host reuses its canvas during dependency remounts, which would leave a replacement renderer with a lost context. The candidate was removed.
**Cost**: Two production rebuilds and two seven-cycle browser probes; total wall time unknown.
**Suspected cause**: A cleanup-method call is weaker evidence than resource ownership and remount behavior. A strong heap path later traced retention through Three's shared DFG texture dispose listeners, not pending animation frames.
**Proposed change**: none. For renderer cleanup, capture a strong retaining path, probe both unmount and same-canvas dependency remount, and verify resource counts after repeated navigation before calling a method-call test sufficient.
