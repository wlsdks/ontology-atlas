# Product check

## Start with the actual change

Behavior-preserving refactors, dependency maintenance, lint, fixtures and typo
corrections use technical checks directly. Do not invent a product outcome,
load the product manuals, or run a router just to confirm maintenance.
Use `pnpm po:route -- --mechanical` only when an explicit classification receipt
is needed. A truth, transfer, agent-write or human-correction change is not
maintenance, even when its patch is small.

For product work, state the user, concrete problem, intended behavior and
observable proof in the working rationale or PR. Reuse the owner's selected
shape and existing authorization. No separate artifact for a routine solo pass.
Read only the relevant current product thesis and prior decision; search
`pnpm decisions:find <surface terms>` when changing an existing choice.

## Route the decision

Supply facts to `pnpm po:route`: evidence (`observed`, `inferred`, `unknown`),
one outcome (`orient`, `explain`, `judge`, `correct`, `handoff`), change signals,
and all four boundary assessments. Do not supply a door or risk verdict.
The definitions and examples live in
[the owner guide](../../../docs/PRODUCT-OWNER-OPERATING-SYSTEM.md#route-from-facts-not-verdicts).

- `skip`: complete the technical checks.
- `solo`: implement and verify the bounded change. Probe unknown evidence first.
  No spec unless the owner asks.
- `review`: read the owner guide's **Product spec** and **Independent review
  protocol** sections; use the current harness's `product-planner` and one
  `reviewer`. Preserve the selected lenses, evidence and approval boundaries.
  Avoid extra reviewers or a fresh approval question when authorization holds.

Green routing is not product proof. Verify the observable behavior; keep code,
merge, deployment and accepted ontology meaning distinct.

## 5. Write one screen

Keep these facts in the existing rationale, without repeating them in a ledger:

```md
## Atlas product pass — <decision>

**Prior decision**: <standing record or none; conditions rechecked>
**Human loss and moment**: <actor, problem, exact moment>
**Atlas outcome**: <one outcome and observable behavior>
**Evidence state**: <observed / inferred / unknown and primary evidence>
**Change signals**: <signals and all four boundary assessments>
**Computed route**: <router output and reasons>
**Recovery proof**: Given …; fail when …
**Decision**: <stop / probe first / build and verify and scope>
```

Only a significant choice or a reversed standing decision needs a decision
fragment. The pilot is closed; do not create per-run records.
