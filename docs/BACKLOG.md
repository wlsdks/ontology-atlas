---
title: Backlog — ontology-atlas
doc_type: index
status: current
area: process
---

# Backlog — ontology-atlas

This file is the stable entrypoint, not a shared status or completion log.
Every worktree appends its own UUID record under `docs/records/backlog/`.
Read the composed current state before starting or changing a task:

```sh
pnpm backlog
pnpm backlog -- --task=V1.5
```

Use `--json` for the complete typed result. Each task exposes its current record
IDs, evidence, status, and originating worktree. A `needs_reconciliation` task
has concurrent heads; neither observation silently replaces the other.

## Current priority — useful meaning across real tasks (2026-09-13)

The [product thesis](PRODUCT-DIRECTION.md#the-atlas-product-thesis) sets value.
The [execution plan](MEANING-WORKFLOW-PLAN.md) owns scope, dependencies, acceptance,
and the selected design. Current status belongs only to the composed records.

| Order | Track | Recovery to prove |
|---|---|---|
| 1 | V1 | Recover source-backed meaning from unfamiliar work code; expose unsupported claims |
| 2 | V2 | Reuse reviewed task context during a real coding task |
| 3 | V3 | Let a person inspect, correct, reject, or defer a task's meaning change |
| 4 | V4 | Reuse accepted meaning in a later independent task and measure its burden |

Dependencies determine eligibility, not row adjacency. For example, V3.3
precedes V3.2. A reviewed starting vault may isolate reuse from construction,
with that limitation disclosed. Preserve the plan's owner-selected V3 direction.

## Record one worktree's observation

Write the outcome and evidence to a file outside the repository, then append:

```sh
pnpm backlog -- --append --task=V1.5 --status='in_progress' --parents=UUID --worktree=branch-or-worktree-label --input=/absolute/path/evidence.md
```

Use the exact current head IDs returned by the task read. For a new task, omit
`--parents`. Reconcile multiple heads only after reviewing every observation;
pass all their IDs comma-separated and explain the chosen state in the new body.
A status update is a new record, never an edit to a published record.

The writer creates `YYYY-MM-DD-task-UUID.md` exclusively. Date, task name, branch,
and a worktree label alone are not unique enough. The UUID is minted for each
observation, so even two worktrees updating the same task add different files.
Never reserve a sequential number or prepend to this file. Commit only your
new record; preserve other worktrees' evidence.

Status forms are `ready`, `in_progress`, `blocked(reason)`, `hold(reason)`,
`done(evidence)`, and `cancelled(reason)`. Existing status details are preserved.
Code verification, merge, and human meaning acceptance remain separate facts;
a `done` record must not invent one from another.

```sh
pnpm backlog:check
```

This validates all records and references, refuses unresolved concurrent task
heads, and checks published-record immutability against the merge base with
`origin/main`. Fetch that branch first; a local fixture may explicitly supply
`--base=REF`. Different task records merge independently. Same-task observations
may require human or author reconciliation even when Git reports no conflict.

## Prior evidence

The [complete pre-migration snapshot](BACKLOG-SNAPSHOT-2026-09-13.md) preserves
all 34 imported task statuses, completion evidence, historical decisions, and
qualifiers. It is historical evidence, not a second live status source. Its
former single-file update and single-global-worker rules are superseded here;
parallel work still respects task dependencies, ownership, and file boundaries.

For a branch started before this migration, merge current main before recording
more work. Preserve pending central-backlog edits outside the repository, read
the current task heads, and append those observations as new UUID records.
Do not resolve a migration conflict by restoring the whole old central ledger
or rewriting the historical snapshot.

## Landing backlog records

A pull request that only adds backlog records lands like any other: `pnpm pr:land
NUMBER` queues it for the next train. When its checks are already green (`pnpm
pr:ci NUMBER`) and its files do not overlap anything main changed since its base,
the fast path merges it at once without waiting for the train.
