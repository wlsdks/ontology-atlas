---
id: 81613c6e-eb88-494a-ac64-f88abeb4058a
date: 2026-10-02
---
## 2026-10-02 — The hex board paints every pitch with one canvas renderer in opaque tones

**Why**: the old paint made about 1,569 gradients a frame at 10k; panning measured p95 11.7 / 11.7 / 11.9 / 22.0 ms (rest, R 15, pips, names; median of 3 on main 9c9da0b27, which ignores `synthEvidence` and so drew an all-unknown, hatched board) against 2.7 / 7.1 / 1.6 / 1.5 ms with this renderer on a board with 12% evidence.
**Prior**: extends 2026-09-25 hex board (6de28f78); still canvas-2D, so AGENTS.md's renderer sentence and 2026-09-06 stand.
**Decision**: one renderer draws the board at every pitch: viewport culling, paint order sorted once per layout, line layout cached per radius, opaque tones mixed from the hex tokens, and every mark the old board drew. Below R 14 in the regions band, where a 10k vault opens, tiles are batched per region and keep fill, rim and hover rim only: no selection or stale halo, used-by ring, stale sweep, riser, bevel, moat or arrival lift. Rims, unknown rims and canals now read at least 3:1 (rim #74768a 3.27-4.15:1 on faces, unknown #7a7b88 3.40:1 on hatch, canal #5c5f79 3.17:1 on ground, 3.04:1 on plate).
**Dissent**: the 2026-09-25 face gradients and translucent plates become flat tones, and the far band loses per-tile marks.
**Falsifier**: the installed app draws a tone different from Chromium, or a dark-mode still at 1512 and DPR 2 shows a resting name below 7:1 on its face, or a rim, unknown rim or canal below 3:1 on its face or the ground.
**Owner**: Stark
