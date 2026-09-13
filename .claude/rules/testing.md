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

> Conditionally loaded for test files and configuration. `AGENTS.md` carries the
> always-loaded focused-first summary.

## Tools

- Unit and component tests: **Vitest**, **Testing Library**, and **jsdom**
  (`vitest.config.ts`, `vitest.setup.ts`).
- End to end: **Playwright** (`playwright.config.ts`, `tests/e2e/*.spec.ts`).

## Priority

1. Test pure logic in `shared/lib` and `entities/*/model` first and most deeply.
2. Test business interaction flows in `features/*/model`.
3. Test only the important interactions in composite `widgets/` and `views/`;
   do not exhaust every prop combination.
4. Keep e2e small and valuable: user journeys and regression barriers.

## Vitest commands

```bash
pnpm test                            # watch mode
pnpm checks:changed                  # recommend focused checks from the Git diff
pnpm checks:changed -- <path...>     # recommend checks for a planned file set
pnpm test src/path/to/file.test.ts   # one file
pnpm exec vitest run --changed       # tests related by Vitest's module graph
pnpm test:run -t "specific case"     # one test block
pnpm test:run                        # full unit suite, conditional escalation
```

## Playwright commands

```bash
pnpm build && PLAYWRIGHT_STATIC=1 pnpm exec playwright test   # what CI runs
pnpm exec playwright test --headed
pnpm exec playwright test tests/e2e/foo.spec.ts
pnpm exec playwright test --update-snapshots
```

### Reproduce a red e2e the way CI runs it

`PLAYWRIGHT_STATIC=1` serves the built static export; without it the config
starts `pnpm dev`. **They are different products.** Measured 2026-08-25: a change
that pushed a start card off-centre passed every local e2e run under dev and
failed four CI jobs, because the failing assertion depended on layout the dev
server rendered differently. Twenty minutes went into re-reading correct source
before the run mode was compared.

Before concluding that CI is wrong or flaky, run the exact CI line above. If it
still passes, only then look at server age (`design-gates.md`, stale
`reuseExistingServer`). A local pass under a different run mode is not evidence.

## The timing rule (2026-09-12)

**No test asserts a wall-clock number it did not measure, and no test waits by
sleeping.** A gate that can go red because the machine was busy teaches people to
retry, and a gate people retry is not a gate.

Four shapes, three of them allowed:

| Shape | Allowed | Form |
|---|---|---|
| **Condition wait** | yes, the default | `waitFor` / `findBy*` / `expect.poll` / `page.waitForFunction`. It returns the moment the condition holds, so it costs nothing on a fast machine and still passes on a slow one |
| **Relative in one run** | yes | measure both sides in the same process and assert the ratio. `src/views/ontology-insights/lib/duplicate-pairs.perf.test.ts` is the model: warm-up pass, best of three, a documented ratio of 3.8-4.2 against 0.88 when the fast path was broken |
| **Product budget with headroom** | yes, with both halves | print the measured value **and** keep the bound at >= 5x it. Say the measurement and the date in the comment, so the next reader can re-derive the ratio instead of guessing whether the number still means anything |
| **Absolute wall clock or a fixed sleep** | **no** | `expect(elapsed).toBeLessThan(n)` with no measured basis; `waitForTimeout(n)`; `await new Promise(r => setTimeout(r, n))` used as a wait |

Consequences that follow from the rule:

- **Two ceilings, both set once, both hang detectors.** `vitest.config.ts` sets
  `testTimeout` (30 s) and `vitest.setup.ts` sets `asyncUtilTimeout` (15 s) below
  it, so a wait always reports the element it was looking for instead of dying as a
  bare test timeout. Neither is a budget, nothing is asserted about either, and a
  call site may not narrow them: a hand-raised `{ timeout: n }` is a wall-clock
  number in disguise. Eight of them starved on 2026-08-28, and a ninth — a 5-second
  "product-meaningful bound" on a modal close that costs 15 ms — flaked twice more
  in September before it was removed. A lane may not override them either; one
  suite, one clock, whoever invokes it.
- **Sleeping past a constant is not waiting for it.** `setTimeout(400)` to clear a
  140 ms exit window asserts "140 < 400" about a constant the test never reads.
  Wait for the state the screen shows instead (`data-dock-state="put-away"`).
- **An order is not a duration.** "The answer must not be sent before the commit
  motion starts" is proven by observing the motion and then finding no answer —
  not by sleeping 80 ms first.
- **A hang is Vitest's job.** `expect(elapsed).toBeLessThan(5_000)` on work
  measured at 17.7 ms can only fire on a hang, which the test timeout already
  reports with a better message. Delete it.
- **Performance lanes never block.** `*.perf.test.*` runs where the number means
  something: CI on a quiet runner, not the pre-push hook, which deliberately
  saturates the machine.
- **In e2e, the conditions live in `tests/e2e/settle.ts`.** A canvas has no DOM,
  so the map's stillness is read from the `?e2e=1` probe's own drawn values and a
  DOM reveal from `Element.getAnimations()` — never from a token's duration
  copied into the spec. A sleep that survives there says in place why it is a
  measurement window rather than a wait.
- **Run Playwright in the foreground, and let it own its server.** A dev server
  started as a background command gets reaped, and the specs in flight then fail
  against a dead server in about a second each — which reads as a flake in
  whatever was being changed. Two "flakes" in `download-gateway-grid` were that
  and nothing else (2026-09-13). So: no pre-started background server, a port of
  your own via `PLAYWRIGHT_BASE_URL` so a stale server from another session
  cannot answer instead, and batches short enough to finish in the foreground.

## TDD

1. Write the failing test before a behavioral feature or regression fix.
2. Make the narrowest scope green.
3. Refactor only after it is green.

For prose, mechanical edits, and isolated visual adjustments, use the relevant
checks or rendered evidence. Do not add tests that merely duplicate the
implementation. Required checks and meaningful regression coverage still apply.

## Focused-first verification

Start with the smallest evidence that can establish the changed behaviour. Run
`pnpm checks:changed` or `pnpm checks:changed -- <path...>` and execute every
recommended direct, contract, and integration check. If a sibling test exists,
run it first.

Escalate only when the risk requires it:

- `pnpm exec tsc --noEmit`: shared types, public interfaces, route seams,
  Next/TypeScript configuration, or a cross-cutting refactor.
- `pnpm lint`: ESLint configuration, import direction, structural moves, or
  anything governed by a lint rule.
- `pnpm test:run`: shared primitives, global providers, test configuration, or a
  broad change without a direct test.
- `pnpm exec playwright test <spec>`: routes, navigation, browser workflows, or
  visible interaction. Run all Playwright only for several routes/workflows.
- `pnpm build` and desktop packaging checks: static export, Next configuration,
  bundles, release/download paths, or macOS packaging.

The final report names what ran and why that scope was sufficient. Do not run
the full suite by habit.

Measurements, captures and harness scripts live **outside** the repository —
`/Users/jinan/scratch/<fixture>/…` — never in a worktree's gitignored `output/`
or `.qa-scratch/`. A worktree is removed when its work lands, and
`git status --porcelain` does not count ignored files, so an ignored evidence
directory reads clean and goes with it. Measured 2026-09-13: a report cited
ko+en captures at a path that no longer existed by the time it was read.

## Verify web and app separately (2026-07-27)

Web and app no longer promise identical screens (`.claude/rules/surfaces.md`),
so do not perform an obsolete round trip that assumes they match.

| Target | Accepted proof |
|---|---|
| Shared map, docs, insights, and project screens | Browser proof covers the shared bundle. Recheck the installed app only when font rendering, scrolling, or window chrome changed |
| Desktop-only keychain, Git, updater, and absolute-path abilities | Installed-app evidence only; browser success proves nothing |
| The web surface itself | The three cases in `tests/e2e/web-surface-smoke.spec.ts` |

Nobody watches the web manually, so its smoke test is the only standing signal.
A desktop bridge change (`src/shared/lib/tauri-*.ts` or `src-tauri/**`) does not
authorize skipping it: `checks:changed` recommends web smoke and CI runs it for
every runtime change.

## Regression barriers

- A regression fix includes a unit test that detects that regression.
- Update an e2e baseline only when the rendered result intentionally changed,
  after capturing it in the real runtime.
- When deleting a screen or renderer, inspect and remove its e2e specs in the
  same PR. In the 2026-07 cleanup, 108 of 139 specs still targeted the deleted
  Sigma renderer and old ontology tree; none represented a live product defect.

## Cross-package contract tests (R11 pattern)

Use a contract test when a separately delivered package such as `mcp/` and a
module under `src/` must behave identically but cannot share one implementation.
Run the same input/expected-value table through both implementations.

Current examples:

- `tests/contract/parse-frontmatter.contract.test.ts`: one fixture table through
  the web, MCP, and scripts parsers (12 fixtures × 3 implementations).
- `tests/contract/validate-vault-document.contract.test.ts`: one fixture table
  through the web/UI and MCP validators (8 fixtures × 2 implementations).

Pattern:

1. `tests/fixtures/<topic>-cases.mjs` owns the input and expected results.
2. `tests/contract/<topic>.contract.test.ts` runs that table through every
   implementation. Message wording may differ; codes and data structures may not.
3. `vitest.config.ts` already includes `tests/contract/**/*.test.ts`.

Changing either implementation must run the contract. If the contract changed
intentionally, update the shared table; otherwise divergence is a regression.
