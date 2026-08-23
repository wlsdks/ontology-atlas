---
name: po-pass
description: Run the solo product-owner gate before product, UX, graph, MCP, CLI, workflow, or macOS-shell work. Separate phenomenon from problem, score all six rubric rows, and escalate mechanically.
---

# PO pass — the daily path

Most work uses one solo pass, not the five-seat council. The 2026-07-27 failure
happened here: a pass wrote “none” into two rows the rubric makes fatal, approved
itself, and shipped. A council nobody convenes cannot repair a broken daily path.

## 0. Read prior decisions

Search `docs/DECISIONS.md` for the same surface and question.

- Cite a standing decision or explicitly overturn it.
- Check whether its falsifier has been observed. If so, the losing argument won
  and the new pass starts there.

## 1. Separate phenomenon from problem

The order is observed phenomenon → user problem → success condition → solution →
implementation. A phenomenon rewritten in user language is not yet a problem.

Apply all three tests:

1. **Difference:** remove the phenomenon. Does the statement still identify who,
   at what moment, loses a decision, understanding, trust, or handoff?
2. **Second observation:** if the problem is real, what else would be visible—an
   exit, retry, question, agent failure, or support request? This is also the
   falsifier.
3. **Solution independence:** would the problem remain true under another
   solution? Proposed module, library, or pattern names do not belong in it.

Any failure caps Problem insight at 2; rewrite before scoring.

## 2. Fill the canonical pass

Use the “Fast PO Pass” template in
`docs/PRODUCT-OWNER-OPERATING-SYSTEM.md`. Include at least: observed phenomenon,
user problem, audience and moment, current alternative, ontology value, agent
value, simplification, and verification.

## 3. Score all six rows from their anchors

Quote the rubric's 0/2/4 anchors before scoring; do not score from memory.

| Row | Council owner if escalated |
|---|---|
| Problem insight, User moment | `po-evidence` |
| Differentiation | `po-wedge` |
| Ontology value, Agent value | `po-steward` |
| Verification | `po-craft` |

“Not applicable” scores zero; it is not a self-granted exemption. In particular,
only the steward can judge an ontology/agent exemption, which requires convening
the council.

## 4. Declare escalation

The PO Council is required when any condition holds:

- total below 18/24;
- zero in Problem insight, Ontology value, Agent value, or Verification;
- a user-facing route is added or removed;
- a public MCP signature, CLI command, or vault schema changes;
- product direction, positioning, or a stranger's first words change;
- a first public release or another one-shot first impression;
- the owner asks for it.

Do not convene for mechanical work such as typos, dependency bumps, CI plumbing,
test fixtures, or lint configuration.

## 5. Decide and record

Choose one verdict: `Do not build`, `Investigate first`, `Shape a slice`, or
`Build and verify`.

Required-escalation work receives a new `docs/DECISIONS.md` record. Route,
public-contract, and design-spec triggers are mechanically enforced by
`pnpm decisions:check`.

## Output

```md
## PO pass — <change>

**Prior decision**: <record, standing/overturned, falsifier observed or not>
**Observed phenomenon**: …
**User problem**: …
**Phenomenon/problem tests**: difference pass/fail · second observation: … · solution independence pass/fail
**Audience and moment**: …
**Current alternative**: …
**Ontology value**: …
**Agent value**: …
**Simplification**: …
**Verification**: …
**Score**: Problem insight N · User moment N · Differentiation N · Ontology value N · Agent value N · Verification N = N/24 (fatal zeros: none / row)
**Escalation**: not required / required because …
**Verdict**: Do not build / Investigate first / Shape a slice / Build and verify
```
