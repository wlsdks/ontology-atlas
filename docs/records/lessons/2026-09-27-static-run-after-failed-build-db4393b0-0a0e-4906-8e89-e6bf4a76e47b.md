---
id: db4393b0-0a0e-4906-8e89-e6bf4a76e47b
date: 2026-09-27
kind: mistake
status: reported
harness_area: e2e
---
**Observed**: after merging main (which added `remark-parse` and `unified`) without `pnpm install --frozen-lockfile`, `pnpm build` failed with `Module not found: Can't resolve 'remark-parse'`; the next command was joined with `;`, so `PLAYWRIGHT_STATIC=1 pnpm checks:changed -- --run` still ran and failed its browser batch against an `out/` left by an earlier build of another branch. `playwright.config.ts` only checks that `out/index.html` exists.
**Cost**: one wasted `checks:changed -- --run` (about 7 minutes) and a misleading red result.
**Suspected cause**: a build and a static run chained with `;` instead of `&&`, and no install after a merge that changed `pnpm-lock.yaml`.
**Proposed change**: script — have the static Playwright config refuse an `out/` older than the newest commit, or `checks:changed` refuse a static run when `pnpm-lock.yaml` changed since the last install; until then chain `pnpm install --frozen-lockfile && pnpm build && …` after every merge.
