---
name: harness-retro
description: Record a harness lesson (a mistake, a wasted CI round, a gate that did not fire, or a tool pattern that cost real time) as a shared immutable record, and review open lessons into verified fixes or refutations.
when_to_use: Record mode whenever such a failure is noticed, before finishing the task. Review mode when the owner asks or `pnpm lessons` says a review is due. Not for product taste or a typo the task already fixed.
---

# Harness retro

A private memory helps one agent once. A lesson in `docs/records/lessons/` is
read by every person and agent, and it changes the harness only after someone
has verified it. Records are immutable: every verdict is a new file.

## Record

One lesson, written with what you already saw. Do not investigate further.

```sh
cat > <scratch>/lesson.md <<'EOF'
**Observed**: what happened, with the command and its output, or file:line.
**Cost**: time, tokens, or CI rounds; measured, or "unknown".
**Suspected cause**: one or two sentences, or "unknown".
**Proposed change**: skill|rule|hook|script|gate|none, then the smallest durable fix.
EOF
pnpm record:new -- --kind=lesson --type=<mistake|tool-efficiency|gate-gap|process> \
  --area=<short-area> --slug=<subject> --input=<scratch>/lesson.md
```

Use `tool-efficiency` for a tool pattern that wasted time or tokens and has a
cheaper form. If `pnpm lessons -- --area=<area>` already lists the lesson, a
recurrence is a new lesson that cites the earlier id in **Observed**. Commit
the file with your work.

## Review

For each lesson `pnpm lessons` lists as open, oldest first:

1. Reproduce it once, or find its recorded evidence: output, CI run, commit.
   When the cause turns out to be something else, record `refuted` with the
   real cause. A testing tool's side effect mistaken for a product defect is
   the typical case.
2. Record the verdict. The body is one `**Evidence**:` line.
   `pnpm record:new -- --kind=lesson-status --lesson=<id> --status=<verified|refuted|wontfix> --input=<file>`
3. For a verified lesson choose the smallest durable fix, in this order:
   delete or correct the instruction that misled; one line in the skill or
   path-scoped rule that is loaded when the mistake happens; a script fix; a
   hook or gate, then `/gate-probe`. Add resident `AGENTS.md` text only when
   nothing narrower is loaded at that moment.
4. After the fix is committed, record `--status=fixed`. Its Evidence cites the
   commit SHA or pull request number.

`pnpm lessons -- --check` validates the template, verdict order, and that no
published lesson was edited. Concurrent verdicts from two worktrees stay
visible until a new record names both as parents.
