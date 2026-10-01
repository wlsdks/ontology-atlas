---
id: 0ccd5981-52db-4889-b1a8-9b423d5813f4
date: 2026-10-01
kind: gate-gap
status: reported
harness_area: e2e
---
**Observed**: `pnpm checks:changed -- --run` runs `tests/e2e/map-layout-morph.spec.ts` against the dev server, where `territories to galaxy carries each concept ...` times out in `morphDone`: the record keeps `doneMs: null` while the overlay is already unmounted. It fails the same way on unmodified origin/main 7e676aa4e (2 of 2 runs), and passes on the static export (`PLAYWRIGHT_STATIC=1`).
**Cost**: Every change that touches the layout morph sees a red focused check that it did not cause, and the checks listed after it do not run until each one is started by hand.
**Suspected cause**: in dev the view settles through an extra layout value on the way to Galaxy, so the hook drops the overlay with a cut before the travel ends, and the record is never finished.
**Proposed change**: gate: either finish the record when the overlay unmounts mid-travel and make the spec wait on the overlay instead, or have `checks:changed` run this spec with `PLAYWRIGHT_STATIC=1` after a build.
