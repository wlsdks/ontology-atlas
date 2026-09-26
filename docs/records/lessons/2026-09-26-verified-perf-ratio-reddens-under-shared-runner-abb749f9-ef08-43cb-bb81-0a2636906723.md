---
id: abb749f9-ef08-43cb-bb81-0a2636906723
date: 2026-09-26
lesson: ca336ea7-8dc8-4388-9b83-1f430fb03d3a
status: verified
parents: ca336ea7-8dc8-4388-9b83-1f430fb03d3a
---
**Evidence**: Checks run 36250200699 (train #1928, carrying #1915 which touches no matcher code) failed in Unit · Contract 1/3 at `pnpm test:perf`, the third command after `pnpm knip` (15.0 s) and the shard-1 Vitest sweep (130.2 s), with `expected 9.245370551911586 to be greater than 10`; the rerun train for the same change (run 36250545792) passed, so the red was the runner, not the code.
