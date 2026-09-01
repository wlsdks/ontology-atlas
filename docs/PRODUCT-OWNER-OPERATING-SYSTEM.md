# ATLAS PRODUCT DECISION SYSTEM

> Pilot policy from 2026-09-01. It replaces the active numeric score and the
> default full-roster council for the next 20 eligible decisions. Git keeps
> the previous policy recoverable; the decision ledger keeps its history.

Atlas does not need a universal product-management framework. It needs a small
decision system for one product promise:

> After people and coding agents change a codebase, Atlas keeps its product
> meaning inspectable, correctable, and reusable without taking authority away
> from the person who owns the code.

The product gate exists to protect that promise. It is not a grade, a backlog
ritual, or permission for an agent to approve its own work.

## The one product question

Before product work, ask:

> Which decision, understanding, trust boundary, or handoff does a person lose
> today, and what is the smallest observable change that gives it back?

Start with a witnessed failure, not the requested feature. A request for a
route, panel, library, schema field, animation, or agent tool is a proposed
solution until the failure remains true without that noun.

Evidence has three states:

- **observed** — a user report, installed-app walk, runtime result, source-hidden
  trial, or inspectable artifact shows the failure;
- **inferred** — source, a prior decision, or a related measurement supports the
  claim, but the target failure has not been watched;
- **unknown** — the claim is plausible and untested.

Unknown evidence cannot be converted into certainty by adding reviewers. Use a
small probe or stop.

## Route by reversibility

Run `pnpm po:route -- --help` for the executable route. There are three paths.

### 1. Mechanical — skip the PO gate

Typos, dependency bumps, CI plumbing, lint configuration, test fixtures, and
equivalent maintenance go directly to their technical checks. A change that
alters local-first behavior or human authority is never mechanical.

```bash
pnpm po:route -- --mechanical
```

### 2. Two-way door — one accountable solo pass

A two-way door is cheap to undo, does not change a public contract or source of
truth, and cannot silently weaken human approval. The builder writes the compact
pass below, chooses a bounded proof, and proceeds. Unknown evidence means
`probe-first`, not a council.

```bash
pnpm po:route -- --door=two-way --evidence=observed --risk=none
```

### 3. One-way door — two independent reviewers

A one-way door is difficult to reverse because it changes a public contract,
the product category, a first impression, a source-of-truth or authority
boundary, the user-facing surface inventory, or a substantial investment. It
gets `po-evidence` plus one specialist selected by the primary Atlas risk.

| Primary Atlas risk | Specialist | Use when the decision changes |
|---|---|---|
| `meaning` | `po-steward` | durable meaning, evidence truth, local-first storage or transfer, canonical files, agent-write authority, human approval, or next-agent handoff |
| `positioning` | `po-wedge` | category, product direction, first-contact words, launch claims, or one-shot reputation |
| `scope` | `po-leverage` | a new or removed surface, an expensive slice, or a difficult rollback boundary |

```bash
pnpm po:route -- --door=one-way --evidence=inferred --risk=positioning
```

Name one primary risk. Do not union every specialist into a committee. The human
owner may explicitly ask for more review, but that is an exception recorded in
the review footprint, not the default route.

## Universal boundary scan

Every non-mechanical pass answers one binary question:

> Does this change where canonical truth lives, what leaves the machine, what an
> agent may write, or whether a person can inspect, reject, and correct it?

If yes, it is a one-way `meaning` decision and Steward review is mandatory. The
builder cannot self-declare an exemption. This is the Atlas-specific safeguard
that remains universal.

Shared meaning and agent handoff are otherwise conditional. A visual alignment,
copy correction, or ordinary interaction change does not need to invent
ontology value. Route visual craft through the product-design gates and a full
journey through `/user-walkthrough`; the PO review consumes that evidence rather
than repeating it.

## Compact solo pass

Keep this to one screen:

```md
## Atlas product pass — <decision>

**Prior decision**: <standing record or none; falsifier observed or not>
**Failure and moment**: <who loses which decision/understanding/trust/handoff, when>
**Evidence state**: observed / inferred / unknown — <artifact>
**Atlas stake**: meaning / positioning / scope / none — <why>
**Local-first and human sovereignty**: unchanged / affected — <how>
**Door**: two-way — <rollback> / one-way — <reason>
**Smallest proof**: <one bounded result and failure condition>
**Decision**: stop / probe first / build and verify — <smallest slice>
```

Do not append routine two-way passes to `docs/DECISIONS.md`. The pass belongs in
the working plan or pull-request rationale. The ledger is for significant
decisions whose motivation a future person or agent would otherwise have to
reconstruct.

## Selected review protocol

1. Search `docs/DECISIONS.md` narrowly for the same surface and question. Cite a
   standing decision or explicitly overturn it; check its falsifier.
2. Record the proposed decision before review. Without a before-state, the
   council cannot claim it changed anything.
3. Give the two selected reviewers the same literal request and primary
   evidence. Their first positions are independent.
4. A rebuttal happens only when their recommendations materially conflict or a
   bounded factual question can change the decision. There is at most one.
5. The accountable human owner decides. Reviewers challenge; they do not vote,
   average scores, or manufacture approval.
6. Record what changed, the strongest losing argument, its falsifier, and the
   review footprint. `unchanged` is a valid decision delta and necessary data.

`po-craft` remains available only when the owner explicitly wants an independent
proof audit. It does not repeat screenshots, responsive measurement, motion
verification, design critique, or journey work owned by their dedicated gates.

## Significant decision record

Keep a new record to roughly one page. Historical records remain append-only.

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

Route, public MCP/CLI contract, and design-spec changes still trip
`pnpm decisions:check`. That gate proves a significant record exists; it does
not prove the judgment was good.

## Pilot and sunset

Use this lighter path for the next 20 eligible decisions or 14 days, whichever
comes first. If fewer than 10 eligible decisions occur, extend once to 21 days.
During the pilot, record review cost as reviewer and rebuttal turns, not a token
claim. For each one-way review, record the pre-review decision, evidence state,
confidence, fixed decision-delta category, and later reopen or reversal.

Before trusting the router, replay these known controls:

- an unsupported OS URL scheme remains a one-way meaning/trust review;
- an unmeasured internal transport replacement remains a two-way `probe-first`
  decision rather than earning approval from a score;
- first-contact positioning remains a one-way Evidence + Wedge review;
- a reversible craft change stays solo and routes its proof to design checks.

Keep the pilot as the active daily path only if:

- every known one-way control routes to the relevant independent reviewers;
- no serious local-first, schema, reputation, or human-authority boundary is
  missed;
- at least 20% of escalated reviews materially stop, narrow, redirect, bound a
  claim, or strengthen verification versus the recorded pre-review decision;
- reversible work avoids council in at least 80% of eligible cases; and
- the owner can read the pass and the resulting delta without another summary.

If these conditions fail, append the outcome and either adjust the risk map or
return to the prior gate. Do not let the pilot become permanent by inertia. A
specialist that produces no unique material contribution across five calls
leaves the default route.

## What was retained and removed

Retained:

- phenomenon before solution;
- evidence before confidence;
- one accountable human owner;
- narrow reading of standing decisions, dissent, falsifier, and revisit;
- smallest integrated slice and honest runtime proof;
- local-first and human-sovereignty protection;
- conditional stewardship of durable shared meaning and agent handoff.

Removed from the active path:

- the six-row numeric score and its pass threshold;
- universal ontology and agent-value essays;
- mandatory five-reviewer councils and mandatory rebuttal;
- duplicated visual, responsive, motion, and journey inspections;
- routine entries in the append-only decision ledger.

## Why this shape

The process is intentionally adapted to Atlas rather than copied wholesale.
[Shape Up](https://basecamp.com/shapeup/4.1-appendix-02) says tiny teams can
discard most formal cycle and betting machinery while retaining deliberate
shaping and appetite. [Amazon](https://aws.amazon.com/pt/executive-insights/content/how-amazon-defines-and-operationalizes-a-day-1-culture/)
separates reversible from irreversible decisions. [Product Talk](https://www.producttalk.org/getting-started-with-discovery/)
grounds discovery in repeated customer contact and small tests.
[Linear](https://linear.app/method/introduction) favors brief specs, named
ownership, and removing work around work. [Architecture decision records](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
preserve significant rationale in small, durable records. Research on
[multi-agent debate](https://aclanthology.org/2026.findings-acl.1694/) warns
that more homogeneous debate can cost more without improving a simple baseline;
independent evidence and genuine viewpoint differences matter more than seat
count.

Those sources inform the mechanics. Atlas supplies the non-negotiable product
judgment: durable meaning stays evidence-bound and local, agents may propose but
people remain able to inspect, reject, correct, and own it.
