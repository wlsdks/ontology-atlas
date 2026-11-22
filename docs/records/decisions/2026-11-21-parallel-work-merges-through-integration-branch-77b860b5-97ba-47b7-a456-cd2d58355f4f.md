---
id: 77b860b5-97ba-47b7-a456-cd2d58355f4f
date: 2026-11-21
---
## 2026-11-21 — Parallel work merges through one integration branch with one CI run

**Why**: The owner, 2026-11-21: per-slice merges each ran CI and took all day; merge into one branch without CI, resolve conflicts there, review once. That day ten slices each ran every lane: load 104 on 12 cores, two MCP-probe timeouts.
**Prior**: 2026-09-26 c5947a29 landed a fan-out as one bundle; 2026-11-18 4fc75f5b (a5dd2af98) left it for a per-pull-request fast path (median 11.7 min to `main`, 21 of 25 components fast-path-ready), with trains (fcd74815, d3420920) for the rest. For parallel work this overturns per-slice landing and trains. Train code stays as a live fallback.
**Decision**: `pnpm integration:start` pushes `integration/<topic>-<yyyy-mm-dd>` from `origin/main`. Slices commit unpushed and run `pnpm checks:changed -- --run --slice`. `integration:add` merges each `--no-ff` as it returns and runs its checks, locally. `integration:pr` merges `origin/main`, runs the repo-wide lanes once, pushes once, opens one draft with `### Conflicts`; one `pnpm pr:land`; `integration:prune` deletes what `origin/main` holds.
**Dissent**: early slices wait for the last; a bad slice leaves only by a revert merge; a defect only a contract or typecheck catches surfaces at the end.
**Falsifier**: in ten integrations, the single CI run fails on a conflict-resolution error more than twice, `main` is red after the merge more than twice, or the median from `integration:pr` to `main` exceeds 11.7 min per slice.
**Owner**: Ontology Atlas owner.
