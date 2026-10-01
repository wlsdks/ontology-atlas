---
id: 0d8a6f67-948a-4ca6-ac9c-4f3dff1f65e1
date: 2026-09-30
---
## 2026-09-30 — A pick into or out of Territories or Hex carries each concept across

**Why**: picking between the canvas map and the Territories or Hex renderers crossfaded two unrelated pictures, so a reader lost where a concept went. M-MORPH-0 measured the arriving renderer's mount at 27–669 ms at synth 2000, so it can neither draw the targets in time nor mount during a travel.
**Prior**: extends 2026-09-29 motion primitive set (84007fc7, D17–D19) and replaces the 2026-09-29 view-switch crossfade for picks. The hex board's arrival (2026-09-25, 6de28f78) still plays once per folder when Hex is reached without a pick.
**Decision**: a pick arms `map-layout-morph-store`; the leaving renderer publishes its marks and a 1× bitmap as it unmounts; `MapLayoutMorphOverlay` predicts the targets from the pure layouts and moves ghost marks on the camera clock with `easeMotion`; the arriving renderer mounts after the travel and arrives still, and the overlay holds until it draws, then fades from that moment. Flat, Galaxy, Strata and Neural keep their native morphs. Into Strata or Neural, out of Neural, past a measured ceiling (Flat 6,500, Galaxy 6,300 concepts), when targets miss `--motion-fast`, and under reduced motion, the old picture crossfades. Unarmed changes cut and publish nothing; input, resize, a DPR change or a hidden tab settles the travel.
**Dissent**: keep the leaving renderer alive under the arriving one: one picture throughout, but two renderers at once and no identity.
**Falsifier**: input to travel start over 150 ms at synth 2000; a travel frame over 50 ms at synth 2000 caused by the morph itself; a reader losing a concept across a switch.
**Owner**: Stark
