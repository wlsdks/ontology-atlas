---
id: 4210a567-03a5-42b4-b382-3c86eb79368e
date: 2026-09-28
kind: gate-gap
status: reported
harness_area: e2e
---
**Observed**: `tests/e2e/download-gateway-grid.spec.ts` "no ghost glyph, and the headline does not wander while it types" failed a `pnpm checks:changed -- --run` on perf/web-vault-memory (width spread 4.14 px against a bound of 4). Thirty fresh page loads each, sampling the spread the same way (`headline-drift.mjs` in the session scratchpad): main 3c3a8bf06 had 5 of 30 over 4 px (median 3.69, max 4.45); the branch had 5 of 30 (median 3.67, max 4.17). The spec's comment records "measured ≤3.73px".
**Cost**: one extra checks:changed run and three measurement rounds, about 25 minutes.
**Suspected cause**: the bound sits inside the measured distribution rather than above it, so about one run in six fails on this machine with no product change.
**Proposed change**: gate, re-measure the drift distribution on CI and set the bound from it with headroom (or assert the spread relative to a same-run reference), and write the new measurement next to the bound.
