---
name: po-pass
description: Route Atlas product work by evidence, reversibility, and human-sovereignty risk before implementation; use a compact solo pass for reversible work.
---

# Atlas product pass — the daily path

This is a product-specific checkpoint, not a general PO scorecard. It protects
the moment where a person must understand, judge, or hand off meaning after
people and agents change a codebase.

Read `docs/PRODUCT-OWNER-OPERATING-SYSTEM.md` before using this skill. The
executable classifier is `pnpm po:route -- --help`.

## 0. Skip real maintenance

Typos, dependency bumps, CI plumbing, lint configuration, and test fixtures go
straight to technical checks.

Never call work mechanical when it changes canonical truth, storage or transfer,
agent-write authority, or a person's ability to inspect, reject, and correct a
change.

## 1. Read only the prior decision you need

Search `docs/DECISIONS.md` for the same surface and question.

- Cite a standing decision or explicitly overturn it.
- Check its falsifier.
- Do not read or summarize the full ledger.

## 2. Name the failure before the solution

Write who loses which decision, understanding, trust boundary, or handoff, and
at what moment. The statement must remain true after removing the requested
route, panel, library, schema field, animation, or tool name.

Classify the evidence:

- `observed`: a user report, runtime result, installed-app walk, source-hidden
  trial, or inspectable artifact shows the target failure;
- `inferred`: source or related evidence supports it, but the failure was not
  watched;
- `unknown`: plausible and untested.

Unknown evidence routes to a bounded probe, not confidence prose.

## 3. Run the universal Atlas boundary scan

Answer yes or no:

> Does this change where canonical truth lives, what leaves the machine, what an
> agent may write, or whether a person can inspect, reject, and correct it?

A yes is always a one-way `meaning` decision. Use
`--sovereignty-affected`; the router selects Steward review. The builder
cannot self-grant an exemption.

Shared-meaning and next-agent value are otherwise conditional. When neither
changes, say `Atlas stake: none` and route the actual craft or engineering
proof instead of inventing ontology value.

## 4. Classify the door and primary risk

- `two-way`: cheap rollback, no public/source-of-truth/authority boundary;
- `one-way`: public contract, first impression, product direction, surface
  inventory, substantial investment, or difficult rollback.

For a one-way door, choose one primary Atlas risk:

- `meaning`: durable meaning, evidence truth, local-first, human authority, or
  agent handoff;
- `positioning`: category, direction, first-contact words, launch claims, or
  reputation;
- `scope`: new/removed surface, expensive slice, or rollback boundary.

Run the router. Examples:

```bash
pnpm po:route -- --door=two-way --evidence=unknown --risk=none
pnpm po:route -- --door=one-way --evidence=inferred --risk=positioning
```

## 5. Write one screen

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

## 6. Follow the route

- `skip`: use maintenance checks.
- `solo`: one accountable owner proceeds. Unknown evidence means probe first.
- `review`: invoke `/po-council` with only the two reviewers returned by the
  router.

Do not append routine solo passes to `docs/DECISIONS.md`. During the active
pilot, append one compact row to `docs/PO-PILOT.md` so the lighter route can be
judged instead of becoming permanent by assertion.

Visual craft, responsive behavior, motion, and full journeys use their dedicated
design or walkthrough gates. This pass names the required proof; it does not
repeat it.
