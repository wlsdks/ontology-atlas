---
id: 31ac0de3-0f64-4044-ae42-5866a9dd002c
date: 2026-09-27
---
## 2026-09-27 — Browser CI scales by runners, and types have one owner

**Why**: owner, 2026-09-27, asked to cut the E2E bottleneck. A train's E2E took 17–20 minutes against Checks' 5: three chromium shards ran 11.9, 16.2 and 16.4 minutes over 5,163 test-seconds, because 16 files missing from the duration weights carried about 1,900 of them; the browser build spent 54 of its 82 seconds in a type check. On a four-vCPU machine (a public repository's runner) four workers ran a 129-test sample in 219 s against two workers' 242 s, each test 44% slower.
**Prior**: extends 2026-09-13 "Browser CI shares one build and balances measured work without reducing coverage"; keeps its two workers, whole-file serial balancing, smoke/sweep boundary and protected statuses; corrects its premise that two workers used "both runner CPUs".
**Decision**: run the suite on five shards; refresh the weights from a measured run (`pnpm e2e:durations`) and log any file balanced on a guess; keep the required `Playwright (chromium k/3)` names on a carrier job that passes only when every shard did; `pnpm typecheck` (`next typegen` then `tsc`) owns types in the Checks gate, route and page exports included, and only the E2E browser build skips Next's own type check.
**Dissent**: five shards pay setup five times and hold more concurrent runners while two trains fly; the weights will go stale again as specs are added; a type error now reaches the browser build unchecked when the planner skips the gate. Accepted because the gate and the build read the same tree, and every other build still checks types.
**Falsifier**: a smoke E2E run no faster than 12 minutes on five shards; a type or page-export error that lands green; concurrent-job queueing that erases the gain.
**Owner**: Stark
