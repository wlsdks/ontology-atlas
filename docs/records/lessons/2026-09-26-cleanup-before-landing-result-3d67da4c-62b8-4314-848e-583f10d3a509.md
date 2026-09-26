---
id: 3d67da4c-62b8-4314-848e-583f10d3a509
date: 2026-09-26
kind: mistake
status: reported
harness_area: landing
---
**Observed**: a chained command ran `git branch -D fix/pr-land-runs-main-copy` right after `pnpm pr:land 1906` without checking its exit code; the landing had failed (train #1907 red), so the only local copy of an unlanded branch was deleted. Recovered from origin/fix/pr-land-runs-main-copy.
**Cost**: one recovery step; without the remote branch the work would have been lost.
**Suspected cause**: cleanup chained with `;` instead of gated on the landing's exit status, and `git branch -D` used where `pnpm bundle:prune` would have refused.
**Proposed change**: skill: /land-bundle says clean up only after `pnpm pr:land` exits 0, and through `pnpm bundle:prune`, which keeps what main does not contain.
