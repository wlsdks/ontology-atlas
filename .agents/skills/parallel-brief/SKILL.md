---
name: parallel-brief
description: Write a subagent brief that isolates ports, files, worktrees, scratch output, baselines, and primary evidence before parallel work begins.
---

# Parallel brief

Concurrency is not the risk; uncoordinated shared state is. Every rule here came
from a real failure on 2026-08-03 or 2026-08-04.

## 1. Give every browser run its own server

`playwright.config.ts` may reuse an existing local server. Two agents can
therefore measure different code while both report success.

- Assign a unique port and explicit `PLAYWRIGHT_BASE_URL`.
- Use `PLAYWRIGHT_STATIC=1` when proof must cover the exported build.
- Run one spec at a time so server failure is distinguishable from product failure.

## 2. One person owns each ratchet baseline

Two branches lowering the same literal from one stale starting value cannot be
combined arithmetically. The merging owner recounts after integration, lowers the
number once, and proves one step lower turns red.

Only one agent edits a ratchet file. Others may report measurements, never commit
competing baselines.

## 3. Worktrees and stash

- Never run `git add -A`; a worktree directory can be staged as an empty gitlink.
- Subagents do not remove worktrees. The coordinating owner may remove a
  task-created worktree only after confirming ownership, preserved changes,
  and no active users. Otherwise report its path for later cleanup.
- Never use `git stash`; stash is repository-wide and has erased another agent's
  work in this project.

## 4. Keep measurement scratch outside the repository

Git may ignore a path that ESLint still scans. Probe files under `output/` or
`.tmp/` have inflated warning counts before. Measure inside the assigned
worktree, write scratch under `/tmp`, and report the exact checkout used.

## 5. Assign file ownership

| Role | Owns | Everything else |
|---|---|---|
| `design-system` | `control-class.ts`, ramps in `globals.css`, the canonical Design System section | read-only |
| `design-guardian` | visual and interaction implementation | — |
| implementation agent | explicitly assigned consumer files | specification files read-only |
| audit agent | inventory and report | edit only an obvious, reversible defect when authorized |

The design-system seat owns new value vocabulary. An implementation agent that
cannot express a needed value reports and measures the gap; it does not create a
parallel system. The author of a change does not independently approve it.

## 6. Six mandatory lines

Every delegated brief states:

1. the unique server port, or that no server may run;
2. which files are read-only;
3. no stash, no `git add -A`, no subagent worktree deletion, and the cleanup owner;
4. the external scratch location;
5. which baselines must remain green and the commands that prove them;
6. the primary sources the agent must read instead of trusting a relayed summary.

## 7. Do not delegate

Keep work local when it needs only a handful of tool calls, merely rechecks your
own result, or requires editing the same files. Delegate exhaustive inventories,
environment-isolated work, and reviews whose value is independence.
