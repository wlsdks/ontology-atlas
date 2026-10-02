---
id: e9992f45-8548-4c17-be95-77a5ac6ba85a
date: 2026-10-02
kind: mistake
status: reported
harness_area: map-harness
---
**Observed**: a Strata pan/zoom harness reported orbit sensitivity 0 rad/px and no coast on the unchanged build (`orbit {"radPerPx":0,...}`), which read as "the 3D orbit is dead". The harness had computed the dome-grip ellipse from `__atlasMap.nodes()` before a 300 px pan ran, so the later "orbit" press landed outside the moved dome and silently panned; re-deriving the ellipse after `0` (fit) gave 0.0075 rad/px and a half-turn coast.
**Cost**: one extra 3-minute measurement run and a wrong intermediate number; caught before it was reported.
**Suspected cause**: gesture targets were derived once and reused across camera moves, and the run never asserted the gesture's identity (`__atlasMap.dome().orbiting`) the way map-perf asserts a node grab.
**Proposed change**: skill — one line in map-perf: re-derive press targets after any camera move, and discard an orbit sample unless `__atlasMap.dome().orbiting` was true mid-drag.
