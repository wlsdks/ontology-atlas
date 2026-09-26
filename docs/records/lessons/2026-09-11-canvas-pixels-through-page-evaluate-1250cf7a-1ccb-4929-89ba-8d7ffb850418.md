---
id: 1250cf7a-1ccb-4929-89ba-8d7ffb850418
date: 2026-09-11
kind: tool-efficiency
status: reported
harness_area: e2e
---
**Observed**: `datasheet-hover-map-brush.spec.ts` returned `Array.from(ctx.getImageData(...).data)` (5,164,544 values) through `page.evaluate` four times. Each transfer took 12.0 to 12.2 s, 49 s of a 120 s budget, so the spec timed out intermittently on slower runners (16 of 60 recent main E2E runs failed).
**Cost**: 49 s per run and recurring red CI on unrelated commits.
**Suspected cause**: CDP serializes the whole array; the same comparison inside the page takes 3 ms.
**Proposed change**: rule: a line in the e2e testing rule: compare pixels in the page (keep the baseline with `page.evaluateHandle`) and return one number.
