---
title: Agent model and effort routing
doc_type: runbook
status: current
area: harness
---

# Agent model and effort routing

Size the task before starting, then give it to the model that does it well
enough at the lowest cost. Owner rule (2026-10-09): decided development runs
on Sonnet, information gathering on Haiku, planning, debugging and review on
Opus at `xhigh`, and only a one-way or security-critical judgment on Fable.

| Task | Agent | Model · effort | Turn cap |
|---|---|---|---|
| decide, plan small changes, talk to the owner | lead session | the owner's choice · xhigh from `.claude/settings.json` | none |
| find files, symbols, docs, release notes, web facts | `researcher` | Haiku · low | 60 |
| build one decided slice from `/delegate` | `implementer` | Sonnet · medium | 150 |
| slice work a cheaper builder can do without judgment | `planner` | Opus · xhigh | 200 |
| the product spec of a one-way product change | `product-planner` | Opus · xhigh | 250 |
| root cause of a reproduced failure or flake, then the fix | `investigator` | Opus · xhigh | 250 |
| independent review of a diff or a routed decision | `reviewer` | Opus · xhigh | 150 |
| design verdict with edits, when the owner asks | `design-guardian` | Opus · xhigh | 300 |
| a one-way, security or release decision that must not be wrong | `reviewer` with `model: fable` on the Agent call | Fable | 150 |

The Agent tool's `model` and `effort` arguments override an agent's own for
one call: raise a review to Fable, or lower a mechanical sweep to Haiku or a
simple review to `high`. Built-in agents (Explore, general-purpose, Plan) run
on the lead's model even with `CLAUDE_CODE_SUBAGENT_MODEL` set (measured
2026-10-09: Explore stayed on Opus), so pass `model` on the call or use
`researcher` for lookups. `researcher` sets `omitClaudeMd` and starts at about
5K tokens of context, against about 27K for an agent that loads the repository
instructions.

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
