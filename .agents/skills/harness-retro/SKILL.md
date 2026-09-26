---
name: harness-retro
description: Record a harness lesson (a mistake, a wasted CI round, a gate that did not fire, or a costly tool pattern) as a shared immutable record before finishing, or review open lessons into verified fixes or refutations when asked or when `pnpm lessons` says a review is due.
---

# Harness retro

A lesson in `docs/records/lessons/` is shared by every person and agent, and it
changes the harness only after someone has verified it. Records are immutable:
every verdict is a new file. Not for product taste or a typo already fixed.

## Record

Write one lesson from what you already saw; do not investigate further.

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

`tool-efficiency` marks a tool pattern with a cheaper form. A recurrence of a
lesson listed by `pnpm lessons -- --area=<area>` is a new lesson citing the
earlier id. Commit the file with your work.

## Review

For each open lesson, oldest first:

1. Reproduce it once or find its recorded evidence. If the cause is something
   else, record `refuted` with the real cause.
2. Record the verdict, one `**Evidence**:` line:
   `pnpm record:new -- --kind=lesson-status --lesson=<id> --status=<verified|refuted|wontfix> --input=<file>`
3. Fix a verified lesson the smallest durable way: delete or correct the
   misleading instruction; one line in the skill or path-scoped rule loaded at
   that moment; a script fix; a hook or gate, then `/gate-probe`. Resident
   `AGENTS.md` text only when nothing narrower is loaded then.
4. After the fix is committed, record `--status=fixed` citing the commit SHA or
   pull request number.

`pnpm lessons -- --check` validates the template, verdict order, and published
records. Concurrent verdicts stay visible until a new record names both.
