---
name: parallel-brief
description: Write a subagent brief that isolates ports, files, worktrees, scratch output, baselines, and primary evidence before parallel work begins, including one shared brief for many slices.
when_to_use: Use before delegating work to two or more parallel subagents or worktrees. Not for a single small delegated read.
---

# Parallel brief

Concurrency is not the risk; uncoordinated shared state is. Every rule here came
from a real failure.

## 1. Give every browser run its own server

`playwright.config.ts` may reuse an existing local server. Two agents can
therefore measure different code while both report success.

- Assign a unique port and explicit `PLAYWRIGHT_BASE_URL`.
- Use `PLAYWRIGHT_STATIC=1` when proof must cover the exported build.
- Run one spec at a time so server failure is distinguishable from product failure.
- `pnpm checks:changed` reaches Playwright only through the environment: run it
  with the same `PLAYWRIGHT_STATIC=1 PLAYWRIGHT_BASE_URL=...` prefix, or its lane
  starts a dev server on :3100.

## 2. One person owns each ratchet baseline

Two branches lowering the same literal from one stale starting value cannot be
combined arithmetically. The merging owner recounts after integration, lowers the
number once, and proves one step lower turns red.

Only one agent edits a ratchet file. Others may report measurements, never commit
competing baselines.

## 3. Worktrees and stash

- Never run `git add -A`; a worktree directory can be staged as an empty gitlink.
- Subagents do not remove worktrees. After a landing, the coordinating owner
  removes task-created worktrees with `pnpm bundle:prune` (`/review-and-land`);
  a worktree it keeps is reported by path, never deleted by hand.
- Never use `git stash`; stash is repository-wide and has erased another agent's
  work in this project.

## 4. Keep measurement scratch outside the repository

Git may ignore a path that ESLint still scans. Probe files under `output/` or
`.tmp/` have inflated warning counts before. Measure inside the assigned
worktree, write scratch under the session scratch directory, and report the
exact checkout used.

## 5. Assign file ownership

| Role | Owns | Everything else |
|---|---|---|
| spec slice (declared `design-contract`) | `control-class.ts`, ramps in `globals.css`, the canonical Design System section | read-only |
| `design-guardian` | visual and interaction implementation | — |
| implementation agent | explicitly assigned consumer files | specification files read-only |
| audit agent | inventory and report | edit only an obvious, reversible defect when authorized |

The spec slice owns new value vocabulary, reviewed through the `reviewer`'s
`tokens` lens. An implementation agent that
cannot express a needed value reports and measures the gap; it does not create a
parallel system. The author of a change does not independently approve it.

Before assigning scopes, run `pnpm conflicts:scan` so no scope includes a file an open pull request is already changing, unless that overlap is intended.

## 6. Eight mandatory lines

Spawn each slice as `implementer` (Opus, low effort) and review what returns with
`reviewer` (Opus, max) through `/review-and-land`; a slice that still needs judgment goes back to the
`planner` first, and debugging or a flake goes to `investigator` (max), never
`general-purpose`. The Agent tool takes no per-call effort, so the agent type is
the dial; in a Workflow script pass `effort` to `agent()`. Every delegated brief
states:

1. the unique server port, or that no server may run;
2. which files are read-only, and that a slice adding modules loaded at runtime
   (glob, readdir, dynamic import) also owns `scripts/quality/dead-code/`;
3. no stash, no `git add -A`, no subagent worktree deletion, and the cleanup owner;
4. the external scratch location;
5. which baselines must remain green and the commands that prove them, and that
   the final report quotes each command exactly as it was run;
6. the primary sources the agent must read instead of trusting a relayed summary;
7. the landing rule: the agent commits on its own branch in its own worktree.
   On the train path it also pushes and opens a draft pull request
   (`gh pr create --draft`), and never marks it ready or runs `pnpm pr:land`;
   for an integration branch it does not push. The lead lands after an
   independent review with `/review-and-land`.
8. a time budget, such as "about 20 minutes": Opus 5.5 paces its work to a
   stated budget and usually finishes inside it. It is advisory, so the
   coordinator keeps its own timeout.

## 7. One brief, many slices

When several slices apply one procedure across areas (a sweep, a rename, a
translation), write the procedure once to a scratch brief file and give each
agent that file plus its slice id:

- A manifest maps every path in scope to exactly one slice id. A script builds
  it from `git ls-files`; never a hand-typed list.
- One pilot slice runs first. Its independent review becomes lettered
  amendments at the top of the brief, which override the plan; then fan out.
- Every slice writes a ledger naming each owned path's outcome (changed,
  nothing to do, or skipped with a reason) and its measures, so coverage is
  counted rather than trusted.
- The brief states §6's eight lines once, plus setup, the commit structure,
  the report shape, and the pull request title and body.

## 8. Do not delegate

Keep work local when it needs only a handful of tool calls, merely rechecks your
own result, or requires editing the same files. Delegate exhaustive inventories,
environment-isolated work, and reviews whose value is independence.
