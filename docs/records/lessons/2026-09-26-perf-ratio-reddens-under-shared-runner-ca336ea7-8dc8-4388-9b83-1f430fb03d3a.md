---
id: ca336ea7-8dc8-4388-9b83-1f430fb03d3a
date: 2026-09-26
kind: gate-gap
status: reported
harness_area: ci
---
**Observed**: train #1928 (carrying #1915, which touches no matcher code) went red on `src/shared/lib/node-name-match.perf.test.ts`: ratio 9.25 against a bar of 10 in the `pnpm test:perf` step of Unit · Contract. The test header already records 6.73 and 9.20 on unrelated CI branches and says "if it reddens again, move the lane, do not move the number".
**Cost**: one ejected train (about 10 minutes) and a requeue.
**Suspected cause**: the perf project still shares a runner with the contract lane, so allocation pressure from neighbours lowers the cached side's ratio.
**Proposed change**: gate: run `pnpm test:perf` in its own CI job on its own runner, as the test's header prescribes, keeping the threshold at 10.
