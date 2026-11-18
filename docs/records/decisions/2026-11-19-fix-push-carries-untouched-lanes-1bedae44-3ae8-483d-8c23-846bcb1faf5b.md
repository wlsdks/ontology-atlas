---
id: 1bedae44-3ae8-483d-8c23-846bcb1faf5b
date: 2026-11-19
---
## 2026-11-19 — A fix push carries forward the lanes it could not reach

**Why**: a red pull request reran every planned lane after the fix. With the browser suite active a run took 13.1 min end to end (14 runs), Checks alone 4.8 (21 runs); a shard averaged 5.7 min. 2 of the 4 fix pushes to ready pull requests since 2026-10-23 touched no browser input, on a `main` that had not moved.
**Prior**: narrows 2026-11-18 own-CI merges (4fc75f5b), whose green run's tree is the tree that lands: a carried lane's green run tested the previous head's tree. Keeps 2026-09-12 "One pull request is one CI run".
**Decision**: a lane is *carried* when its job skips its work and prints `carried from run <id> on <sha>`, the run where it passed. On a pull request push it carries only when: the push adds or modifies code modules only (no move, deletion, prose, data or configuration); no workflow file or planner module differs from the base; the previous run's `CI tested tree` annotation names the same base and the tree Git rebuilds; the push plans no work for the lane and no test, command or build of the lane imports a changed file; its planned work is equal; and every job of the lane passed in that run, uncarried. Types · Lint · Docs always runs.
**Dissent**: a test reading a code file from disk without importing it is outside the map. A lane carried once runs again on the next push. `main` moving between pushes carries nothing.
**Falsifier**: 4fc75f5b's "a merge with a required context unrun" now excludes a context whose job printed a carried mark; any merge where one neither ran nor printed it, or any `main` red on a test of a lane carried on the merged head, falsifies this; so does wall time over 20 carried pushes not below the uncarried median.
**Owner**: Ontology Atlas owner.
