---
title: Development checks
doc_type: runbook
status: current
area: process
---

# Development checks

> How to choose the checks for a change, where CI internals live, how a pull
> request merges, and what each lane costs. `pnpm checks:changed` is the registry of which check covers
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

How main treats a reviewed PR's result, how pre-push and PR CI split the
lanes, and how browser and unit jobs are sharded belong to the code that does it: the
headers of `scripts/ci/classify-change.mjs`, `scripts/ci/run-ci-lane.mjs`,
`scripts/ci/run-playwright-ci.mjs`, `scripts/landing/pr-land.mjs`, and the workflow files
under `.github/workflows/`.

Pre-push validates the pushed commit, refuses a checkout that could mask its
inputs, and runs affected lint, Node and unit tests in parallel with the
relevant cheap checks. Message-part changes use
their composed catalogue once; cross-package imports also select their frontend
tests. Relevant documentation-registry and workflow-security checks run locally.
The whole hook includes preparation in its reported duration. Full contract,
Knip and browser suites remain CI work.

Before merge, a train's Checks run what its change can affect plus a fixed
core: changed-file lint, the typecheck, the contracts whose import graph
reaches the change (a message part counts as its composed catalogue), every
security and vault-format contract, and the forbidden-pattern contracts
(`FORBIDDEN_PATTERN_CONTRACTS` in `scripts/ci/classify-change.mjs`). A change
to `src/` or `app/` code or styles, or to `messages/`, also runs every ratchet;
after a merge a ratchet compares with the previous main tip. After the
merge, each push to main runs the full Checks set, including `pnpm knip` and the
full contract sweep, so a suite the plan left out turns main red rather than
the train; `pnpm pr:land` warns while that run is red. The unit shards split by
measured seconds (`scripts/data/vitest-file-durations.json`, refreshed with
`pnpm unit:durations`). The browser workflow keeps its own policy.

After a fix push to a pull request that is ready for review, a lane that
passed on the previous head is carried forward instead of run again
(`scripts/ci/carry-forward.mjs`). Every condition must hold: the previous
run tested a merge of the same base commit, and Git rebuilds the same tested
tree; no workflow file or planner module differs from the base; the push
plans nothing for the lane beyond what an empty change plans; the lane's
planned work is unchanged; and every job of the lane passed in the workflow
run whose plan job printed the `CI tested tree` annotation, without having
been carried itself. Types · Lint · Docs always runs. Unit · Contract almost
never carries, because the security and vault-format contracts read every
file. A carried lane reports success through its inactive path, and the plan
job prints a `CI lane carried forward` annotation naming the check runs.
Anything unreadable carries nothing.

CI tooling test edits keep their regression checks without promoting unrelated
lanes to full runs. Runtime planner edits, unknown paths and invalid comparison
history stay exhaustive. Unit and performance reach excludes explicit type-only
imports; source-reading contracts retain them. Exact default Node test files run
once across command aliases; flags and lifecycle hooks keep their semantics.

The browser suite is split by time. Before merge, a train runs the specs its
change maps plus the merge smoke set in `scripts/ci/merge-smoke-specs.mjs`
(first run, opening a folder, the map and node selection, the agent panel
sending, the gateway and download pages), balanced over eight shards. Any
non-test file under `src/` or `app/` reaches the browser, so one no mapping
names runs the smoke set alone; only a planner, browser-executor or root
dependency change (`package.json`, the lockfile, `patches/`) runs the whole
suite. After merge, every push to `main` runs the whole suite, measurements
and both surfaces included, even when the push reuses the train's reviewed
result for every other lane. Each push has a concurrency group of its own, so
no later merge cancels or replaces it. A defect outside the smoke set is
therefore found on `main`, not on the train.

CI rejects focused `.only` tests on every execution path. It records a trace on
the first retry, preserves that trace even when the retry passes, and uploads
full failure evidence for failed jobs. These artifacts last seven days; ordinary
passing tests produce no automatic trace. A retry passing is evidence of an
intermittent failure, not evidence that its cause was fixed.

## Merging

`pnpm pr:land <number>` merges a reviewed pull request and keeps its original
commits; `.claude/rules/git.md` owns the rest of the merge workflow. While
`main`'s latest full browser run is red, it prints one line naming that run
and its failing spec files, and the train's pull request body carries the
same line. It still merges: the line tells someone to fix `main`, it does not
stop the queue.

## Lane budgets

Every lane costs someone's afternoon, so every lane says what it costs. The
**Measured** column is a 2026-09-12 snapshot (locally on a 12-core
Apple-silicon machine, in CI over the last 20 runs) and goes stale; re-measure
before relying on it.

| Lane | Budget | Measured | What it guards |
|---|---|---|---|
| **pre-push, whole hook** | 90 s | **10-15 s** (2026-11-18, a UI and an MCP change replayed; was 80 s, then 367 s) | the common failure, found before CI |
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
| Checks · Unit · Contract (x3) | 310 s | 2026-11-18, 22 trains: shards 79-340 s, 4-201 s, 4-285 s; full sweep 271 / 222 / 186 s by file count | affected unit tests and reached plus core contracts; the full sweep after merge |
| Checks · MCP | 390 s | 146 s avg / 382 s max | the MCP and CLI boundary |
| E2E · Playwright static / web | 150 s · 160 s | 73 s · 125 s avg | static-export-only behaviour, the unattended gateway |
| E2E · Playwright chromium (x8) | 600 s | full suite 6.0-7.9 min per shard, 9.4 min end to end (2026-11-18; five shards took 13.8) | rendered journeys; before merge only the mapped specs and the merge smoke set |
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
