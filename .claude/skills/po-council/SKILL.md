---
name: po-council
description: Review a hard-to-reverse Atlas product decision with Evidence plus one risk specialist, testing whether it restores a named human ability.
---

# Atlas PO review — two critics, one accountable owner

The active pilot does not summon a standing committee. `pnpm po:route` derives
the primary risk from change facts and all four boundary assessments, then selects Evidence plus
exactly one specialist. The human owner decides.

## Reviewer map

| Derived risk | Required reviewers | Independent question |
|---|---|---|
| `meaning` | `po-evidence` + `po-steward` | Is the lost human ability observed, and do meaning, evidence truth, local-first behavior, agent authority, and correction stay trustworthy? |
| `positioning` | `po-evidence` + `po-wedge` | Is the lost ability observed, and is the first-contact claim distinctive and earned? |
| `scope` | `po-evidence` + `po-leverage` | Is the lost ability observed, and is this the smallest worthwhile commitment with a credible rollback? |

`po-craft` is owner-requested recovery-proof review only. It consumes evidence
from the design, responsive, motion, and walkthrough gates; it does not repeat
them.

Seat briefs live at `../../agents/po-*.md`. Open only the selected files. From
either mirrored skill tree, the relative path resolves to the matching agent
tree. Never create a third copy.

If parallel reviewers are available, run the selected pair together. If not,
run them sequentially, give neither the other's output, and record that
first-position independence was weakened.

## Required use

Use this review only when `pnpm po:route` returns `review`, or when the owner
explicitly requests independent review. Mechanical and ordinary reversible work
do not receive a council. Unknown evidence does not gain certainty from more
seats; reviewers prescribe the cheapest learning path.

## Round 0 — prior decision and before-state

Read only the relevant record in `docs/DECISIONS.md`. Cite it or explicitly
overturn it and check its falsifier.

Before reviewers answer, record:

- the requester's literal words;
- the accountable owner's intended decision and smallest slice;
- the one Atlas outcome and human failure moment;
- evidence state and confidence;
- every change signal and all four boundary assessments plus the computed route reasons;
- the exact recovery proof and primary artifacts.

Without the intended before-state, do not claim review-caused improvement.

## Round 1 — independent positions

Give both reviewers the same brief:

```text
[Decision] the requester's literal words
[Pre-review decision] exact intended verdict and slice
[Human recovery] actor, moment, Atlas outcome, and recovery proof
[Route] evidence, confidence, change signals, boundaries, derived door/risk/reasons
[Evidence paths] exact files, routes, documents, runtime artifacts, and prior record
[Artifact to open] URL, command, and vault path
[Output] the selected seat brief's exact format; at most one bounded query
```

Reviewers open primary evidence rather than judging a summary. Each states:

- evidence state and confidence with a basis;
- whether the recovery proof tests Atlas or merely implementation;
- the smallest decision it recommends;
- the unique material contribution it expects to make;
- the strongest argument against its own recommendation;
- a falsifier or next learning action.

## Round 2 — only for material conflict

Skip rebuttal when both reviewers agree and neither has a fact-changing query.
Record zero rebuttal turns.

When recommendations materially conflict, send each only the other verdict block
and run one rebuttal. Each must restate the opposition fairly, concede or refute
it, and name a newly learned fact before changing position.

One round maximum. Rebuttal without disagreement is convergence theatre.

## Accountable decision

The caller, not the reviewers, decides.

- Choose one proposal or something smaller, never a union.
- The human owner remains able to accept, overturn, and sign.
- Record the difference from the pre-review decision. `unchanged` is valid and
  reviewers must not manufacture a delta for the pilot.
- Record the strongest losing argument, falsifier, revisit condition, review
  footprint, independence limits, and unique contributor.
- Append significant decisions to `docs/DECISIONS.md`; append one typed run and
  outcome row to `docs/PO-PILOT.md`.

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
**Atlas outcome**: orient / explain / judge / correct / handoff — …
**Evidence state**: observed / inferred / unknown
**Change signals**: …
**Computed route**: one-way — <risk, reviewers, and reasons>
**Primary Atlas risk**: meaning / positioning / scope
**Confidence**: high / medium / low — <basis>
**Accountable owner**: <person who accepts or overturns the review>
**Recovery proof**: Given …; fail when …
**Decision**: …
**Decision delta**: unchanged / stopped / narrowed / redirected / evidence-bounded / verification-strengthened — <why and contributor>
**Review footprint**: <reviewers, first-position turns, rebuttal turns, independence limits>
**Dissent and falsifier**: …
**Revisit**: …
**Outcome**: pending / <later observed result>
```

## Failure shields

- The builder supplies facts; the router derives door and risk.
- Every non-mechanical decision restores exactly one primary Atlas outcome.
- An affected or unknown boundary always routes to meaning review; omission is invalid.
- The default review has exactly two independently useful viewpoints.
- A blocker returns a smaller decision or learning action.
- Rebuttal occurs only for material disagreement.
- The result is not a vote or union.
- Before-state, recovery proof, and decision delta remain visible.
- `pnpm po:pilot -- --check` forces an evidence-backed sunset.
