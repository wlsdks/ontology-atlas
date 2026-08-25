# Rubric — how to score each run

> Score each agent × mode × task cell (28 cells total per measurement run).
> Be strict. If you find yourself wanting to round up because the agent
> "almost" got it, write the gap in the **Notes** column instead of inflating.

## What this measures, and what it does not

> **Saving tokens is not a goal of this project** (owner, 2026-08-25):
>
> > *"I care about whether we build accurately and whether the meaning of the
> > business gets clearer. This is not a memory-saving project, and optimising
> > tokens is not something I intend to do."*
>
> So cost decides nothing here. Tool calls and tokens are printed by the harness
> as diagnostics, the way a stack trace is a diagnostic, and a cell is never won
> or lost on them. An answer that costs more and lands the change in the right
> place has simply won.
>
> This was written down after a measured mistake on 2026-08-25: B1 was called a
> failure because the agent used 47 shell calls and 2 MCP calls. Reading the
> answer showed it had named the boundary and its reasons correctly. Counting
> tools had produced a verdict opposite to the truth.
>
> The A and C tasks measure retrieval. The **D tasks measure meaning**, and only
> the D axes below can tell whether this product does what it claims.

## The four axes

### 1. Correctness (0–3) — primary score

| Score | Meaning |
|---|---|
| **3** | Fully correct. Every item the prompt asked for is present and accurate; no false claims. |
| **2** | Mostly correct. The main answer is right; minor omissions OR one borderline-wrong sub-item. |
| **1** | Partially correct. The answer addresses the question but is missing material content OR contains a confidently wrong statement. |
| **0** | Wrong, evasive, or refuses. Includes "I'd need more context" non-answers. |

**Verify against the actual repo state at measurement time** — don't grade from memory. Open the file / run `pnpm dogfood:walk` if needed.

### 2. Tool-call count and tokens (diagnostic, never a score)

Recorded, never scored. They are useful for one thing only: reading *how* an agent
reached its answer, the same way you would read a stack trace. A cell is decided by
the axes above and below this one.

`scripts/benchmark.mjs` captures both. If you do look at them, read the median
across runs and never a single cell: on 2026-08-25 a single-shot C2 read 10,534
tokens in one mode and 49,196 in the other, for two identical shell commands.

For Claude Code: visible in the conversation as tool-use blocks.
For Codex: count the tool invocations shown in the CLI output.

**Don't penalize MCP-off** for using more Read/Grep calls — that's the cost of not having the graph. The point is to make that cost visible.

### 3. Hallucinations (count)

Count of confidently asserted items that don't exist in the repo.

Examples:
- "The validator detects `parse-fail-soft`" → no such code exists. **+1**
- "It's defined in `src/shared/lib/foo.ts`" but that file doesn't exist. **+1**
- "The `findOrphans` function returns…" but it's actually `find_orphans`. **0** — name typo, not invented behavior.

If unsure whether something's hallucinated, search for it. The cost of a wrong "+1" or "+0" is small; the cost of letting confident fabrication go uncounted is large.

### D-only axes — the ones that decide a meaning cell

Score these **only for D tasks**. They exist because a D answer can be fluent,
plausible, and wrong in a way the correctness axis does not catch.

#### D-a. Boundary fidelity (0–3)

| Score | Meaning |
|---|---|
| **3** | Named the documented boundary, stated which side the request falls on, and stopped there. |
| **2** | Found the boundary but hedged about whether it applies. |
| **1** | Described the area correctly without noticing that a boundary governs it. |
| **0** | Crossed a documented exclusion without noticing, or asserted the opposite of what the vault says. |

A D1 answer that agrees symbol search belongs in `capabilities/mcp-server` scores
**0** regardless of how well written it is: `## Inclusions / Exclusions` excludes
an AST/source search engine in as many words.

#### D-b. Provenance (0–2)

| Score | Meaning |
|---|---|
| **2** | Cited the node slug **and** the section the claim came from, so a human can open it and disagree. |
| **1** | Cited a node but not where inside it. |
| **0** | Asserted the reason with no citation. Indistinguishable from a guess. |

#### D-c. Invented rationale (count)

Count reasons the answer gives that appear **neither in the vault nor in the
source**. This is different from axis 3: the fact can be real while the *why* is
fabricated, and a confident fabricated *why* is the most expensive failure this
product can have, because it is the one a reader is least able to check.

A D answer with any invented rationale cannot score above **1** on correctness,
whatever else it got right.

### 4. Subjective utility (1–5) — last, optional

Strictly the human grader's gut feel: "if I'd asked this in real work, would this answer have moved me forward?"

| Score | Meaning |
|---|---|
| **5** | Yes, immediately actionable. |
| **4** | Yes, with one small follow-up. |
| **3** | Mixed — useful but I'd verify before acting. |
| **2** | Confusing or so verbose I'd ignore most of it. |
| **1** | Worse than no answer (misleading or distracting). |

This axis is noisy by design — it captures the texture (terseness, citation, framing) that the other axes miss.

---

## What the data should show

### If the ontology helps (positive result)

- **Cat A**: MCP-on correctness > MCP-off by ≥1 point on average. Tool calls fewer. Hallucinations lower.
- **Cat B**: MCP-on correctness ≥ MCP-off (small but positive delta).
- **Cat C**: Roughly neutral. MCP-on shouldn't be worse here.

### If the ontology doesn't help (null result)

- **Cat A**: MCP-on and MCP-off score the same on correctness. Tool calls maybe lower with MCP-on (efficiency win) but no quality difference.
- This means the AI agent already extracts equivalent structure from raw markdown — the curated graph isn't earning its keep.

### If the ontology hurts (negative result)

- **Cat C**: MCP-on under-performs. Agent over-relies on ontology tools when raw file-read would be faster and more accurate.
- **Cat A hallucinations** climb because the agent invents slugs based on the schema rather than checking.

Each outcome has a clear next action. That's why we're running the bench.

---

## A note on ties

When MCP-on and MCP-off score identically on correctness, **tie-break on tool-call efficiency**. If a Cat A task is solved in 1 tool call (MCP-on `find_backlinks`) vs 12 (MCP-off recursive grep), that's still a meaningful win for the agent's working economy — sub agents, latency, context budget — even if the final answer is identical.
