---
started: 2026-09-01
decision_target: 20
decision_deadline: 2026-09-15
sparse_extension_deadline: 2026-09-22
outcome: pending
---

# Atlas PO routing pilot

This temporary register measures the 2026-09-01 Atlas product-decision system.
It is not a second decision archive. Significant rationale stays in
[`DECISIONS.md`](DECISIONS.md); this file keeps only the typed facts needed to
decide whether the gate earns, narrows, or loses its place.

Run `pnpm po:pilot` for the current report and `pnpm po:pilot -- --check` for
the sunset gate.

## Method

- Eligible decisions are non-mechanical Atlas product decisions routed by
  `pnpm po:route`; maintenance skips are not logged.
- `Route` is `solo`, derived one-way `review`, or `owner-review` when the owner
  explicitly adds reviewers to a two-way decision. That exception counts
  against reversible council avoidance.
- The first table is append-only and captures the before/after review footprint.
  `Delta` is `unchanged`, `stopped`, `narrowed`, `redirected`,
  `evidence-bounded`, or `verification-strengthened`.
- The second table appends later observations. Never rewrite a run to make the
  process look better; append a newer update for the same run.
- `Recovery proof` is `pending`, `pass`, `fail-caught`, or `fail-shipped`.
  `Later result` is `pending`, `held`, `reopened`, or `reversed`. A shipped
  proof failure or serious boundary miss stops the pilot immediately until the
  owner sets `adjust` or `revert`.
- Reviewer cost is first-position plus rebuttal turns. Time and tokens are not
  inferred from commits.

## Acceptance and sunset

At 20 eligible decisions or 2026-09-15, whichever comes first, the owner must
set the frontmatter outcome to `keep`, `adjust`, or `revert`. Fewer than 10
decisions on that date activate the single extension to 2026-09-22.

`keep` is valid only when all known routing controls stay green, no serious or
unresolved boundary miss exists, at least 20% of reviews make a material
decision delta, at least 80% of reversible decisions avoid council, at least
80% of recovery proofs are resolved with no shipped failure, every owner-facing
result is clear, and no specialist reaches five calls without one unique
material contribution. `adjust` and `revert` remain valid owner decisions when
the evidence rejects the current map.

## Legacy baseline

This row predates the typed register and remains unaltered as the v2 baseline.

| # | Date | Decision | Pre-review | Route | Evidence / risk | Review turns | Delta | Later result |
|---:|---|---|---|---|---|---:|---|---|
| 0 | 2026-09-01 | Replace the universal PO score and default council | Improve rather than abolish; exact replacement undecided | legacy full council | observed + inferred / meaning | 10 | narrowed — activate a reversible 20-decision router pilot and retain the sovereignty brake | pending merge and live use |

## Structured runs

| # | Date | Decision | Door | Route | Atlas outcome | Changes | Boundaries | Risk | First | Rebuttal | Delta | Unique contribution |
|---:|---|---|---|---|---|---|---|---|---:|---:|---|---|
| 1 | 2026-09-01 | Replace self-graded routing with an Atlas outcome contract and measured sunset | one-way | review | explain | rollback-cheap | truth=unchanged;transfer=unchanged;agent-write=affected;human-correction=affected | meaning | 2 | 0 | verification-strengthened | po-evidence+po-steward |
| 2 | 2026-09-01 | Replace stacked design ceremony with fact-derived proof routing | two-way | solo | judge | rollback-cheap | truth=unchanged;transfer=unchanged;agent-write=unchanged;human-correction=unchanged | none | 0 | 0 | unchanged | none |

## Outcome updates

| Run | Date | Recovery proof | Owner clear | Boundary miss | Later result |
|---:|---|---|---|---|---|
| 1 | 2026-09-01 | pending | pending | pending | pending |
| 1 | 2026-09-01 | pass | pending | no | pending |
| 2 | 2026-09-01 | pending | pending | pending | pending |
| 2 | 2026-09-01 | pass | pending | no | held |
