---
id: abdcb2bb-fe87-4a74-97c2-adb85600d179
date: 2026-10-02
kind: tool-efficiency
status: reported
harness_area: brand
---
**Observed**: Native Chrome was opened before identifying the dedicated test browser, and the owner explicitly redirected testing to Chrome for Testing. The image and motion work also exposed that generated sprite sheets are not reliably on their requested logical grid; source dimensions were 1254/1774 rather than the requested 2048 cells.
**Cost**: Extra browser setup and image-normalization work; elapsed time not measured.
**Suspected cause**: Assuming a browser surface and generated pixel-grid geometry without inventorying either first.
**Proposed change**: none — first identify the dedicated testing browser, inspect actual image dimensions, normalize alpha/cell registration, and inspect native 16/32/64px output before asset fan-out.
