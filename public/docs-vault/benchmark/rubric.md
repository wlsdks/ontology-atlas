# Rubric — how to score each run

> Score each agent × mode × task cell (28 cells total per measurement run).
> Be strict. If you find yourself wanting to round up because the agent
> "almost" got it, write the gap in the **Notes** column instead of inflating.

## The four axes

### 1. Correctness (0–3) — primary score

| Score | Meaning |
|---|---|
| **3** | Fully correct. Every item the prompt asked for is present and accurate; no false claims. |
| **2** | Mostly correct. The main answer is right; minor omissions OR one borderline-wrong sub-item. |
| **1** | Partially correct. The answer addresses the question but is missing material content OR contains a confidently wrong statement. |
| **0** | Wrong, evasive, or refuses. Includes "I'd need more context" non-answers. |

**Verify against the actual repo state at measurement time** — don't grade from memory. Open the file / run `pnpm dogfood:walk` if needed.

### 2. Tool-call count

Just count. Lower-with-correctness is better. A score-3 answer in 2 tool calls beats a score-3 answer in 15.

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
