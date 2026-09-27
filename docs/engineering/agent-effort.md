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
| lead session | xhigh from `.claude/settings.json`; `/effort max` for one session | decide, plan small changes, talk to the owner |
| `planner` | max | slices a low-effort implementer can build without judgment |
| `implementer` | low | one planned slice from `/parallel-brief` |
| `investigator` | max | root cause of a failure or flake, then the fix |
| `reviewer` | max | an independent review of a returned diff, or of a routed product or design decision |
| `design-guardian` | max | a design verdict with edits, when the owner asks |

## Steps

1. The lead starts at `xhigh` from the project's `.claude/settings.json`
   (`effortLevel`), the highest level a settings file accepts. For a session
   that is mostly planning or judgment, run `/effort max` or start with
   `claude --effort max`; `max` lasts one session, and a model cannot raise
   its own effort.
2. Do not export `CLAUDE_CODE_EFFORT_LEVEL`. It outranks every agent's
   `effort:` line, so implementers would run at max as well.
3. Delegate by agent type. The Agent tool has no per-call effort, so the type
   is the dial; in a Workflow script pass `effort` to `agent()`.
4. `/tasks` shows each running agent's model and effort. Afterwards, each
   subagent's transcript under `~/.claude/projects/<project>/<session>/subagents/`
   records the `effort` every request ran at; the session header shows the
   lead's.
5. Debugging and reproduction go to `investigator`, not `general-purpose`,
   which inherits the lead's level and carries no instructions of its own.
6. Retune a tier by editing the `effort:` line in `.claude/agents/<name>.md`.

## If it fails

- Implementer slices come back wrong: the plan left a decision open. Send it
  back to `planner` before raising the implementer to `medium`.
- Cost or latency climbs without better plans: lower `planner` or `reviewer`
  to `xhigh` and compare a few runs; keep whichever you measured better.
- Codex briefs in `.agents/agents/` inherit the caller's model and effort;
  choose the reasoning effort when you start the Codex session.
