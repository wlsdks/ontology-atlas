# Benchmark — does the ontology actually help AI agents?

> The single biggest unverified premise of this project:
>
> **"AI agents work better when they can read and write the codebase ontology vault."**
>
> Until we have data, this is a belief, not a claim. This folder is the
> first attempt to put it on a measurement scale.

## Why this exists

We built CLI · MCP · 14 tools · web workbench all on top of one assumption — that giving an AI agent access to a curated graph of `kind / domain / capability / element` makes it answer codebase questions better. We've never tested whether that's actually true.

If the effect is large, this folder becomes evidence in the README. If small, we re-design — maybe the schema is too thin, maybe agents prefer raw grep, maybe the value is elsewhere.

Either way, **measurement before further investment**.

## What's in here

| File | Purpose |
|---|---|
| [`tasks.md`](tasks.md) | 7 benchmark tasks — 3 categories (cross-cutting / semantic / negative-control). Each task has a known correct answer for human grading. |
| [`rubric.md`](rubric.md) | How to score: correctness 0–3, tool-call count, hallucination count, subjective utility 1–5. |
| [`results/2026-05-template.md`](results/2026-05-template.md) | Empty matrix (task × agent × mode). Fill in after each measurement run. |

## How to measure

Two paths, depending on which agent:

- **Claude Code**: manual, see "Manual run protocol" below. (Claude Code CLI doesn't expose a non-interactive mode that's safe to script.)
- **Codex CLI**: **automated** via [`scripts/benchmark.mjs`](../../scripts/benchmark.mjs) (R13 #62) — `pnpm benchmark --bypass` runs all 7 tasks × 2 modes, captures transcripts, and writes a tool-call summary table. Correctness/hallucination scoring still happens by hand against the saved transcripts.

### Codex automated run

```bash
pnpm benchmark --dry-run     # verify config without spawning codex
pnpm benchmark --bypass      # full 14-cell run (~5-10 minutes)
pnpm benchmark --bypass --on-only   # ON-only (faster re-test after vault change)
```

Why `--bypass` is required: Codex's `exec` mode default-denies all MCP tool calls, so without `--dangerously-bypass-approvals-and-sandbox` the ON column would be indistinguishable from OFF (Codex would just fall back to grep). The flag is required by-design — the script fails fast without it.

Output:
- `docs/benchmark/results/<date>-codex-<task>-<mode>.txt` — per-cell raw transcript
- `docs/benchmark/results/<date>-codex-summary.md` — auto-generated tool-call table

### Manual run protocol

This is **not automated** for Claude Code. We deliberately measure in the same agent shells real users live in, at subscription pricing — not via raw API calls — because that's the actual user economics.

### Setup

Two agent installs, both with `oh-my-ontology` repo opened:

1. **Claude Code** (Anthropic) — `~/.claude/projects/<project>/<session>.jsonl` is auto-saved.
2. **Codex CLI** (OpenAI) — transcript path varies; capture by hand if needed.

For each agent, you'll run **two modes**:

- **Mode OFF**: `.mcp.json` does NOT include `oh-my-ontology` (only the agent's default tools — Read / Grep / Bash / etc).
- **Mode ON**: `.mcp.json` includes `oh-my-ontology-mcp` pointing at `docs/ontology/`.

Toggle by editing `.mcp.json` between runs and restarting the agent.

### Run protocol

For each task in `tasks.md`:

1. **Fresh session** — close any prior session, open a new one. (Avoids context bleed.)
2. **Paste the task prompt verbatim** — no follow-ups, no nudging. Whatever the agent answers, that's the answer.
3. **Save the transcript / screenshot** — for Claude Code, the jsonl is enough. For Codex, copy the conversation.
4. **Score** per `rubric.md`.
5. **Fill in** `results/2026-05-template.md` (rename to your run's date if needed).

### Run all four cells per task

Each of the 7 tasks should be measured 4 times:

| Cell | Agent | MCP mode |
|---|---|---|
| 1 | Claude Code | OFF (Read/Grep only) |
| 2 | Claude Code | ON (oh-my-ontology MCP) |
| 3 | Codex | OFF |
| 4 | Codex | ON |

7 tasks × 4 cells = **28 runs total**. Each run is ~2-5 minutes — total bench time is ~1-2 hours.

## Honest measurement principles

- **Within-agent delta is the primary signal**. Claude Code OFF → ON is meaningful. Claude Code OFF → Codex OFF is comparing different model/tool stacks, not the ontology effect.
- **No follow-up prompts**. The agent's first complete answer is what scores. Nudging contaminates the result.
- **Hallucinations count negatively**. If the agent confidently cites a file or slug that doesn't exist, that's worse than "I don't know".
- **Negative-control tasks (Cat C)** *should* show small or zero delta — they're verifiable by raw grep. If MCP-on is dramatically worse on Cat C, that's a sign MCP is misleading the agent.

## What we're hoping to learn

- **Does Cat A (cross-cutting graph) show a clear MCP-on advantage?** If yes → product validated for the use case it was designed for.
- **Does Cat B (semantic) show a graded response?** Useful data on where the schema is too thin.
- **Does Cat C (grep-able) show neutrality?** If MCP-on hurts here, we've over-trained agents to reach for the wrong tool.
- **Cross-agent consistency** — does the effect hold across Claude Code and Codex, or is it agent-specific?

Results will be summarized in this README and (if signal is strong) in the project's main README under "Verifiable promises".

## Current measurement status

| Run | Vault | Agents (n) | Result file | Headline |
|---|---|---|---|---|
| R13 first | 22 nodes | Claude Code self + Codex bypass (n=2) | `results/2026-05-04-claude-code.md` · `results/2026-05-04-codex.md` | CC: hallucination 9→0, +1.0 correctness · Codex: tool calls 7.0→1.67 (-76%), correctness saturated |

R14 (post-2026-05-05) note: vault grew **22 → 25 nodes** (added `capabilities/ontology-sync-skill` + `capabilities/session-start-ontology-context`). Re-measurement is **user-triggered** since Codex bypass requires explicit `--dangerously-bypass-approvals-and-sandbox` and Claude Code self-run requires a manual session.

### Re-measurement triggers (user runs these manually)

```bash
# Codex 14-cell automated re-measurement (full bypass, ~20 min)
pnpm benchmark --bypass

# Codex ON-only 7 cells (faster, ~10 min)
pnpm benchmark --bypass --on-only

# Claude Code self-measurement is manual — open a new session and walk
# the 7 prompts in tasks.md, recording transcripts into a new
# results/<date>-claude-code.md.
```

Aim: when the vault grows another ~25 nodes (≈50 total), re-measure to test whether the MCP advantage **scales** (graph reasoning gain widens) or **saturates** (raw grep also works fine at 50 nodes).
