---
id: 81613c6e-eb88-494a-ac64-f88abeb4058a
date: 2026-10-02
---
## 2026-10-02 — The hex board paints every pitch with one canvas renderer in opaque tones

**Why**: today's paint makes two gradients per tile per frame and lays out every tile and name; at 10k the relief renderer at pitch 0 took 3.8 / 3.7 / 4.5 ms against 31.3 / 40.3 / 13.3 ms (P0b).
**Prior**: extends 2026-09-25 hex board (6de28f78); still canvas-2D, so AGENTS.md's renderer sentence and 2026-09-06 stand.
**Decision**: one renderer draws the board at every pitch: viewport culling, paint order sorted once per layout, line layout cached per radius, faces, plates and moat as opaque tones mixed from the hex tokens, and every mark today's board drew (canal and route heads, stale-only halos, sweep and file line, hover halo, plates clear of tiles).
**Dissent**: the 2026-09-25 face gradients and translucent plates become flat tones.
**Falsifier**: the installed app draws a tone different from Chromium, or a dark-mode still at 1512 shows a resting name below 7:1 or a rim below 3:1 against its face.
**Owner**: Stark
