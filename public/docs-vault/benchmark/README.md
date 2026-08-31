# Benchmark — does the ontology actually help AI agents?

> The single biggest unverified premise of this project:
>
> **"AI agents work better when they can read and write the codebase ontology vault."**
>
> Until we have data, this is a belief, not a claim. This folder is the
> first attempt to put it on a measurement scale.

## Why this exists

We built CLI · MCP · graph tooling · a macOS local workbench all on top of one assumption — that giving an AI agent access to a curated graph of `kind / domain / capability / element` makes it answer codebase questions better. We've never tested whether that's actually true.

If the effect is large, this folder becomes evidence in the README. If small, we re-design — maybe the schema is too thin, maybe agents prefer raw grep, maybe the value is elsewhere.

Either way, **measurement before further investment**.

> **Read [`FINDINGS-2026-08-25.md`](FINDINGS-2026-08-25.md) first.** It records
> what the first real run measured, why three earlier attempts measured nothing,
> and the one rule that came out of it: *if it would disappear along with the
> source, do not put it in the vault.*

## What's in here

| File | Purpose |
|---|---|
| [`FINDINGS-2026-08-25.md`](FINDINGS-2026-08-25.md) | What we learned, what the numbers can and cannot show, and what to run next. |
| [`tasks.md`](tasks.md) | 10 retrieval and meaning tasks — 4 categories (cross-cutting / semantic / negative-control / meaning). Each task has a known answer for human grading. |
| [`rubric.md`](rubric.md) | How to score: correctness 0–3, tool-call count, hallucination count, subjective utility 1–5. |
| [`FINDINGS-2026-08-31.md`](FINDINGS-2026-08-31.md) | The first paired greenfield/brownfield Atlas-present versus Atlas-absent measurement and its limits. |
| [`FINDINGS-2026-08-31-change-flow.md`](FINDINGS-2026-08-31-change-flow.md) | The first end-to-end meaning → code/test → ontology update → commit → push → merge feasibility slice. |
| [`results/2026-08-31-gb-r3-summary.md`](results/2026-08-31-gb-r3-summary.md) | Raw 3-repeat lifecycle matrix summary; machine coverage only. |
| [`results/2026-08-31-change-r7-summary.md`](results/2026-08-31-change-r7-summary.md) | Four-cell change-flow result with direct Git and Atlas update receipts. |
| [`results/2026-05-template.md`](results/2026-05-template.md) | Empty matrix (task × agent × mode). Fill in after each measurement run. |

## How to measure

Two paths, depending on which agent:

- **Claude Code**: manual, see "Manual run protocol" below. (Claude Code CLI doesn't expose a non-interactive mode that's safe to script.)
- **Codex CLI**: the legacy retrieval matrix is automated via [`scripts/benchmark.mjs`](../../scripts/benchmark.mjs) — `pnpm benchmark --bypass` runs all 10 tasks × 2 modes, captures transcripts, and writes a tool-call summary table. `--with-none` adds the physically no-vault control. This self-repository matrix is diagnostic, not causal, because the repository documents itself heavily.

### Lifecycle benchmark: greenfield versus brownfield

The long-term investment question needs a different matrix from the legacy
self-repository lookup benchmark. [`scripts/benchmark-lifecycle.mjs`](../../scripts/benchmark-lifecycle.mjs)
runs the same frozen task against the same source snapshot in two arms:

| Arm | Subject contents | What it measures |
|---|---|---|
| `off` | source and product documents only; no Atlas vault, MCP, or answer key | what the agent can recover without Atlas |
| `on` | the same source plus a validated, prepared Atlas vault and read-only MCP | whether recorded meaning changes the agent's bounded handoff |

The current subjects are small internal fixture proxies: `greenfield` is a
small feature-sliced project and `brownfield` is a multi-package collaboration
project. They represent lifecycle shape, not an external customer cohort. The
runner removes `golden.json`, keeps the answer key outside the temporary
workspace, validates the treatment vault, injects MCP through a per-process
config override, requires MCP traffic in `on`, rejects MCP traffic in `off`,
and preserves a caller-supplied run id.

The fixed lifecycle tasks are intentionally about meaning rather than source
lookup:

| Subject | Task | Decision being tested |
|---|---|---|
| Greenfield | G1 orientation | assign a new request to a product responsibility and name the first implementation paths |
| Greenfield | G2 boundary | keep inventory reconciliation out of purchase confirmation and preserve the recorded reason |
| Brownfield | B1 impact | distinguish cross-package product dependencies from proven runtime impact |
| Brownfield | B2 handoff | place permission evaluation in its owning boundary and give the next verification action |

Run it as a feasibility check first, then repeat each cell three times:

```bash
pnpm benchmark:lifecycle --dry-run
pnpm benchmark:lifecycle --bypass --run-id=2026-08-31-gb-r3 --repeat=3
```

The machine-readable coverage score checks whether a final structured answer
contains the required slugs, paths, and bounded-unknown signal. It is not a
semantic quality certificate. Human review must still check factual
correctness, unsupported rationale, citation accuracy, and handoff usefulness.
Bootstrap/maintenance cost and the source-hidden field trial are separate
measurements, not hidden in this score.

### End-to-end change-flow benchmark

The lifecycle matrix above stops before an edit. [`scripts/benchmark-change-flow.mjs`](../../scripts/benchmark-change-flow.mjs)
measures the next boundary: one fixed change in a fresh repository, followed by
tests, a scoped commit, a push to a local bare remote, a clean or recovered
merge, post-merge tests, and branch cleanup. The `on` arm also updates one
existing capability through `patch_concept`, validates and compiles the vault,
and commits that meaning record with the source and tests. The `off` arm has no
Atlas vault or MCP. No external remote is contacted.

```bash
pnpm benchmark:change-flow --dry-run
pnpm benchmark:change-flow --bypass --run-id=YYYY-MM-DD-change-rN --repeat=1
```

The adopted first feasibility result is [`2026-08-31-change-r7`](results/2026-08-31-change-r7-summary.md): all four cells passed every required
workflow step. Atlas therefore showed **workflow parity**, not a proven code
quality advantage. The on arm was slower by 28.2 seconds in the greenfield
subject and 51.1 seconds in the brownfield subject, while adding the reviewed
capability update. The brownfield cells include deterministic conflict
recovery. See the [change-flow findings](FINDINGS-2026-08-31-change-flow.md)
for the protocol, failed diagnostic runs, and falsifiers.

### Codex automated run

```bash
pnpm benchmark --dry-run     # verify config without spawning codex
pnpm benchmark --bypass      # legacy 20-cell run: 10 tasks × OFF/ON
pnpm benchmark --bypass --with-none # legacy 30-cell run: NONE/OFF/ON
pnpm benchmark --bypass --on-only   # legacy ON-only 10 cells
pnpm benchmark:scale --dry-run      # verify scale benchmark config without spawning codex
pnpm perf:graph                     # in-process compile_ontology/query_ontology scale audit
pnpm perf:graph:scale               # stricter 1k + 5k graph hot-path budget
```

Why `--bypass` is required: Codex's `exec` mode default-denies all MCP tool calls, so without `--dangerously-bypass-approvals-and-sandbox` the ON column would be indistinguishable from OFF (Codex would just fall back to grep). The flag is required by-design — the script fails fast without it.

Output:
- `docs/benchmark/results/<date>-codex-<task>-<mode>.txt` — per-cell raw transcript
- `docs/benchmark/results/<date>-codex-summary.md` — auto-generated tool-call table, including NONE when requested

### Manual run protocol

This is **not automated** for Claude Code. We deliberately measure in the same agent shells real users live in, at subscription pricing — not via raw API calls — because that's the actual user economics.

### Setup

Two agent installs, both with `ontology-atlas` repo opened:

1. **Claude Code** (Anthropic) — `~/.claude/projects/<project>/<session>.jsonl` is auto-saved.
2. **Codex CLI** (OpenAI) — transcript path varies; capture by hand if needed.

For each agent, you'll run **two modes**:

- **Mode OFF**: `.mcp.json` does NOT include `ontology-atlas` (only the agent's default tools — Read / Grep / Bash / etc).
- **Mode ON**: `.mcp.json` includes `ontology-atlas-mcp` pointing at `docs/ontology/`.

Toggle by editing `.mcp.json` between runs and restarting the agent.

### Run protocol

For each task in `tasks.md`:

1. **Fresh session** — close any prior session, open a new one. (Avoids context bleed.)
2. **Paste the task prompt verbatim** — no follow-ups, no nudging. Whatever the agent answers, that's the answer.
3. **Save the transcript / screenshot** — for Claude Code, the jsonl is enough. For Codex, copy the conversation.
4. **Score** per `rubric.md`.
5. **Fill in** `results/2026-05-template.md` (rename to your run's date if needed).

### Run all four cells per task

Each of the 10 legacy tasks should be measured 4 times:

| Cell | Agent | MCP mode |
|---|---|---|
| 1 | Claude Code | OFF (Read/Grep only) |
| 2 | Claude Code | ON (ontology-atlas MCP) |
| 3 | Codex | OFF |
| 4 | Codex | ON |

10 tasks × 4 cells = **40 runs total**. Each run is ~2-5 minutes — total bench time is ~1-3 hours.

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

Results will be summarized in this README and (only with the stated limitations) in the project's main README under the long-term value section.

## Current measurement status

| Run | Vault | Agents (n) | Result file | Headline |
|---|---|---|---|---|
| 2026-08-31 change flow R7 | two internal fixture proxies | Codex, one fresh repeat per cell | [`results/2026-08-31-change-r7-summary.md`](results/2026-08-31-change-r7-summary.md) | workflow parity 4/4; Atlas update 2/2 on cells; no quality or speed claim |
| 2026-08-31 lifecycle R3 | two internal fixture proxies | Codex, 3 fresh repeats per cell | [`results/2026-08-31-gb-r3-summary.md`](results/2026-08-31-gb-r3-summary.md) | required-evidence coverage: greenfield `0.25 → 0.875`; brownfield `0.2834 → 0.7389`; arm integrity 24/24; pilot evidence only |
| R13/R14 legacy retrieval | self-documented Atlas repository | Claude Code + Codex historical runs | `results/2026-05-04-claude-code.md` · `results/2026-05-04-codex.md` | useful for retrieval diagnostics, not causal Atlas value; see [`FINDINGS-2026-08-25.md`](FINDINGS-2026-08-25.md) |

The lifecycle result is deliberately not described as a product win. Atlas was
slower in this pilot (median +17.2 seconds in greenfield and +33.2 seconds in
brownfield), so the present signal is about bounded meaning coverage, not
latency or token savings. The brownfield impact task was a median tie and is a
named improvement target.

### Re-measurement triggers (user runs these manually)

```bash
# Legacy Codex 20-cell automated re-measurement (full bypass)
pnpm benchmark --bypass

# Legacy no-vault control included
pnpm benchmark --bypass --with-none

# Lifecycle 2×2: one feasibility pilot
pnpm benchmark:lifecycle --bypass --run-id=YYYY-MM-DD-gb-pilot --repeat=1

# Lifecycle decision-grade repeat
pnpm benchmark:lifecycle --bypass --run-id=YYYY-MM-DD-gb-r3 --repeat=3

# End-to-end change flow: one greenfield + one brownfield, Atlas off/on
pnpm benchmark:change-flow --bypass --run-id=YYYY-MM-DD-change-rN --repeat=1

# Legacy Codex ON-only 10 cells (faster)
pnpm benchmark --bypass --on-only

# Claude Code self-measurement is manual — open a new session and walk
# the 10 prompts in tasks.md, recording transcripts into a new
# results/<date>-claude-code.md.
```

Aim: when the vault grows another ~25 nodes (≈50 total), re-measure to test whether the MCP advantage **scales** (graph reasoning gain widens) or **saturates** (raw grep also works fine at 50 nodes).

### Graph engine scale audit

`pnpm perf:graph` measures the compiler and graph query engine directly,
without Codex/Claude startup time, MCP JSON-RPC transport, or file-system walk
noise. It reports `compile_ontology` full/indexed/summary timings plus
`agent_brief`, `workspace_brief`, `health`, `query_plan`, `node_profile`, `path`,
`all_paths`, `pattern_walk`, `schema`, `relation_check`, `blast_radius`,
`domain_matrix`, `centrality`, `match_nodes`, `match_edges`, and `project_map`
timings against generated vaults. It also measures the full 10-call
`graph_db_pack` sequence used by `/ontology/insights`: node scan plan/run, edge
scan plan/run, domain coupling, centrality plan/run, path plan/run, and
`explain_relation`. The query set mirrors the Agent query recipes shown in
`/ontology/insights`, so the UI handoff path and the scale audit stay aligned.
`pnpm perf:graph:check` runs each hot path three times on a 1k-node synthetic
graph, reports the median, and fails if compile or query latency exceeds the
configured budget. `pnpm perf:graph:scale` keeps the fast package gate separate
but adds the same median check at 1k and 5k nodes with a larger scale budget. Use
`pnpm perf:graph -- --runs=5 --sizes=1000,5000,10000` when a larger vault needs a
less noisy local measurement.
Use this before introducing a native helper such as Go: a native path is
justified only after this script shows the JavaScript graph hot path, not the
agent process or file-system layer, is the measured bottleneck.
