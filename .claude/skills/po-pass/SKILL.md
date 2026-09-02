---
name: po-pass
description: Route Atlas product work from observable change facts and one human-recovery outcome; use a compact solo pass for reversible work.
---

# Atlas product pass — recover human understanding

This is not a general PO scorecard. It protects the moment where coding-agent
velocity has made a person unable to find, explain, judge, correct, or hand off
what their codebase now means.

Read `docs/PRODUCT-OWNER-OPERATING-SYSTEM.md` before using this skill. Run
`pnpm po:route -- --help`; never supply your own door or risk verdict.

## 0. Skip real maintenance

Typos, dependency bumps, CI plumbing, lint configuration, isolated fixtures, and
equivalent maintenance go straight to technical checks:

```bash
pnpm po:route -- --mechanical
```

A change with any product or sovereignty signal is not mechanical. The router
must reject that combination.

## 1. Read the one prior decision you need

Run `pnpm decisions:find <surface terms>` for the same surface and question;
it returns records, not lines, with each record's decision, falsifier, and the
later records that cite it. `--record=<n|date>` prints one in full.

- Cite a standing decision or explicitly overturn it.
- Check its falsifier, and read the records that cite it before calling it
  standing.
- Do not summarize the full ledger.

## 2. Name the lost human ability

Write the actor, exact moment, and one Atlas outcome:

- `orient`: find the right starting point;
- `explain`: explain what exists and why;
- `judge`: judge evidence, uncertainty, and impact;
- `correct`: inspect, reject, or correct agent-authored meaning;
- `handoff`: let the next person or agent reuse accepted meaning and proof.

The statement must remain true after removing the requested route, panel,
library, schema field, animation, or tool name.

Classify evidence as `observed`, `inferred`, or `unknown`. Unknown evidence
requires a bounded probe, not confidence prose.

## 3. Supply facts to the router

Use one or more change signals:

- `rollback-cheap`;
- `public-contract`;
- `positioning`;
- `surface-inventory`;
- `substantial-investment`.

Assess every boundary as `unchanged`, `affected`, or `unknown`:

- `truth`: canonical truth or acceptance changes;
- `transfer`: information crosses a machine or trust boundary;
- `agent-write`: agent write or approval authority changes;
- `human-correction`: inspect, reject, or correction ability changes.

Omitting one is an error. `affected` and `unknown` force one-way meaning review
and override `rollback-cheap`. The router derives the door, risk, and reviewers,
so the builder must leave an inspectable claim instead of silently omitting the
scan.

```bash
pnpm po:route -- --evidence=unknown --outcome=handoff --change=rollback-cheap \
  --boundary=truth:unchanged,transfer:unchanged,agent-write:unchanged,human-correction:unchanged
pnpm po:route -- --evidence=observed --outcome=correct \
  --change=public-contract \
  --boundary=truth:unchanged,transfer:unchanged,agent-write:affected,human-correction:affected
```

## 4. Define the recovery proof

Write one observable contract before implementation:

```text
Given <Atlas artifact and knowledge state>, without <forbidden fallback>,
<actor> can <outcome task> and cite <evidence>.
Fail when <observable condition>.
```

Use source-hidden proof when claiming Atlas itself carries understanding. Use
the real runtime for interaction or control. Delegate visual, responsive,
motion, and journey measurement to their own gates.

## 5. Write one screen

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

## 6. Follow and measure the route

- `skip`: maintenance checks.
- `solo`: one accountable owner proceeds; unknown evidence means probe first.
- `review`: invoke `/po-council` with only the returned pair.

If the owner explicitly adds reviewers to a two-way decision, record
`owner-review` in the pilot so the council-avoidance metric sees the cost.

Routine solo work stays out of `docs/DECISIONS.md`. Every eligible
non-mechanical decision adds one structured run and outcome row to
`docs/PO-PILOT.md`; run `pnpm po:pilot` to see whether the gate is earning
its cost.

A green router is not proof of a good product decision. The recovery proof and
later observed result are.
