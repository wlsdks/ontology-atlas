---
id: 81e18572-149b-438e-8f76-34544ac7e9db
date: 2026-10-02
kind: gate-gap
status: reported
harness_area: e2e
---
**Observed**: `tests/e2e/map-galaxy-frame-work.spec.ts` on #2264 starts its "overview pan" with `page.mouse.down()` at the canvas centre, which in Galaxy is the project star at the galaxy core. Sampling `__atlasMap.interaction().kind` during that gesture read `node` on 13 of 13 frames on main at synth=10000, so the 64 ms "pan" p95 quoted to the lead was a node drag of the project (force tick, separation, tug of most of the graph). The same gesture from a point 250 px clear of every star read `pan` and measured 56.6 ms on the same build.
**Cost**: one measurement round misattributed in the brief; about 20 minutes here to find it, before any fix could be judged against the right number.
**Suspected cause**: the spec pans from the centre without asserting what the press grabbed; in Flat the centre is usually empty, in Galaxy it never is.
**Proposed change**: script — a shared e2e helper that picks a press point clear of every drawn node from `__atlasMap.nodes()` and asserts `interaction().kind === "pan"` once the drag starts, used by every pan-timing spec.
