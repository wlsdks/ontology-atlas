---
title: Agent model and effort routing
doc_type: runbook
status: current
area: harness
---

# Agent model and effort routing

Owner rule (2026-11-27): every agent runs on Opus, including specs, slice
plans, reviews, research and design verdicts. Fable runs only with the owner's
yes for one task: when the lead or an agent judges a task too complex for Opus,
it asks the owner first, naming the task and why Opus is not enough, and waits.
This replaces the 2026-11-12 split (Opus builds, Fable judges). Owner rule
(2026-11-27): each agent's name says what it does, and each agent has one role.

Effort follows Anthropic's Fable 5.2 prompting guide
(<https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-2>):
`high` is the level for hard coding, agentic work and long unattended runs,
and most of the model's gain arrives there; `xhigh` costs far more tokens for
a small gain and belongs where that gain was measured. The code-reviewer and
the investigator keep `xhigh` because one missed defect or wrong root cause costs
more than the run; no comparison has been made for either yet.

| Task | Agent | Model · effort | Turn cap |
|---|---|---|---|
| decide, plan small changes, talk to the owner | lead session | the owner's choice · high from `.claude/settings.json` | none |
| build one slice from `/delegate`, deciding inside its owned files | `implementer` | Opus · high | 300 |
| root cause of a reproduced failure or flake, then the fix | `investigator` | Opus · xhigh | 250 |
| the product spec: person and moment, problem, patterns that already worked, options, first slice and its acceptance | `spec-writer` | Opus · high | 250 |
| split a decided change into slices: file ownership, cross-slice decisions, order, acceptance | `slice-planner` | Opus · high | 200 |
| independent review of a diff or a routed decision: correctness, security, contracts; never edits | `code-reviewer` | Opus · xhigh | 150 |
| design verdict and mockups (scratchpad or pull request, never committed); never edits product code | `design-reviewer` | Opus · high | 300 |
| one research question from public sources, each claim cited, ranked short answer; never edits | `researcher` | Opus · high | 150 |

The correction the owner picks after a design verdict goes to `implementer`.
Sealed-probe grading and five-second tests stay on `general-purpose`.

The Agent tool's `model` and `effort` arguments override an agent's own for
one call, for example a simple review at `high`. Built-in agents (Explore,
general-purpose, Plan) run on the lead's model even with
`CLAUDE_CODE_SUBAGENT_MODEL` set (measured 2026-10-09: Explore stayed on
Opus). Lookups go to Explore with `model: opus` on the call.

## Token budget

Every turn re-reads the whole context, so cost is context size times turns.
Three settings bound it; `pnpm harness:tokens` measures them from the local
transcripts.

- `autoCompactWindow: 400000` in `.claude/settings.json`, the owner's choice
  over 200K for answer quality. Opus 5.5 otherwise compacts near 967K; on
  2026-09-26..10-04 investigators re-read 415K tokens per turn and the lead 511K.
- `maxTurns` per agent (table above), from the same runs: above the p90 for
  implementer, code-reviewer and spec-writer, and below the longest
  slice-planner, investigator and design-reviewer runs (then named planner and
  design-guardian), which were missions outside the role. The researcher cap
  is a first setting with no runs behind it yet.
  At the cap the agent returns a partial result the lead can resume. The
  implementer cap rose to 300 after five slices hit 150 on 2026-11-18/19
  (CI gates, build tuning, dependency audit, construction depth).
- A `tools:` allowlist on every agent. Without one an agent also loads the skill
  listing and every deferred tool, about 23K tokens per turn: implementers and
  investigators started at about 50.5K tokens against a code-reviewer's 27.5K. A workflow
  is a file under `.agents/skills/<name>/workflow.md`, so no agent needs the
  Skill tool.

The four costliest investigator runs that week (565 to 684 turns each) were
feature and redesign missions, not failures. Those go to `slice-planner`, then
`implementer` slices.

## Steps

1. The lead starts at `high` from the project's `.claude/settings.json`
   (`effortLevel`). A model cannot raise its own effort; the owner raises one
   session with `/effort` when a task warrants it.
2. Do not export `CLAUDE_CODE_EFFORT_LEVEL`. It outranks every agent's
   `effort:` line, so implementers would run at max as well.
3. Delegate by agent type. The Agent tool has no per-call effort, so the type
   is the dial; in a Workflow script pass `effort` to `agent()`.
4. `/tasks` shows each running agent's model and effort. Afterwards, each
   subagent's transcript under `~/.claude/projects/<project>/<session>/subagents/`
   records the `effort` every request ran at; the session header shows the
   lead's.
5. Debugging and reproduction go to `investigator`, research with sources to
   `researcher`, and a design verdict or mockup to `design-reviewer`, not
   `general-purpose`, which inherits the lead's level and carries no
   instructions of its own. A feature, redesign, spike, or tuning mission goes
   to `slice-planner` instead.
6. Retune a tier by editing the `effort:` line in `.claude/agents/<name>.md`.

## If it fails

- Implementer slices come back wrong: a decision that crosses slices was left
  open. Send that decision back to `slice-planner`; do not narrow the builder's brief.
- A plan, spec or verdict misses something a higher level would have caught:
  raise that one agent a level, compare a few runs on the same input, and keep
  the level you measured better.
- Codex briefs in `.agents/agents/` inherit the caller's model and effort;
  choose the reasoning effort when you start the Codex session.
