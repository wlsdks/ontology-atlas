# ATLAS PRODUCT DECISION SYSTEM

> Version 3, active as a finite pilot from 2026-09-01. It keeps the v2
> two-reviewer ceiling but removes the builder's ability to declare their own
> door and risk. Git preserves both prior systems; `docs/PO-PILOT.md` decides
> whether this one earns a permanent place.

Atlas does not need a universal product-management framework. It needs a product
owner for one unusual failure: coding agents can change a codebase faster than
its owner can reconstruct what was built, why, and whether it should be trusted.

The Atlas PO protects this promise:

> After people and coding agents change a codebase, Atlas lets its owner recover
> enough product meaning to orient, explain, judge, correct, and hand off the
> work without surrendering authority to the agent.

The gate is not a grade, backlog ritual, or permission for an agent to approve
its own work. It is a small decision contract around that promise.

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
boundaries. The router derives the door, primary risk, and reviewer pair. It
does not accept `--door` or `--risk`.

### Mechanical maintenance

Typos, dependency bumps, CI plumbing, lint configuration, isolated test
fixtures, and equivalent maintenance use technical checks only:

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
- `review`: `po-evidence` plus exactly one risk specialist. Meaning selects
  `po-steward`, positioning selects `po-wedge`, and scope selects `po-leverage`.

The human owner may request extra review. Record a two-way exception as
`owner-review` in the pilot; it counts against council avoidance but does not
widen the default router.

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
append-only decision ledger. During the pilot they still add one compact typed
run to `docs/PO-PILOT.md`, because missing reversible cases would make the 80%
avoidance denominator meaningless.

## Selected review protocol

One-way work gets Evidence plus the specialist returned by the router.

1. Search `docs/DECISIONS.md` narrowly for the same surface and question. Cite
   a standing decision or explicitly overturn it; check its falsifier.
2. Record the requested words, intended decision, scope, and recovery proof
   before review. Without a before-state, review cannot claim a causal delta.
3. Give both reviewers the same primary evidence. Preserve independent first
   positions. If the execution environment weakens independence, record it.
4. Rebut only when recommendations materially conflict or one bounded fact can
   change the decision. At most one round; otherwise record zero turns.
5. The accountable human owner decides. Reviewers do not vote, average scores,
   or manufacture a delta to satisfy the pilot.
6. Record the strongest losing argument, falsifier, review footprint, unique
   contributor, and later recovery result. `unchanged` is valid data.

`po-craft` remains owner-requested proof review only. It consumes evidence from
the dedicated design and journey gates instead of repeating them.

## Significant decision record

Keep a new record to roughly one page. Historical records stay append-only.

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

Route, public MCP/CLI contract, and design-spec changes still trip
`pnpm decisions:check`. That gate proves a durable record exists; it does not
claim the judgment was good.

## Measured pilot and forced sunset

`docs/PO-PILOT.md` is a typed, append-only run and outcome register.
`pnpm po:pilot` calculates:

- eligible decisions and the reversible denominator;
- review turns and material decision-delta rate;
- reversible decisions that avoided council;
- recovery-proof coverage and shipped proof failures;
- owner clarity, boundary misses, reopen/reversal results; and
- each specialist's calls and unique material contributions.

`pnpm po:pilot -- --check` runs automatically in CI. It remains green while a
valid pilot is collecting. At 20 decisions or 14 days it requires an explicit
`keep`, `adjust`, or `revert`; fewer than 10 decisions get one extension to 21
days. A shipped recovery-proof failure or serious boundary miss stops the pilot
immediately until the owner chooses `adjust` or `revert`. It refuses `keep`
unless the declared thresholds pass. A specialist with five calls and no unique
material contribution must leave the default map.

The known-control contract also replays:

- unsupported OS URL-scheme authority as one-way Evidence + Steward;
- an unmeasured internal transport replacement as two-way `probe-first`;
- first-contact positioning as one-way Evidence + Wedge; and
- reversible visual craft as solo with its proof delegated to design gates.

The pilot measures routing and decision usefulness, not market demand. A real
user report, field trial, or observed recovery proof remains the outcome
authority.

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
