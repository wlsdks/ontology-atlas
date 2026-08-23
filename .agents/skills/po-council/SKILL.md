---
name: po-council
description: Run five independent product-owner seats, one rebuttal round, and one accountable decision with dissent and a falsifier for expensive or hard-to-reverse work.
---

# PO Council — five reviewers, one accountable decision

The PO OS defined thirteen lenses and a 24-point rubric, but prose alone did not
run. In 2026-07-27 a pass wrote “none” into fatal rows and shipped. This skill
turns those lenses into callable, independently accountable reviewers.

## Roster and ownership

| Agent | Lenses | Signed rubric rows |
|---|---|---|
| `po-evidence` | Customer-Problem Editor · Discovery Lead · Outcome Guard | Problem insight · User moment |
| `po-craft` | Craft Steward · Experience Mapper | Verification |
| `po-steward` | Ontology Steward · Local-First Guardian | Ontology value · Agent value |
| `po-wedge` | Monopoly Strategist · DHM Strategist · First-Principles Skeptic | Differentiation |
| `po-leverage` | Prioritization Analyst · Shaper | appetite and slice, no score |

The thirteenth lens, **Accountable Value Owner**, is the human owner. The council
stress-tests; it does not vote or decide.

Seat briefs live at `../../agents/po-*.md`. From either mirrored skill tree this
relative path resolves to the matching agent tree. Open those files explicitly.
Never create a third copy.

If parallel subagents are available, launch all five in one batch so Round 1 has
no cross-talk. Otherwise run sequentially and state that Round 1 independence was
lost. Branch on capability, never on a tool brand.

## Required use

Convene for:

- a route or user-facing surface added or removed;
- a public MCP, CLI, or vault-schema contract change;
- product direction, positioning, or words a stranger reads first;
- a first public release or another one-shot reputation decision;
- a solo pass below 18/24 or with a fatal zero;
- an explicit owner request.

Never convene for typos, dependency bumps, CI plumbing, test fixtures, or lint
configuration.

## Round 0 — prior decisions

Before convening, read `docs/DECISIONS.md` for the same surface and question.
Cite a standing record or explicitly overturn it, and check whether its falsifier
has already been observed.

## Round 1 — independent positions

Give every seat the same literal brief:

```text
[Decision] the requester's words, not a pre-translated problem
[Evidence paths] exact files, routes, and documents
[Existing pass] verbatim, or none
[Artifact to open] URL, command, and vault path
[Output] the seat brief's exact format; at most one query
```

All seats may perform read-only research and must open primary evidence rather
than judge a summary or diff.

## Round 2 — one rebuttal

Resume the same seat. Send only the other four verdict blocks, in a different
order for each seat, plus any routed query.

Each seat must:

1. restate the strongest opposition without weakening it;
2. concede or refute it;
3. change its verdict only when it names a newly learned fact;
4. create the strongest argument against its own position;
5. name one point another seat got right.

One round only. More rounds produce convergence theatre.

## Bounded cross-council query

A seat may ask at most one question:

```md
**Query → <other seat>**
**Question**: one answerable sentence
**Decision at stake**: what changes with the answer
**Assumption if unanswered**: what the caller will assume
```

If the other council is already running, route the query through Round 2. If not,
call only the named seat. One answer, no follow-up loop.

## Round 3 — accountable decision

The caller, not the council, decides.

- Choose one proposal or something smaller, never a union of opinions.
- When lenses disagree, choose the smallest slice that improves the
  ontology-to-agent workflow.
- Record the strongest losing argument, its falsifier, and revisit condition.
- Append the result to `docs/DECISIONS.md`; never rewrite a prior record.

## Output to the human owner

Internal vocabulary belongs in the ledger, not the conversation. The entire
owner-facing answer stays plain:

```md
### First — three lines

- **What we decided**: one sentence
- **What differs from your request**: every narrowed or widened part, or none
- **What you need to do**: usually nothing
```

The verdict block does not belong in the conversation. The plain-language rule
applies to the entire answer, not only the opening. A clarification request such
as “what does that mean?” is a failure signal: rewrite from the beginning instead
of stacking another summary on top. “What differs from your request” cannot be
omitted; silent narrowing is silent disregard.

## Ledger block

```md
## PO Council Verdict — <decision>

**Convened because**: …

| PO | Verdict | Owned score |
|---|---|---|
| Evidence | … | Problem insight N · User moment N |
| Craft | … | Verification N |
| Steward | … | Ontology value N · Agent value N |
| Wedge | … | Differentiation N |
| Leverage | … | appetite and slice |

**Rubric total**: N/24 (fatal zeros: none / row)
**Decisive disagreement**: …
**Decision (accountable: <human>)**: …
**Recorded dissent**: … — **falsifier**: … — **revisit**: …
**Slice**: IN … · OUT … · appetite …
```

## Failure shields

- Every rubric row has exactly one signer.
- Round 1 positions are independent.
- A blocker always names an alternative.
- The accountable result is never the union of proposals.
- There is exactly one rebuttal round.
- Mechanical work never becomes process theatre.
