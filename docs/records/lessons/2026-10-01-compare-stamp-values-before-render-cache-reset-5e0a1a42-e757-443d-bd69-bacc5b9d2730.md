---
id: 5e0a1a42-e757-443d-bd69-bacc5b9d2730
date: 2026-10-01
kind: mistake
status: reported
harness_area: perf-audit
---
**Observed**: The first current-stamp cache used input-array identity as its render-time reset condition. `pnpm exec vitest run src/features/library/model/use-library-model.test.tsx src/features/library/model/use-library-model.validation.test.tsx src/features/library/model/use-library-model.log.test.tsx src/widgets/ontology-map/model/separation.test.ts` reported `Too many re-renders` and 4 failing tests because a caller can produce a fresh but equivalent stamp array on every render. The overlapping focused-check run also stopped on the same Library test. Comparing the stamp contents before resetting fixed the loop; the follow-up six-file command passed 23 tests, including a new equivalent-array regression.
**Cost**: The failed focused test command took 31.74 seconds; the overlapping checks lane stopped after 31.8 seconds. Total elapsed cost unknown because these runs overlapped.
**Suspected cause**: The cache guard treated a new array identity as a semantic snapshot change even when every stamp was unchanged. Render-time state adjustment then repeated indefinitely for callers constructing arrays during render.
**Proposed change**: rule — When pruning a state cache during render, compare the semantic input before setting state and include an equivalent-new-array caller in the regression cases.
