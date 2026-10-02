---
id: bfe104ee-a7db-4e09-b6ff-e0a2ffe77158
date: 2026-10-02
kind: mistake
status: reported
harness_area: motion
---
**Observed**: The download illustration copied the Harness preview's pause wiring, `new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? true))`. On the static export at 1440x900, a scroll right after load left it `data-conduction-state="paused"` while fully in view in 2 of 6 loads (rect 511-887 in a 900px viewport, 0 of 192 animations playing), because the callback delivered [stale outside, inside] together and only the first entry was read. Reading `entries.at(-1)` gave 12 of 12 running. `ArchitectureDraftPreview.tsx` and `DemoStage.tsx` still read `[entry]`.
**Cost**: about 20 minutes, plus one flaky e2e red that first looked like dev-server noise.
**Suspected cause**: The loop-then-rest pattern is copied from the Harness preview, and its in-view wiring reads the first of possibly several batched entries; no unit test feeds a batched callback.
**Proposed change**: script, then a gate: a shared `useInView` in `src/shared/lib` that reads the last entry, adopted by the three copies, with the batched-entries test from `ConductionFigure.test.tsx` moved beside it.
