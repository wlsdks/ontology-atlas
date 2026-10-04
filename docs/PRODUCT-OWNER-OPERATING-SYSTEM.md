---
title: Product Owner Operating System
doc_type: authority
status: current
area: process
---

# Product Owner Operating System

> Facts route each product decision to a solo pass or one independent
> `reviewer`; the builder never declares their own door and risk.

Atlas does not need a universal product-management framework. It needs a product
owner for one unusual failure: coding agents can change a codebase faster than
its owner can reconstruct what was built, why, and whether it should be trusted.

The Atlas PO protects this promise:

> After people and coding agents change a codebase, Atlas lets its owner recover
> enough product meaning to orient, explain, judge, correct, and hand off the
> work without surrendering authority to the agent.

The gate is not a grade, backlog ritual, or permission for an agent to approve
its own work. It is a small decision contract around that promise.

## Human value: understanding, calibrated confidence, and control

Atlas PO work starts from the current
[Atlas product thesis](PRODUCT-DIRECTION.md#the-atlas-product-thesis), not a
generic feature scorecard. Its connected risks are source-first meaning
construction, task-aware agent context, evidence-bound human change review,
and accepted meaning reused in the next task. The reviewer judges its part of this
same product through the lenses the route selects. Do not require every small change to implement the whole loop.

Judge a proposal by the state it helps a person reach, not by its feature count
or how reassuring it looks. Atlas should help the owner explain relevant system
meaning, distinguish supported conclusions from unknowns, and decide when to
inspect, correct, reject, or defer an agent's proposed meaning. A person who
correctly becomes less confident after finding missing evidence has gained
control; confidence must not outrun the evidence.

Use the existing five outcomes below, not a second scorecard. Understanding maps
to `orient` and `explain`; calibrated confidence to `judge`; actionable control
to `correct`; durable reuse to `handoff`. Name a concrete before/after ability
inside the existing recovery proof. Ask what the person can now decide, what
evidence supports that decision, and what action remains available when the
agent is wrong. A changed feeling, faster approval, fewer clicks, a green check,
or an MCP call is a signal to investigate, not proof of that ability.

Convenience matters when it reduces the cost of reaching that outcome. Include
the cost of initial meaning construction, repeated explanation, false alarms,
human review, and keeping accepted meaning current. For a workflow claim, look
for accepted context used in a later independent task, not daily app opens or
forced tool calls. Task-aware context and task-bound meaning review are product
hypotheses to test against source and real decisions; their presence alone does
not establish retention or reliable business-meaning reconstruction.

Meaning acceptance, code correctness, merge, and deployment are distinct
decisions. A visual summary must not collapse them into one reassuring approval.
Keep the same evidence and uncertainty available to people and agents, including
the option to decline a proposal without pretending the code was rolled back.

## The five Atlas outcomes

Every non-mechanical product decision names one primary human outcome. These are
the only universal product outcomes in this gate.

| Outcome | Observable ability Atlas gives back |
|---|---|
| `orient` | a person can find the right product or implementation starting point |
| `explain` | a person can explain what exists and why it has that shape |
| `judge` | a person can judge evidence, uncertainty, and likely impact |
| `correct` | a person can inspect, reject, or correct agent-authored meaning |
| `handoff` | the next person or agent can reuse accepted meaning and its verification path |

Ask:

> Who loses which one of these abilities, at what moment, and what is the
> smallest observable change that gives it back?

A route, panel, library, schema field, animation, or agent tool is still a
proposed solution. The failure statement must survive removal of that noun.
Ordinary maintenance has no invented Atlas outcome and skips this gate.

## Evidence before commitment

Evidence has three states:

- **observed** — a user report, installed-app walk, runtime result, source-hidden
  trial, or inspectable artifact shows the target failure;
- **inferred** — source, a prior decision, or adjacent evidence supports it, but
  the target failure has not been watched;
- **unknown** — plausible and untested.

Unknown evidence routes to the cheapest bounded probe. Extra reviewers cannot
convert it into observation.

## Route from facts, not verdicts

Run `pnpm po:route -- --help`. The builder supplies an evidence state, one Atlas
outcome, inspectable change signals, and an explicit state for all four Atlas
boundaries. The router derives the door, primary risk, and whether one independent
review is needed. It does not accept `--door` or `--risk`.

### Mechanical maintenance

Typos, dependency bumps, CI plumbing, lint configuration, isolated test
fixtures, and behavior-preserving refactors and equivalent maintenance use technical checks
directly, without loading this guide or routing a product decision. Request an
explicit classification receipt only when needed:

```bash
pnpm po:route -- --mechanical
```

Mechanical work cannot carry a product or sovereignty signal. If it does, the
router refuses the classification instead of silently upgrading or skipping it.

### Change signals

| Signal | Derived route | Why |
|---|---|---|
| `rollback-cheap` | two-way solo | internal, cheap to undo, and no one-way fact is present |
| `public-contract` | one-way · meaning | public MCP, CLI, vault, or source-of-truth behavior changes |
| `positioning` | one-way · positioning | category, direction, first-contact words, launch claim, or reputation changes |
| `surface-inventory` | one-way · scope | a user-facing surface is added or removed |
| `substantial-investment` | one-way · scope | the slice is expensive or difficult to unwind |

The universal Atlas boundary has four explicit assessments:

| Boundary | Ask whether the change affects |
|---|---|
| `truth` | where canonical truth lives or when proposed meaning becomes accepted |
| `transfer` | what leaves the machine or crosses a trust boundary |
| `agent-write` | what an agent may write or approve |
| `human-correction` | whether a person can inspect, reject, and correct the change |

Every non-mechanical pass records each boundary as `unchanged`, `affected`, or
`unknown`; omission is an error. `affected` and `unknown` are one-way `meaning`
signals and override `rollback-cheap`. When several one-way risks coexist, the fixed priority is
meaning, then positioning, then scope; this preserves the sovereignty brake
without unioning every specialist into a committee. The record keeps every
signal and the router's reasons, so the owner can challenge the facts.

Examples:

```bash
pnpm po:route -- --evidence=unknown --outcome=handoff --change=rollback-cheap \
  --boundary=truth:unchanged,transfer:unchanged,agent-write:unchanged,human-correction:unchanged
pnpm po:route -- --evidence=inferred --outcome=orient --change=positioning \
  --boundary=truth:unchanged,transfer:unchanged,agent-write:unchanged,human-correction:unchanged
pnpm po:route -- --evidence=observed --outcome=correct \
  --change=public-contract \
  --boundary=truth:unchanged,transfer:unchanged,agent-write:affected,human-correction:affected
```

### Resulting paths

- `skip`: maintenance checks only.
- `solo`: one accountable pass. Unknown evidence means `probe-first`.
- `review`: one `reviewer` with the lenses the router returns: `moment` and
  `evidence` always, plus `boundaries` for meaning and `smallest-slice` for
  scope. When the pass decides to build, a `product-planner` writes the product
  spec first and the reviewer adds the `spec` lens (see Product spec).

The human owner may request extra review; it does not widen the default router.

## Recovery proof

Every non-mechanical pass defines one proof before implementation:

```text
Given <Atlas artifact and knowledge state>, without <forbidden fallback>,
<actor> can <orient/explain/judge/correct/handoff task> and cite <evidence>.
Fail when <observable condition>.
```

Use source-hidden proof when the claim is that Atlas itself carries the
understanding. Use the real runtime when the claim is interaction or control.
Do not use a green unit test as proof of human comprehension, and do not ask a
PO reviewer to repeat browser, motion, responsive, design, or journey gates.

This proof is the product contract. The router only determines how much
independent judgment it needs.

## Product spec

A one-way route whose pass decides to build gets a product spec before its
review, so the reviewer and the builder work from one concrete answer: who, at
which moment, through which steps, in which states, with which exact words, and
how anyone can tell it works. The `product-planner` agent writes it at max
effort with `pnpm doc:new -- --type=spec`; it cites a file, capture, or record
for every claim about today, weighs the status quo against at least one other
way to restore the ability, and never builds. Exact English and Korean copy go
into `messages/`, because prose under `docs/` stays English. The one `reviewer`
adds the `spec` lens before any build; the `planner` maps each acceptance
criterion to a slice, `/design-build` captures each state row, and the
returned-slice review checks the criteria and the Out of scope list. A solo
route writes none; its one-screen pass is enough. The spec lands with the change
it describes, marked `current`; an abandoned change's spec never lands.

## Compact solo pass

Keep this to one screen:

```md
## Atlas product pass — <decision>

**Prior decision**: <standing record or none; falsifier observed or not>
**Human loss and moment**: <actor, lost ability, and exact moment>
**Atlas outcome**: orient / explain / judge / correct / handoff — <observable ability>
**Evidence state**: observed / inferred / unknown — <primary artifact>
**Change signals**: <change signals and all four boundary assessments>
**Computed route**: <door, risk, route, and router reasons>
**Recovery proof**: Given …; fail when …
**Decision**: stop / probe first / build and verify — <smallest slice>
```

Routine solo passes stay in the working plan or pull-request rationale, not the
decision records. A significant decision gets a decision fragment.

## Independent review protocol

One-way work gets one `reviewer` that did not write the change, applying the
lenses the router returns.

1. Search narrowly with `pnpm decisions:find <terms>` for the same surface
   and question. Cite a standing decision or explicitly overturn it; check
   its falsifier.
2. Record the requested words, intended decision, scope, and recovery proof
   before review. Without a before-state, review cannot claim a causal delta.
   On a build decision, that record is the product spec.
3. Give the reviewer the primary evidence and seal its first judgment before
   the author answers. If the execution environment weakens independence,
   record it.
4. The author answers a finding once, only when it materially conflicts.
5. If the decision is one-way and author and reviewer still disagree, take one
   second opinion from a different model: from Claude Code, the Codex
   `reviewer` brief (`codex exec --sandbox read-only` with
   `.agents/agents/reviewer.md`); from Codex, the Claude Code `reviewer`. Give it
   the same evidence and the disputed decision stated neutrally, but neither
   argument, and no reply round. Send repository content only, never vault or
   user data. If no different model is available, say so.
6. The accountable human owner decides; `unchanged` is valid. The decision
   fragment records the dissent and the falsifier.

The reviewer consumes the outputs of `/design-audit`, `/responsive-sweep`,
`/motion-verify`, `/map-perf`, and `/user-walkthrough` rather than repeating
those gates.

## Significant decision record

A record is six fields in this order, within 24 lines and 2,000 bytes;
`pnpm decisions:check` refuses anything else, on every record. Short
records stay readable before a decision is convened.

```md
## YYYY-MM-DD — <the decision in one line>

**Why**: <the observation that forced a decision>
**Prior**: <YYYY-MM-DD (n) cited as standing or overturned, or none>
**Decision**: <what is decided, the smallest slice>
**Dissent**: <the strongest losing argument and whose it was, or none>
**Falsifier**: <the one observable condition that reopens this>
**Owner**: <the accountable person>
```

Route, evidence state and review delta stay in the pass and the pull-request
rationale; they are not repeated in the record. A change that
fits its commit message needs no record. Overturning is a new record whose
`Prior` names the old one; `pnpm decisions:find` lists who cites a record, so
status is derived, never edited in place.

Route, public MCP/CLI contract, and design-spec changes still trip
`pnpm decisions:check`. That gate proves a durable record exists and fits the
template; it does not claim the judgment was good.

## Measured pilot and forced sunset

The routing pilot closed as `adjust`: the router and decision fragments stay,
and per-run pilot records are no longer written. `pnpm po:pilot` still reads the
frozen register, and `pnpm po:pilot -- --check` validates it in CI.

## Why this shape

External practice supplies constraints, not a generic PO persona. The
[GOV.UK service guidance](https://www.gov.uk/service-manual/measuring-success/how-to-set-performance-metrics-for-your-service)
ties measures to a service's purpose and asks teams to design measurement while
building, not afterward. Microsoft's validated
[human-AI interaction guidelines](https://www.microsoft.com/en-us/research/blog/guidelines-for-human-ai-interaction-design/)
turn broad trust language into observable correction, explanation, and control.
The [NIST Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)
calls for risk-proportional independent evaluation, provenance understanding,
and tracking human overrides and outcomes. Anthropic's
[agent-evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
recommends realistic failure-derived tasks, explicit success criteria, automated
regression checks, production evidence, and periodic human calibration.
GitHub's account of
[AI-generated review overload](https://github.blog/engineering/turn-one-giant-ai-generated-pull-request-to-a-reviewable-stack/)
supports keeping proofs and slices small enough to hold in a reviewer's head.

Atlas applies those constraints to its own product category: the outcome is not
more process or faster code generation. It is recovered, evidence-bound human
understanding after agents move faster than a person can follow.

The product spec borrows from practice for specs that agents build from.
GitHub's [Spec Kit template](https://github.com/github/spec-kit/blob/main/templates/spec-template.md)
writes user scenarios as Given/When/Then with edge cases and marks what is not
known instead of guessing, and [EARS](https://alistairmavin.com/ears/) shapes
each flow step as a trigger and a response. [Design Docs at Google](https://www.industrialempathy.com/posts/design-docs-at-google/)
list non-goals that could reasonably be goals, and alternatives with their
trade-offs, doing nothing included. [Shape Up](https://basecamp.com/shapeup/1.5-chapter-06)
pairs a problem with its solution, rabbit holes, and no-gos, and
[opportunity solution trees](https://www.producttalk.org/opportunity-solution-trees/)
compare options instead of asking whether one is good. SVPG's
[four big risks](https://www.svpg.com/four-big-risks/) name value, usability,
feasibility, and viability; a [premortem](https://hbr.org/2007/09/performing-a-project-premortem)
finds likely failures before commitment; [NN/g](https://www.nngroup.com/articles/error-message-guidelines/)
asks error copy to be precise and constructive; and a
[good product manager](https://a16z.com/good-product-manager-bad-product-manager/)
defines the what, not the how, and errs on the side of clarity. Böckeler's
[review of spec-driven tools](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)
warns that one heavy workflow for every size buries review, which is why solo
routes write no spec.
