# Rubric — how to score each run

> Score each agent × mode × task cell (40 cells total for the 10 legacy tasks
> in a full Claude Code + Codex measurement run). The lifecycle runner has its
> own 8-cell-per-repeat matrix and reports machine coverage separately.
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

## Lifecycle matrix scoring

The greenfield/brownfield runner records two separate results. **Required
coverage** is a deterministic diagnostic over the final structured answer: it
checks the fixed task's required slugs, paths, and bounded-unknown signal.
**Content pass** requires full coverage and no forbidden item, while **usable
cell** means the process and arm-integrity checks passed. Neither is a human
semantic verdict.

For the lifecycle matrix, read each final answer against the source and the
prepared vault and give it four scores plus one count. Build the packet with
`pnpm benchmark:blind-set --run-id=<run>` so the answers arrive with ids instead
of side labels, in a shuffled order.

**Every score below is out of the maximum shown.** A number without its scale is
not a result — write `2.8 / 3`, never `2.8`.

These maxima belong to the lifecycle matrix. The `D-a` and `D-b` axes further
down belong to the older D tasks and use different ones; do not mix the two sets
in a single table.

#### 1. Correctness — 0 to 3

Does the answer get the question right? Use the four levels in
[§ Correctness](#1-correctness-03--primary-score) below; they are the same ones
the legacy tasks use.

#### 2. Citations — 0 to 2

| Score | Meaning |
|---:|---|
| **2** | Every path and concept it cites exists, and each one supports the claim attached to it. |
| **1** | Everything it cites exists, but at least one citation does not support the claim made from it. |
| **0** | It cites a path or a concept that does not exist. |

#### 3. Boundary — 0 to 2

| Score | Meaning |
|---:|---|
| **2** | Names the responsibility that owns the work **and** what is outside it. |
| **1** | Names the owner correctly but never says what is excluded. |
| **0** | Puts the work in the wrong place, or states an exclusion that is not true. |

#### 4. Next step — 0 to 2

Ask one question: could a second agent act on this without coming back?

| Score | Meaning |
|---:|---|
| **2** | Names a specific next action against specific files, or a specific decision that has to be made first. |
| **1** | Actionable but generic, or it restates the answer instead of moving past it. |
| **0** | No usable next step. |

#### 5. Unsupported claims — a count, never a score

How many statements the source and the vault do not support. Report the count.
Never average it into a total and never subtract it from another axis: one
invented claim is a specific defect worth naming, not a fraction of a point.

Also record any control leak, MCP setup failure, or source/key contamination.
Those invalidate a cell rather than scoring it.

Do not turn MCP calls, tokens, or elapsed time into a quality score. They remain
diagnostics, and construction/maintenance cost is a separate long-term ROI
measurement.

## End-to-end change-flow scoring

The change-flow runner has a different unit of analysis: a fixed change in a
fresh Git repository. A workflow pass is conjunctive and requires all of these
receipts:

- exact changed-file allowlist;
- focused test before merge and the same test after merge;
- conventional feature commit;
- on-arm exact capability update through `patch_concept`, followed by
  `validate_vault` and `compile_ontology`;
- local bare-remote push;
- clean merge or explicit deterministic conflict recovery;
- deletion of the local and remote feature branch, with a clean worktree.

The `on` arm's extra Atlas Markdown file is intentional: the question is
whether meaning survives the code-change handoff as a reviewed record. Git
push, merge, and branch cleanup are ordinary workflow evidence, not proof that
Atlas owns Git integration. A passing workflow only establishes that the
bounded process completed; it does not establish better code quality or user
value. Those require blind human grading, unfamiliar repositories, and
construction/maintenance-cost accounting.

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
