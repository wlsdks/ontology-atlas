---
id: 81e18572-149b-438e-8f76-34544ac7e9db
date: 2026-10-02
kind: gate-gap
status: reported
harness_area: e2e
---
**Observed**: `tests/e2e/map-galaxy-frame-work.spec.ts` on #2264 starts its "overview pan" with `page.mouse.down()` at the canvas centre. In Galaxy at synth=10000 that point lies on a star: `__atlasMap.interaction()` read `{ kind: "node", nodeId: "synth-el-5462" }`, an element in the dense core, not the project (the project sits about 90 px to the right). `kind` read `node` on 13 of 13 sampled frames on main, so the 64 ms "pan" p95 quoted to the lead was a node drag (force tick and separation over that element's tug set). A press that `interaction()` reported as `pan` measured 56.6 ms on the same build. A second trap sits in the helper I wrote to find that press point: `__atlasMap.nodes()` returns x/y relative to the canvas, which starts 64 px right of the page edge at 1512 wide (the rail), so comparing them with `page.mouse` coordinates without adding the canvas box offset measured clearance from the wrong place.
**Cost**: one measurement round misattributed in the brief; about 20 minutes here to find it, before any fix could be judged against the right number.
**Suspected cause**: the spec pans from the centre without asserting what the press grabbed; in Flat the centre is usually empty, in Galaxy it never is.
**Proposed change**: script — a shared e2e helper that picks a press point clear of every drawn node from `__atlasMap.nodes()`, adding the canvas box offset to each node, and asserts `interaction().kind === "pan"` once the drag starts, used by every pan-timing spec.
