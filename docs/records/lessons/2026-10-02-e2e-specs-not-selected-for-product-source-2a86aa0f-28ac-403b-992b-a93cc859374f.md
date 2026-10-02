---
id: 2a86aa0f-28ac-403b-992b-a93cc859374f
date: 2026-10-02
kind: gate-gap
status: reported
harness_area: ci
---
**Observed**: #2331 changed `src/features/vault-agent/model/use-local-compile.ts` and its landing train 37003295448 planned `[ci-impact] ... playwright=skip ... comparable change`, because `classify-change.mjs` `BROWSER_INPUTS` leaves model/lib `.ts` to Vitest; `tests/e2e/library-incremental-compile.spec.ts` then failed 3 of 3 on every later train. #2328 changed `src/shared/ui/term-hint.tsx`; train 37001111476 planned `playwright=smoke`, which never runs the post-merge list, so `tests/e2e/hover-contrast.spec.ts` (`/ko/agents/?tab=mcp`, 5.07 → 4.48) failed only on later full trains. Locally `pnpm checks:changed` suggests a Playwright spec only when the spec file itself changed (`directPlaywrightTestSuggestions` in `scripts/lib/focused-check-suggestions.mjs`), so neither author was told to run either spec.
**Cost**: every landing train from 2026-10-02 11:43Z red on both specs (at least six train runs) until the fix branch.
**Suspected cause**: neither the local suggester nor the CI planner maps product source to the e2e specs that drive it through the browser, and smoke mode excludes post-merge specs even when an unmapped UI path is what changed.
**Proposed change**: script. Map a changed `src/` file to the e2e specs whose test ids or routes it renders (or to specs that import its fixtures), and let smoke mode add post-merge specs that cover a changed shared UI primitive.
