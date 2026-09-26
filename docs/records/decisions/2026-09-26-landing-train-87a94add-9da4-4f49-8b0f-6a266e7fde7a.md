---
id: 87a94add-9da4-4f49-8b0f-6a266e7fde7a
date: 2026-09-26
---
## 2026-09-26 — A landing lock protects a train, not a pull request

**Why**: one lock per pull request held merge-main, local lanes and ~20 minutes of CI; the median gap between merges was 55 minutes. About 400 pull requests in a burst (20 people, 20 agents) is ~200 hours serially, and a CI run each saturates the runners.
**Prior**: overturns 2026-09-12 "One pull request is one CI run, fired by the lander that holds the lock" on its unit, not its safety; retires the `--parallel-ci` clause of 2026-09-13 and the waiting-line ref. Keeps the draft guard, skipped-is-not-green, `--allow-failing` by name, the refs lock with lease and pid liveness, and `/land-bundle` for branches resolved together.
**Decision**: `pnpm pr:land <n>` labels the pull request `landing-queue`. The lock holder conducts: up to 20 queued pull requests merge onto `train/*` from `main`, one ready pull request fires one CI run, green squash-merges with every co-author, red bisects, a lone red component is ejected, flaky-only failures rerun once. A pull request green on its head, clean and disjoint from `main` and the train in flight, and not planned full merges at once without the lock. `--plan` writes nothing.
**Dissent**: the fast path and a train merge onto a `main` their CI never saw. Bounded: only when the files are disjoint, checked again before the merge, with push CI on `main` behind it. An unrequired lane red on `main` too bisects every train to single ejections; `--allow-failing` is the escape.
**Falsifier**: `main` red on push after a fast-path or train merge where two landings touched one file; a train merged with a required context skipped; a component closed as landed whose content `main` lacks; the queue not draining faster than one pull request per CI run.
**Owner**: Stark
