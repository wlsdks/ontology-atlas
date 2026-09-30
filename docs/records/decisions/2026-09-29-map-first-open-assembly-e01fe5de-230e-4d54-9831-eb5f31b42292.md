---
id: e01fe5de-230e-4d54-9831-eb5f31b42292
date: 2026-09-29
---
## 2026-09-29 — The map assembles once per folder on first open

**Why**: the first Flat frame drew every concept at once, so nothing said which concept holds which. The dome already raises its tiers project → domain → capability → element on 0/180/380/600 ms with a 520 ms rise.
**Prior**: extends 2026-09-29 motion primitive set (D20); the first-map reveal after bootstrap keeps its springs.
**Decision**: `morph/tier-assembly.ts` owns the tier schedule for both the dome and Flat. On the first world build per source per session each concept rises out of its parent on that schedule while the project and camera hold still and the pan clamp keeps the final extent. The per-node schedule lives in a WeakMap keyed by the world, so the loop holds no schedule state. Pointer, wheel, touch, keys, a focus, a drag, 3D or a realm settle it on the next frame. An address that names anything in the vault (a deep link) opens settled, because the sample drawn before the folder loads cannot resolve that focus. Reduced motion places final positions on frame one and fades on `--motion-fast`. Galaxy entry skips it.
**Dissent**: animate at every source build; a live refresh would replay it on each save.
**Falsifier**: a second visit in one session or a `?p=` arrival that shows travel; a moving camera or project during assembly; a frame interval over 50 ms at synth 2000 inside the window.
**Owner**: Stark
