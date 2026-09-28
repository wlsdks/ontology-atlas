---
id: 821b3034-cc96-40c5-88b7-d0fc0193354f
date: 2026-09-29
---
## 2026-09-29 — Map entry fades the old pane to the canvas before the route changes

**Why**: The 2026-09-29 design round measured map entry cutting the old pane at 22–110 ms under a cover at 0–81% opacity, with the static Suspense fallback showing through for 3–5 frames on every cold entry.
**Prior**: Refines 2026-09-14 map-entry-preparation (666d5fc2-32c6-41fd-8693-689e580345f7): live pending UI and its paint boundary stand; navigation now also waits for the cover's `--motion-base` fade.
**Decision**: The pending cover fades in on the route crossfade's clock; the route changes once it is opaque and a frame has painted; the waiting scene appears only when preparation outlasts that plus `SKELETON_DELAY_MS`; the rail marks Map from the press.
**Dissent**: Waiting for the cover adds about 180 ms before a warm map commits (design guardian, this round).
**Falsifier**: A warm entry taking over 500 ms to reveal the map, a pane change under a cover below 0.99 opacity, or the waiting scene shown on an entry that drew within 330 ms.
**Owner**: jinan
