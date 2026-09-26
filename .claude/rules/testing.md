---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.test.mjs"
  - "**/*.spec.ts"
  - "tests/**"
  - "vitest.config.ts"
  - "vitest.setup.ts"
  - "playwright.config.ts"
---

# Testing and verification

`AGENTS.md` owns the always-loaded rule: run `pnpm checks:changed -- --run` and
complete its recommendations. This file owns escalation and test shape.

## Priority

1. Pure logic in `shared/lib` and `entities/*/model`, deepest.
2. Interaction flows in `features/*/model`.
3. Only the important interactions of composite `widgets/` and `views/`.
4. A small set of e2e journeys and regression barriers.

## Commands

```bash
pnpm checks:changed -- <path...>     # focused checks for a planned file set
pnpm test src/path/to/file.test.ts   # one file
pnpm test:run -t "specific case"     # one test block
pnpm build && PLAYWRIGHT_STATIC=1 pnpm exec playwright test <spec>   # e2e as CI runs it
```

Without `PLAYWRIGHT_STATIC=1` the config starts `pnpm dev`, which renders
differently from the static export. Reproduce a red e2e in the CI mode before
calling CI wrong or flaky; then check for a stale server with
`lsof -iTCP:<port>`. Run Playwright in the foreground, let it start its own
server, and give parallel work its own port through `PLAYWRIGHT_BASE_URL`.

## The timing rule

No test asserts a wall-clock number it did not measure, and no test waits by
sleeping.

| Shape | Allowed | Form |
|---|---|---|
| Condition wait | yes, the default | `waitFor`, `findBy*`, `expect.poll`, `page.waitForFunction` |
| Relative in one run | yes | measure both sides in one process and assert the ratio; model: `duplicate-pairs.perf.test.ts` |
| Product budget with headroom | yes | print the measured value, keep the bound at 5x or more, and comment the measurement and date |
| Absolute wall clock or fixed sleep | no | an unmeasured `toBeLessThan(n)`, `waitForTimeout(n)`, or `setTimeout` used as a wait |

- `testTimeout` (30 s) and `asyncUtilTimeout` (15 s) are hang detectors, not
  budgets. Do not narrow them per call (`{ timeout: n }`) or per lane.
- Wait for the state the screen shows (for example `data-dock-state`), not past
  a constant. Prove an order by observing it, not by sleeping first.
- `*.perf.test.*` runs only in the Vitest `perf` project (`pnpm test:perf`,
  `fileParallelism: false`), never in the pre-push hook or a sharded sweep.
- In e2e, settle conditions live in `tests/e2e/settle.ts`: canvas stillness from
  the `?e2e=1` probe, DOM reveals from `Element.getAnimations()`. A remaining
  sleep states in place why it is a measurement window.
- Compare canvas pixels inside the page and return one number: a 5-million
  value `getImageData` array through `page.evaluate` costs 12 s per call
  (lesson 1250cf7a).

## What to test

- Behaviour features and regression fixes: write the failing test first, make
  the narrowest scope green, then refactor. A regression fix ships with a test
  that detects that regression.
- When an interaction moves focus or inert state while it animates, also press
  the next key immediately, with normal motion, not only after the settled
  state or under reduced motion (lessons d806ce25, b50c9221).
- Prose, mechanical edits and isolated visual tweaks need no new test. Never
  write a test that duplicates the implementation or pins prose.
- Update an e2e baseline only for an intentional rendered change.
- Deleting a screen or renderer deletes its e2e specs in the same PR.

## Escalation

Start from `checks:changed` and any sibling test. Escalate only when the change
reaches the named risk:

- `pnpm exec tsc --noEmit`: shared types, public interfaces, route seams,
  Next/TypeScript configuration, or a cross-cutting refactor.
- `pnpm lint`: ESLint configuration, import direction, structural moves, or
  anything a lint rule governs.
- `pnpm test:run`: shared primitives, global providers, test configuration, or
  a broad change without a direct test.
- `pnpm exec playwright test <spec>`: routes, navigation, browser workflows, or
  visible interaction; the whole suite only when several routes changed.
- `pnpm build` and desktop packaging checks: static export, Next configuration,
  bundles, release or download paths, or macOS packaging.

The final report names what ran and why that scope was enough.

Keep measurements, captures and harness scripts outside the repository (for
example `~/scratch/<task>/` or the session scratchpad). An ignored `output/`
inside a worktree is deleted with the worktree.

## Verify web and app separately

| Target | Accepted proof |
|---|---|
| Shared map, docs, insights and project screens | Browser proof covers the shared bundle; recheck the installed app only when font rendering, scrolling or window chrome changed |
| Desktop-only keychain, Git, updater and absolute-path abilities | Installed-app evidence only |
| The web surface itself | `tests/e2e/web-surface-smoke.spec.ts` |

A desktop bridge change (`src/shared/lib/tauri-*.ts`, `src-tauri/**`) still runs
web smoke.

Test keyboard input in the installed app with Computer Use idle, sending keys
through `osascript` or JXA: a Computer Use session swallows Escape system-wide.
Before fixing a platform input bug, reproduce it once without the test tool
(lesson fcc6d81f).

## Cross-package contract tests

When a separately delivered package such as `mcp/` and a module under `src/`
must behave identically without sharing code, run one table of inputs and
expected results through every implementation: the table lives in
`tests/fixtures/<topic>-cases.mjs`, the runner in
`tests/contract/<topic>.contract.test.ts` (for example `parse-frontmatter`,
`validate-vault-document`). Codes and data structures must match; wording may
differ. Change the shared table only for an intentional change.
