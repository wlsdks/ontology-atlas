# Benchmark run — YYYY-MM-DD

> Rename this file to your actual run date (e.g. `2026-05-10.md`). Each
> run goes in its own file so we can track effect over time as the
> ontology evolves.

## Setup

- **Repo HEAD**: `<git rev-parse HEAD>`
- **Vault size**: `<pnpm dogfood:walk | grep "vault size">` nodes
- **Claude Code version**: `<claude --version>`
- **Codex CLI version**: `<codex --version>`
- **Date / grader**: `<YYYY-MM-DD / Stark>`

## Per-task results

Fill in 4 cells per task: Claude Code OFF / Claude Code ON / Codex OFF / Codex ON.

### A1 — Domain composition

| Cell | Correctness (0–3) | Tool calls | Hallucinations | Utility (1–5) | Notes |
|---|---|---|---|---|---|
| Claude Code OFF | | | | | |
| Claude Code ON  | | | | | |
| Codex OFF       | | | | | |
| Codex ON        | | | | | |

### A2 — Stub / unfinished detection

| Cell | Correctness (0–3) | Tool calls | Hallucinations | Utility (1–5) | Notes |
|---|---|---|---|---|---|
| Claude Code OFF | | | | | |
| Claude Code ON  | | | | | |
| Codex OFF       | | | | | |
| Codex ON        | | | | | |

### A3 — Reference graph for a specific node

| Cell | Correctness (0–3) | Tool calls | Hallucinations | Utility (1–5) | Notes |
|---|---|---|---|---|---|
| Claude Code OFF | | | | | |
| Claude Code ON  | | | | | |
| Codex OFF       | | | | | |
| Codex ON        | | | | | |

### B1 — Validator issue codes

| Cell | Correctness (0–3) | Tool calls | Hallucinations | Utility (1–5) | Notes |
|---|---|---|---|---|---|
| Claude Code OFF | | | | | |
| Claude Code ON  | | | | | |
| Codex OFF       | | | | | |
| Codex ON        | | | | | |

### B2 — Conflict guard mechanism

| Cell | Correctness (0–3) | Tool calls | Hallucinations | Utility (1–5) | Notes |
|---|---|---|---|---|---|
| Claude Code OFF | | | | | |
| Claude Code ON  | | | | | |
| Codex OFF       | | | | | |
| Codex ON        | | | | | |

### C1 — Function exports (negative control)

| Cell | Correctness (0–3) | Tool calls | Hallucinations | Utility (1–5) | Notes |
|---|---|---|---|---|---|
| Claude Code OFF | | | | | |
| Claude Code ON  | | | | | |
| Codex OFF       | | | | | |
| Codex ON        | | | | | |

### C2 — package.json scripts (negative control)

| Cell | Correctness (0–3) | Tool calls | Hallucinations | Utility (1–5) | Notes |
|---|---|---|---|---|---|
| Claude Code OFF | | | | | |
| Claude Code ON  | | | | | |
| Codex OFF       | | | | | |
| Codex ON        | | | | | |

---

## Summary

After all 28 cells are filled in, average per-mode-per-category here.

### Within-agent delta (primary signal)

| | Claude Code OFF avg correctness | Claude Code ON avg correctness | Δ | Codex OFF avg correctness | Codex ON avg correctness | Δ |
|---|---|---|---|---|---|---|
| Cat A (3 tasks) | | | | | | |
| Cat B (2 tasks) | | | | | | |
| Cat C (2 tasks) | | | | | | |
| **All 7** | | | | | | |

### Tool-call efficiency

| | Cat A avg calls (OFF / ON) | Cat C avg calls (OFF / ON) |
|---|---|---|
| Claude Code | / | / |
| Codex | / | / |

(Cat A: lower-with-correctness on ON is a win. Cat C: should be roughly equal.)

### Hallucination totals

| Agent | OFF total | ON total |
|---|---|---|
| Claude Code | | |
| Codex | | |

---

## Interpretation

After filling in numbers, write 3–5 sentences here:

1. What did Cat A show? (The hypothesis test.)
2. What did Cat C show? (The bias check — should be neutral.)
3. Cross-agent: did Claude Code and Codex agree on the direction of the effect?
4. Surprises / things to investigate further.
5. Decision: does this update the project's direction?

## Raw transcripts

Drop links / paths to the raw conversation transcripts here so a third party could re-grade:

- Claude Code transcripts: `~/.claude/projects/-Users-stark-ai-ontology-atlas/<session-id>.jsonl`
- Codex transcripts: `<path or pasted>`
