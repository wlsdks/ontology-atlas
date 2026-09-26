---
id: 735a414f-fd64-4b8c-8b85-75e6af36535c
date: 2026-09-26
lesson: ca336ea7-8dc8-4388-9b83-1f430fb03d3a
status: fixed
parents: abb749f9-ef08-43cb-bb81-0a2636906723
---
**Evidence**: PR #1932 (commit d801038b4) moves `pnpm test:perf` off Unit · Contract shard 1 into its own `Perf · Ratios` job on a separate runner, planned by a new `perf` impact lane, with the bar left at 10; `Unit · Contract` needs that job so the required context still carries its verdict. Falsifier: a red ratio in `Perf · Ratios` on a change that cannot reach the matcher.
