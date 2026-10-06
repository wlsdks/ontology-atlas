---
id: 0573718f-a9e0-4e69-9c1a-6231f7d7343c
date: 2026-10-05
kind: mistake
status: reported
harness_area: rendering
---
**Observed**: In `cache-probe.html`, PixiJS at resolution 2 without `autoDensity` displayed a 2896 by 1800 backing canvas at that CSS size, while the Canvas 2D control displayed it at 1448 by 900. The framebuffer comparison reported zero pixel error. The native recording's phase strip exposed the different on-screen scale. Enabling `autoDensity` made both CSS sizes and backing sizes equal; the repeated comparison still measured approximately 144 FPS for both cache paths.
**Cost**: One 18-second comparison recording and one repeated comparison; total investigation time unknown.
**Suspected cause**: Framebuffer equality was treated as sufficient visual equivalence without checking the canvas's CSS dimensions.
**Proposed change**: none. Before accepting renderer comparison numbers, measure CSS dimensions, backing dimensions and device scale separately, then inspect a native recording for equivalent on-screen geometry.
