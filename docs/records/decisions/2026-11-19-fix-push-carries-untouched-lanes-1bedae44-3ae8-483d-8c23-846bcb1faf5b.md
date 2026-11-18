---
id: 1bedae44-3ae8-483d-8c23-846bcb1faf5b
date: 2026-11-19
---
## 2026-11-19 — A fix push carries forward the lanes it could not reach

**Why**: a red pull request reran every planned lane after the fix. With the browser suite active a run took 13.1 min end to end (14 runs), Checks alone 4.8 (21 runs); a shard averaged 5.7 min. 2 of the 4 fix pushes to ready pull requests since 2026-10-23 touched no browser input, on a `main` that had not moved.
**Prior**: extends 2026-11-18 own-CI merges (4fc75f5b): their fix path. Keeps 2026-09-12 "One pull request is one CI run" and the reviewed-tree reuse on `main`.
**Decision**: on a pull request synchronize, the planner carries a lane passed at the previous head only when the previous run's `CI tested tree` annotation names the same base and the tree Git rebuilds; no workflow file or planner module differs from the base; the push plans nothing for the lane beyond an empty change; its planned work is equal; and every job of the lane passed in that plan job's run, uncarried. Types · Lint · Docs always runs. A carried lane reports success through its inactive path; required contexts and protection are unchanged.
**Dissent**: the planner's input map now decides reruns as it already decides skips. A lane carried once runs again on the next push. `main` moving between pushes carries nothing.
**Falsifier**: any `main` red on a test of a lane carried on the merged head; over 20 carried pushes, wall time not below the uncarried median.
**Owner**: Ontology Atlas owner.
