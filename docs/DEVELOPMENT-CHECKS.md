---
title: Development checks
doc_type: runbook
status: current
area: process
---

# Development checks

> How to choose the checks for a change, where CI internals live, and what
> each lane costs. `pnpm checks:changed` is the registry of which check covers
> which path (its rules live in `scripts/lib/check-rules/`), and the README
> command table names the contributor commands. The reasons a gate exists
> live in the decision records and in the gate's own header, not here.

## Default gate

Start with the planner to inventory candidates without running them:

```bash
pnpm checks:changed
```

It reads the Git diff (tracked and untracked), printing direct sibling checks
and escalation candidates. Select the smallest checks that cover the actual
change and its relevant failure modes; state what ran and any remaining risk.
Escalate to `pnpm test:run`, `pnpm lint`, `pnpm build`, broad Playwright, or
desktop packaging when a failure, shared contract, routing, configuration,
release surface, or user workflow requires it. Keep required CI unchanged.

## Where CI internals live

How main reuses a reviewed PR's result, how pre-push and PR CI split the
lanes, and how browser jobs are sharded belong to the code that does it: the
headers of `scripts/ci/classify-change.mjs`, `scripts/ci/run-ci-lane.mjs`,
`scripts/ci/run-playwright-ci.mjs`, `scripts/landing/pr-land.mjs`, and the workflow files
under `.github/workflows/`.

Pre-push validates the pushed commit, refuses a checkout that could mask its
inputs, and selects affected lint, Node and unit tests. Message-part changes use
their composed catalogue once; cross-package imports also select their frontend
tests. Relevant documentation-registry and workflow-security checks run locally.
The whole hook includes preparation in its reported duration. Full contract,
Knip and browser suites remain CI work.

CI tooling test edits keep their regression checks without promoting unrelated
lanes to full runs. Runtime planner edits, unknown paths and invalid comparison
history stay exhaustive. Unit and performance reach excludes explicit type-only
imports; source-reading contracts retain them. Exact default Node test files run
once across command aliases; flags and lifecycle hooks keep their semantics.

CI rejects focused `.only` tests on every execution path. It records a trace on
the first retry, preserves that trace even when the retry passes, and uploads
full failure evidence for failed jobs. These artifacts last seven days; ordinary
passing tests produce no automatic trace. A retry passing is evidence of an
intermittent failure, not evidence that its cause was fixed.

## Lane budgets

Every lane costs someone's afternoon, so every lane says what it costs. The
**Measured** column is a 2026-09-12 snapshot (locally on a 12-core
Apple-silicon machine, in CI over the last 20 runs) and goes stale; re-measure
before relying on it.

| Lane | Budget | Measured | What it guards |
|---|---|---|---|
| **pre-push, whole hook** | 90 s | **80 s** (was 367 s) | the common failure, found before CI |
| PR CI `contract` | — | formerly 80 s locally | full ratchets stay in CI; removed from pre-push |
| PR CI `dead_code` | — | formerly 33 s locally | whole-graph Knip stays in CI; removed from pre-push |
| pre-push `unit` | — | 6-19 s; skipped when every change since the merge base passed `checks:changed -- --run` on the same content | the tests that import the change |
| pre-push `source_language` | — | 7 s | Korean in source comments |
| pre-push `lint` | — | 1-3 s | ESLint on the changed files |
| pre-push `typecheck` · `comment_refs` · `decisions` | — | ~1 s each | types, code-comment citations, a route with no record |
| pre-push `licenses` | — | 6-23 s (2026-10-02; alone, then beside nine lanes) | the license allow-list and notice freshness, when a shipped dependency tree changes |
| **PR CI, wall clock** | 8 min | plan 25 s, then the slowest job | — |
| Checks · Check impact plan | 25 s | 21 s avg | a missing plan is RED |
| Checks · Types · Lint · Docs | 260 s | 150 s avg / 238 s max | type, lint and documentation gates |
| Checks · Unit · Contract (x3) | 260 s | was 437 s avg / 705 s max unsharded | unit regressions and the full contract sweep |
| Checks · MCP | 390 s | 146 s avg / 382 s max | the MCP and CLI boundary |
| E2E · Playwright static / web | 150 s · 160 s | 73 s · 125 s avg | static-export-only behaviour, the unattended gateway |
| E2E · Playwright chromium (x3) | 600 s | 392-421 s avg | rendered journeys |
| Vault freshness | 30 s | 24 s avg | frontmatter integrity and node drift (FYI, never fails the PR) |
| Windows beta · verify | 700 s | 582 s avg | Windows-only bundle facts |
| Windows beta · Rust audit (also in the release) | 40 s | not yet measured alone; its steps took 10 s inside the Windows job | Rust advisories and unsoundness, from a lockfile-only checkout |
| Dependency audit (manifests, lockfiles, weekly) | 40 s | not yet measured; reads lockfiles, installs nothing | a high production advisory in the app or the bundled MCP server |
| Checks · Windows install canary | 100 s | derived from the release job's 57 s of shared steps | that **any** change can break `pnpm install` on Windows, which is why it carries no path filter |
| Pages · build · deploy · verify | 120 s · 30 s · 40 s | 97 s · 9 s · 18 s | the static export builds and the hosted surface answers |

The budget is declared in the workflow as `# budget: <n>s` beside the job's
`timeout-minutes`, which must sit between the budget and 1.5x it;
`tests/contract/ci-gates/workflow-budgets.contract.test.ts` refuses a job without both.
Playwright jobs are exempt from the ceiling half, because
`ci-bounded-network.contract.test.ts` already requires them to leave half the
job for tests after a bounded 12-minute browser install.

Two things the numbers are not. The pre-push budget is **printed, not
enforced** — a gate that refused a green push because the machine was busy is
the defect `.claude/rules/testing.md` ("The timing rule") exists to stop. And a
lane's measured time is not a pass condition anywhere: only a job's own
`timeout-minutes` can fail on the clock, which is the mechanism these budgets
bound.

To re-measure a CI job: `gh run list --limit 20` then
`gh run view <id> --json jobs`.

The Windows install canary carries no path filter because any change can break
`pnpm install`; its header in `.github/workflows/checks.yml` records why.
