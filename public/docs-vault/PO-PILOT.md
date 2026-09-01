# Atlas PO routing pilot

This temporary ledger measures the 2026-09-01 risk-routed product gate. It is
not a second decision archive. Significant rationale stays in
[`DECISIONS.md`](DECISIONS.md); this table records one compact outcome per
eligible product decision so the process can earn, lose, or narrow its place.

## Method

- Window: next 20 eligible decisions or 14 days; extend once to 21 days only if
  fewer than 10 eligible decisions occur.
- Routes: mechanical skip · reversible solo · one-way Evidence plus one
  specialist.
- Cost: reviewer first-position and rebuttal turns. Do not infer time or token
  cost from commit counts.
- Delta: `unchanged`, `stopped`, `narrowed`, `redirected`, `evidence-bounded`,
  or `verification-strengthened` against the decision recorded before review.
- Later result: append a reopen, reversal, missed boundary, or observed outcome;
  never rewrite the original row.

## Acceptance and sunset

Keep the lighter route only if known one-way controls remain caught, no serious
local-first/schema/reputation/human-authority boundary is missed, at least 20%
of escalated reviews produce a material delta, and at least 80% of eligible
reversible changes avoid council. A specialist with no unique material
contribution across five calls leaves the default route.

## Runs

| # | Date | Decision | Pre-review | Route | Evidence / risk | Review turns | Delta | Later result |
|---:|---|---|---|---|---|---:|---|---|
| 0 | 2026-09-01 | Replace the universal PO score and default council | Improve rather than abolish; exact replacement undecided | legacy full council | observed + inferred / meaning | 10 | narrowed — activate a reversible 20-decision router pilot and retain the sovereignty brake | pending merge and live use |
