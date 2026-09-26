---
id: 01e2d9b3-fa7c-4439-945f-5e240837ef0f
date: 2026-09-26
kind: gate-gap
status: reported
harness_area: checks-changed
---
**Observed**: the harness-lessons branch passed its own `pnpm checks:changed -- --run` (36 checks), yet after bundling `pnpm test:docs-vault` failed: `scripts/worktree-materialization.test.mjs` copies a fixed file list and `new-record.mjs` now imported `scripts/lessons.mjs` (ERR_MODULE_NOT_FOUND).
**Cost**: one failed bundle validation run (about 10 minutes).
**Suspected cause**: a new static import in a shared script is invisible to tests that copy a hand-picked file set, and the slice's own check plan did not select that test.
**Proposed change**: script: make checks:changed select `pnpm test:docs-vault` whenever `scripts/new-record.mjs` or a module it imports changes.
