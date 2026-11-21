---
id: 77b860b5-97ba-47b7-a456-cd2d58355f4f
date: 2026-11-21
---
## 2026-11-21 — Parallel work merges through one integration branch with one CI run

**Why**: The owner, 2026-11-21: every per-slice merge ran CI and it took all day; merge into one branch without CI, resolve conflicts there, review once at the merge to `main`. That day ten slices each ran every lane: load 104 on 12 cores, two MCP-probe timeouts.
**Prior**: for parallel work only, overturns per-slice landing and trains: 2026-11-18 fcd74815 and d3420920 where the train is the checked unit, 4fc75f5b where a head behind `main` rides a train, 2026-09-26 87a94add's `landing-queue`. What a pull request's CI runs and the full run per `main` push stand. The train code stays as dormant fallback.
**Decision**: the lead pushes `integration/<topic>-<yyyy-mm-dd>` from `origin/main` first. Slices commit in their own worktrees, run `pnpm checks:changed -- --run --slice`, never push. The lead merges each with `--no-ff` as it returns, resolves conflicts, runs its checks, pushes (no workflow triggers). Last: merge `origin/main`, run repo-wide lanes once, one draft with `### Conflicts`, one `pnpm pr:land`; then `pnpm bundle:prune` deletes every branch, twin and worktree `origin/main` provably contains.
**Dissent**: a defect only a contract or typecheck catches surfaces at the end, not in its slice, and one red run blocks all slices where a train ejected the breaker.
**Falsifier**: an integration pull request whose single CI run fails on a conflict-resolution error more than twice in ten integrations, or `main` red after an integration merge more than twice in ten.
**Owner**: Ontology Atlas owner.
