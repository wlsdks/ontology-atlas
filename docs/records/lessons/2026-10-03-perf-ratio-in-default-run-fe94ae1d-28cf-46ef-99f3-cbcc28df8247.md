---
id: fe94ae1d-28cf-46ef-99f3-cbcc28df8247
date: 2026-10-03
kind: gate-gap
status: reported
harness_area: unit-tests
---
**Observed**: `pnpm exec vitest run` on `vitest related` (step 42 of a `checks:changed` plan, 2026-10-03) failed once on `src/widgets/ontology-map/morph/layout-morph.perf.test.ts`, a wall-clock ratio of 200 against 2,000 nodes; it passed on re-run (300 files, 3,617 tests) and 3 of 3 alone, with no `morph/` change on the branch.
**Cost**: one re-run of a 300-file batch (about 4 minutes) and a diagnosis.
**Suspected cause**: a wall-clock perf ratio inside the default parallel unit run measures the machine's load, not the code; `test:perf` exists for these.
**Proposed change**: gate, perf-ratio tests (`*.perf.test.ts`) are excluded from the default and `related` unit runs and run only under `pnpm test:perf`.
