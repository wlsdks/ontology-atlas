---
name: po-council
description: Run the Atlas PO Council — five standing product owners (po-evidence · po-craft · po-steward · po-wedge · po-leverage) independently judge a product decision, then rebut each other, then one accountable decision is recorded with the dissent preserved. Use before expensive or hard-to-reverse product work — a new or removed surface/route, a public MCP/CLI contract change, direction/positioning/marketing copy, a first public release — or whenever a solo PO pass scores under 18/24 on the PO Quality Rubric. Skip for mechanical work (typos, dependency bumps, CI plumbing, test fixtures) — those are exempt from the PO gate entirely.
---

# /po-council — five product owners, one accountable decision

## Why this exists

`docs/PRODUCT-OWNER-OPERATING-SYSTEM.md` has always specified a 13-lens PO
Council, a 0–24 quality rubric with an 18+ threshold, and a five-level Chief PO
ladder. **None of it was ever enacted.** On 2026-07-27 a PO pass in this repo
wrote "없음" in the two rubric rows the document declares fatal (Ontology value,
Agent value), returned `Build and verify` anyway, and shipped. Nothing stopped
it, because the lenses were prose and prose does not run.

This skill is the enactment. The thirteen lenses are not discarded — they are
distributed across five agents that can actually be called, disagree, and sign
their scores.

> The repo's own recurring lesson: **문서에만 있는 규격은 지켜지지 않는다.**
> A council that cannot be invoked is a council that does not exist.

## The five, and what each one owns

| Agent | 이름 | PO OS lenses carried | Rubric row they sign |
|---|---|---|---|
| `po-evidence` | 근거 | Customer-Problem Editor · Discovery Lead · Outcome Guard | Problem insight · User moment |
| `po-craft` | 결 | Craft Steward · Experience Mapper | Verification |
| `po-steward` | 지킴이 | Ontology Steward · Local-First Guardian | Ontology value · Agent value |
| `po-wedge` | 해자 | Monopoly Strategist · DHM Strategist · First-Principles Skeptic | Differentiation |
| `po-leverage` | 지렛대 | Prioritization Analyst · Shaper | (appetite + slice boundary) |

The thirteenth lens — **Accountable Value Owner** — is deliberately not an
agent. It is the human owner, or the agent doing the work on their behalf. The
council does not vote and does not own the decision; it stress-tests it. One
person decides and signs.

**Every rubric row has exactly one owner.** That is the whole point: a row can
no longer be self-certified past by the person who wants to build.

## When the council runs

**Required** when the decision is expensive or hard to reverse:

- a new user-facing surface/route, or removing one
- a public contract change — MCP tool signatures, CLI commands, vault schema
- product direction, positioning, or the words a stranger reads first
- a first public release, or anything that spends a one-shot reputational resource
- a solo PO pass that scores **under 18/24**, or has a **0** in problem insight,
  ontology value, agent value, or verification
- the owner asks for it

**Not required** for ordinary product work — write the solo PO pass, self-score,
and proceed if it clears 18+ with no fatal zero.

**Never** for mechanical work: typos, dependency bumps, CI plumbing, test
fixtures, lint config. These are already exempt from the PO gate; convening a
council on them is the process theater the PO OS warns about.

## Protocol

### Round 1 — independent positions (parallel, no cross-talk)

Launch all five agents **in one message** so they run concurrently and cannot
anchor on each other. Give every agent the same brief:

- the decision, stated as the requester stated it (do not pre-translate it —
  translating a solution-shaped request into a problem is `po-wedge`'s job)
- the repo paths that ground it
- any prior PO pass being critiqued, quoted verbatim
- explicit permission to research the web and to run read-only commands

Each returns its own structured verdict and its own rubric scores.

### Round 2 — rebuttal (one round, no more)

Send every agent the other four positions. Each must:

1. restate the **strongest** opposing argument in its own words — a weak
   restatement is a foul,
2. concede or refute it,
3. and **change its verdict if it conceded.** A verdict that never moves is an
   alibi, not a review.

One round only. A second round produces convergence theater, not new
information.

### Round 3 — the accountable decision

The caller (not the council) records the decision. Rules:

- **Never average the opinions into a bigger feature.** This is already the PO
  OS's rule and it is the most common failure mode of committees. The decision
  must be one of the proposed options **or something smaller** — never the
  union of them.
- **When the lenses disagree, choose the smallest slice that best improves the
  ontology-to-agent workflow.**
- **Record the dissent with a falsifier.** The strongest losing argument is
  written down along with what we would observe if it turns out to be right.
  This is what makes the council worth more than a checklist: a dated,
  falsifiable disagreement you can return to.

## Output — the Council Verdict block

Paste this into the PR body, the plan, or the working update:

```md
## PO Council Verdict — <decision>

**Convened because**: <trigger from the required list>

| PO | 판정 | 소유 행 점수 |
|---|---|---|
| 근거 | … | Problem insight N · User moment N |
| 결 | … | Verification N |
| 지킴이 | … | Ontology value N · Agent value N |
| 해자 | … | Differentiation N |
| 지렛대 | … | appetite: … |

**Rubric total**: N/24 (threshold 18, fatal zeros: none / <row>)

**The decisive disagreement**: <where they actually split, in one paragraph.
Not a summary of all five — the one fork the decision turns on.>

**Decision (accountable: <name>)**: <one of the proposals, or smaller>

**Recorded dissent**: <strongest losing argument> — **falsifier**: <what we
would observe if the dissenter was right> — **revisit**: <date or trigger>

**Slice**: IN … · OUT … · appetite …
```

## Failure modes this protocol is designed to prevent

| Failure | Guard |
|---|---|
| Self-certifying past a fatal rubric zero | The row has a named owner who signs it |
| Five agents agreeing because they saw each other first | Round 1 runs in parallel with no cross-talk |
| Committee compromise producing a bigger feature | Decision must be one proposal or smaller, never a union |
| A "review" where nobody's mind changes | Rebuttal requires conceding to change the verdict |
| Blockers with no path forward | Every agent is required to name what to do instead |
| Convergence theater | Exactly one rebuttal round |
| Council convened on trivia | Explicit "never" list; mechanical work stays exempt |

## Notes for the caller

- **Isolate them if they will touch the working tree.** These agents are
  read-only by tool grant, but concurrent agents share the working directory —
  a `git checkout` from one of them will move everyone. Prefer worktree
  isolation when running the council alongside active edits.
- **Give them the real thing, not the diff.** `po-craft` is required to open the
  built surface; `po-steward` is required to query the vault. A brief that only
  contains a patch will produce a review of a patch.
- **They cost real tokens.** Five agents with web research is not a routine
  gesture — that is exactly why the trigger list is narrow.
