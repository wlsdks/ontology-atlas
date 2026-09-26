---
title: Agent effort tiers
doc_type: runbook
status: current
area: harness
---

# Agent effort tiers

Follow this when you start a Claude Code session that plans, reviews, or fans
out work. It leaves thinking at the highest effort and typing at the lowest.

Basis, as of Claude Code 2.1.283 and Opus 5.5 (2026-09-27): on Opus 5.5 `low`
comes close to `medium` on several coding evaluations at much lower cost, the
platform recommends `low` for subagents, and `xhigh`/`max` are for work where a
quality gain was measured
([Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5#calibrate-effort),
[Effort](https://platform.claude.com/docs/en/build-with-claude/effort)).

| Agent | Effort | Work |
|---|---|---|
| lead session | max, set by you | decide, plan small changes, talk to the owner |
| `planner` | max | slices a low-effort implementer can build without judgment |
| `implementer` | low | one planned slice from `/parallel-brief` |
| `reviewer` | max | an independent review of a returned diff before landing |
| PO and design seats, `design-guardian` | max | routed judgment |
| `chief` | medium | coordination only |

## Steps

1. Start the lead with `claude --effort max`, or run `/effort max` in the
   session. `max` lasts one session; nothing in the repository can raise the
   lead's effort, and a model cannot raise its own.
2. Do not export `CLAUDE_CODE_EFFORT_LEVEL`. It outranks every agent's
   `effort:` line, so implementers would run at max as well.
3. Delegate by agent type. The Agent tool has no per-call effort, so the type
   is the dial; in a Workflow script pass `effort` to `agent()`.
4. `/tasks` shows each running agent's model and effort; confirm the tiers
   there.
5. Retune a tier by editing the `effort:` line in `.claude/agents/<name>.md`.

## If it fails

- Implementer slices come back wrong: the plan left a decision open. Send it
  back to `planner` before raising the implementer to `medium`.
- Cost or latency climbs without better plans: lower `planner` or `reviewer`
  to `xhigh` and compare a few runs; keep whichever you measured better.
- Codex briefs in `.agents/agents/` inherit the caller's model and effort;
  choose the reasoning effort when you start the Codex session.
