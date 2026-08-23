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
pnpm exec playwright test
pnpm exec playwright test --headed
pnpm exec playwright test tests/e2e/foo.spec.ts
pnpm exec playwright test --update-snapshots
```

## TDD

1. Write the failing test before a feature or bug fix.
2. Make the narrowest scope green.
3. Refactor only after it is green.

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
