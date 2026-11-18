---
id: 4fc75f5b-2053-45f1-a0bf-96489eff4f08
date: 2026-11-18
---
## 2026-11-18 — A pull request that contains main merges on its own CI; the train is the fallback

**Why**: last ten landings: median 11.7 min from `pr:land` to `main`, 11.2 of it train CI; one ejection cost 23. Nine trains carried one pull request. 21 of 25 components passed every fast-path rule but `ready-green`, which a draft cannot pass. Pre-push took 10-15 s.
**Prior**: narrows 2026-09-26 landing train (87a94add) to the fallback; its lock, drift rebuild, bisect, skipped-is-not-green and `--allow-failing` stand, as do 2026-10-05 merge commits. Narrows 2026-09-12 "One pull request is one CI run": drafts still run nothing until marked ready.
**Decision**: a direct merge needs its green run's tree to be the tree that lands: the head contains today's `main`. When only `ready-green` fails, `pnpm pr:land` marks a draft ready, waits for that run, then re-checks under the fast-path lock. Red returns unqueued unless every failure is named `--flaky`/`--allow-failing`. A head behind `main`, a queued pull request, an unconducted queue, `--no-fast` and `--no-wait` take the train. `/merge` starts runs with `pnpm pr:ci`.
**Dissent**: 8 of 14 recent branches were behind `main` and go to the train; `main` moving during a run costs a second round there. Parallel runs share the free 20-job limit.
**Falsifier**: any `main` red whose first bad commit was a direct merge; a merge with a required context unrun; over 20 landings the disjoint median not below 11.7 min, or median CI queueing above 2 min.
**Owner**: Ontology Atlas owner.
