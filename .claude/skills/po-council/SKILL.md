---
name: po-council
description: Review a hard-to-reverse Atlas product decision with Evidence plus one risk-specific independent specialist, then record the decision delta.
---

# Atlas PO review — two critics, one accountable owner

The active pilot does not summon a standing committee. `pnpm po:route` selects
Evidence plus exactly one specialist for the primary Atlas risk. The human owner
decides.

## Reviewer map

| Primary risk | Required reviewers | Independent question |
|---|---|---|
| `meaning` | `po-evidence` + `po-steward` | Is the failure real, and do durable meaning, evidence truth, local-first behavior, agent authority, or human approval stay trustworthy? |
| `positioning` | `po-evidence` + `po-wedge` | Is the problem evidenced, and is the first-contact claim both distinctive and earned? |
| `scope` | `po-evidence` + `po-leverage` | Is the problem evidenced, and is this the smallest worthwhile commitment with a credible rollback? |

`po-craft` is owner-requested proof review only. It consumes evidence from the
design, responsive, motion, and walkthrough gates; it does not repeat those
checks.

Seat briefs live at `../../agents/po-*.md`. Open only the selected files.
From either mirrored skill tree the relative path resolves to the matching agent
tree. Never create a third copy.

If parallel reviewers are available, run the selected pair together. If not,
run them sequentially, give neither the other's output, and record that first-
position independence was weakened.

## Required use

Use this review only when `pnpm po:route` returns `review`, or when the owner
explicitly requests independent review. Typical one-way doors are:

- public MCP/CLI/vault contracts and human approval or source-of-truth changes;
- product direction, category, positioning, first-contact words, and first
  releases;
- added or removed user-facing surfaces and substantial, difficult-to-undo
  commitments.

Mechanical and ordinary reversible work never receives a council. Unknown
evidence does not gain certainty from more seats; reviewers must prescribe the
cheapest learning path.

## Round 0 — prior decision and before-state

Read only the relevant record in `docs/DECISIONS.md`. Cite it or explicitly
overturn it and check its falsifier.

Before reviewers answer, record:

- the requester's literal words;
- the accountable owner's intended decision and scope;
- evidence state and confidence;
- door and primary Atlas risk;
- exact primary artifacts.

Without the intended before-state, do not claim that review caused a better
decision.

## Round 1 — independent positions

Give both reviewers the same brief:

```text
[Decision] the requester's literal words
[Pre-review decision] exact intended verdict and slice
[Route] evidence state, confidence, door, primary Atlas risk, sovereignty scan
[Evidence paths] exact files, routes, documents, runtime artifacts, and prior record
[Artifact to open] URL, command, and vault path
[Output] the selected seat brief's exact format; at most one bounded query
```

Reviewers open primary evidence rather than judging a summary. Each states:

- evidence state and confidence with a basis;
- the smallest decision it recommends;
- the material contribution it expects to make;
- the strongest argument against its own recommendation;
- a falsifier or next learning action.

## Round 2 — only for material conflict

Skip rebuttal when both reviewers agree and neither has a fact-changing query.
Record zero rebuttal turns.

When their recommendations materially conflict, send each only the other
verdict block and run one rebuttal. Each must restate the opposition fairly,
concede or refute it, and name a newly learned fact before changing position.

One round maximum. Rebuttal without disagreement is convergence theatre.

## Accountable decision

The caller, not the reviewers, decides.

- Choose one proposal or something smaller, never a union.
- The human owner remains able to accept, overturn, and sign.
- Record the exact difference from the pre-review decision. `unchanged` is
  valid data.
- Record the strongest losing argument, falsifier, revisit condition, and review
  footprint.
- Append significant decisions to `docs/DECISIONS.md`; append one pilot row to
  `docs/PO-PILOT.md`.

## Owner-facing output

Keep the whole explanation plain, beginning with:

```md
### First — three lines

- **What we decided**: one sentence
- **What differs from your request**: every narrowed or widened part, or none
- **What you need to do**: usually nothing
```

Internal route vocabulary belongs in the record. If the owner has to ask what
the summary means, rewrite it instead of stacking another explanation.

## Significant record

```md
## YYYY-MM-DD — <decision>

**Pre-review decision**: …
**Evidence state**: observed / inferred / unknown
**Door**: one-way
**Primary Atlas risk**: meaning / positioning / scope
**Confidence**: high / medium / low — <basis>
**Accountable owner**: <person who accepts or overturns the review>
**Decision**: …
**Decision delta**: unchanged / stopped / narrowed / redirected / evidence-bounded / verification-strengthened — <why and which reviewer contributed it>
**Review footprint**: <reviewers, first-position turns, rebuttal turns>
**Dissent and falsifier**: …
**Revisit**: …
**Outcome**: pending / <later observed result>
```

## Failure shields

- The sovereignty scan cannot be self-exempted.
- A one-way decision names one primary risk.
- The default review has exactly two independently useful viewpoints.
- A blocker prescribes a smaller decision or learning action.
- Rebuttal happens only for material disagreement.
- The accountable result is not a vote or union.
- The before-state and decision delta are both present.
- Routine work stays out of the append-only ledger.
