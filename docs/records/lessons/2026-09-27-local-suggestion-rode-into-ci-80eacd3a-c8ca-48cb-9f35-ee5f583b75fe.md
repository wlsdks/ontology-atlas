---
id: 80eacd3a-c8ca-48cb-9f35-ee5f583b75fe
date: 2026-09-27
kind: gate-gap
status: reported
harness_area: ci
---
**Observed**: train #1957 (a comment-only change to src/shared/ui/control-class.ts) was cancelled: `Unit · Contract 1/3` ran `pnpm exec vitest related --run --passWithNoTests src/shared/ui/control-class.ts …` after the sharded `vitest run --changed` and hit its 6-minute ceiling.
**Cost**: one train CI round and a re-queue.
**Suspected cause**: the sibling-suite `vitest related` suggestion was added for local `checks:changed`, but scripts/classify-change.mjs copies focused suggestions into the CI unit lane as unsharded extra commands, where the sharded affected run already covers it.
**Proposed change**: script: drop `vitest related` from the CI unit extras whenever the affected run is active; a classify-change test pins it.
