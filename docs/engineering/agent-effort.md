---
title: Agent effort tiers
doc_type: runbook
status: current
area: harness
---

# Agent effort tiers

Follow this when you start a Claude Code session that plans, reviews, or fans
out work. Owner rule (2026-10-02): on Opus, planning and judgment run at `xhigh`;
development of a decided slice runs at `low`.

Basis, as of Claude Code 2.1.283 and Opus 5.5 (2026-09-27): on Opus 5.5 `low`
comes close to `medium` on several coding evaluations at much lower cost, the
platform recommends `low` for subagents, and `xhigh`/`max` are for work where a
quality gain was measured
([Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5#calibrate-effort),
[Effort](https://platform.claude.com/docs/en/build-with-claude/effort)).

| Agent | Effort | Turn cap | Work |
|---|---|---|---|
| lead session | xhigh from `.claude/settings.json` | none | decide, plan small changes, talk to the owner |
| `planner` | xhigh | 200 | slices a low-effort implementer can build without judgment |
| `product-planner` | xhigh | 250 | the product spec of a one-way product change, before its review |
| `implementer` | low | 150 | one planned slice from `/parallel-brief` |
| `investigator` | xhigh | 250 | root cause of a reproduced failure or flake, then the fix |
| `reviewer` | xhigh | 150 | an independent review of a returned diff, or of a routed product or design decision |
| `design-guardian` | xhigh | 300 | a design verdict with edits, when the owner asks |

## Token budget

Every turn re-reads the whole context, so cost is context size times turns.
Three settings bound it; `pnpm harness:tokens` measures them from the local
transcripts.

- `autoCompactWindow: 200000` in `.claude/settings.json`. Opus 5.5 otherwise
  compacts near 967K; on 2026-09-26..10-04 investigators re-read 415K tokens per
  turn and the lead 511K.
- `maxTurns` per agent (table above), from the same runs: above the p90 for
  implementer, reviewer and product-planner, and below the longest planner,
  investigator and design-guardian runs, which were missions outside the role.
  At the cap the agent returns a partial result the lead can resume.
- A `tools:` allowlist on every agent. Without one an agent also loads the skill
  listing and every deferred tool, about 23K tokens per turn: implementers and
  investigators started at about 50.5K tokens against a reviewer's 27.5K. A workflow
  is a file under `.agents/skills/<name>/workflow.md`, so no agent needs the
  Skill tool.

The four costliest investigator runs that week (565 to 684 turns each) were
feature and redesign missions, not failures. Those go to `planner`, then
`implementer` slices.

## Steps

1. The lead starts at `xhigh` from the project's `.claude/settings.json`
   (`effortLevel`). Keep it there; a model cannot raise its own effort.
2. Do not export `CLAUDE_CODE_EFFORT_LEVEL`. It outranks every agent's
   `effort:` line, so implementers would run at max as well.
3. Delegate by agent type. The Agent tool has no per-call effort, so the type
   is the dial; in a Workflow script pass `effort` to `agent()`.
4. `/tasks` shows each running agent's model and effort. Afterwards, each
   subagent's transcript under `~/.claude/projects/<project>/<session>/subagents/`
   records the `effort` every request ran at; the session header shows the
   lead's.
5. Debugging and reproduction go to `investigator`, not `general-purpose`,
   which inherits the lead's level and carries no instructions of its own. A
   feature, redesign, spike, or tuning mission goes to `planner` instead.
6. Retune a tier by editing the `effort:` line in `.claude/agents/<name>.md`.

## If it fails

- Implementer slices come back wrong: the plan left a decision open. Send it
  back to `planner` before raising the implementer to `medium`.
- A plan or review misses something `max` would have caught: raise that one
  agent to `max`, compare a few runs, and keep the level you measured better.
- Codex briefs in `.agents/agents/` inherit the caller's model and effort;
  choose the reasoning effort when you start the Codex session.
