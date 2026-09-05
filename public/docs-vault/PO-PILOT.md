---
started: 2026-09-01
decision_target: 20
decision_deadline: 2026-09-15
sparse_extension_deadline: 2026-09-22
outcome: adjust
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
| 3 | 2026-09-01 | Scope semantic evidence trust to the sections the agent can actually read | one-way | review | handoff | public-contract | truth=affected;transfer=unchanged;agent-write=unchanged;human-correction=unchanged | meaning | 2 | 0 | verification-strengthened | po-evidence+po-steward |
| 4 | 2026-09-02 | Human review marks move to the call path; drift is detected, not trusted | one-way | review | correct | public-contract | truth=affected;transfer=unchanged;agent-write=affected;human-correction=affected | meaning | 2 | 0 | narrowed | po-evidence+po-steward |
| 5 | 2026-09-02 | Make FDE project-owned or unavailable in construction qualification | one-way | review | judge | public-contract | truth=affected;transfer=unchanged;agent-write=affected;human-correction=affected | meaning | 2 | 2 | verification-strengthened | po-evidence+po-steward |
| 6 | 2026-09-02 | Align reviewed concept bodies with canonical persisted full reads | one-way | review | handoff | public-contract | truth=unchanged;transfer=affected;agent-write=affected;human-correction=unchanged | meaning | 2 | 0 | verification-strengthened | po-evidence+po-steward |
| 7 | 2026-09-02 | Split mixed semantic evidence into typed candidate and review units | one-way | review | handoff | public-contract | truth=affected;transfer=unchanged;agent-write=affected;human-correction=unchanged | meaning | 2 | 0 | verification-strengthened | po-evidence+po-steward |
| 8 | 2026-09-02 | Share the fixed semantic excerpt budget across every selected safe section | one-way | review | handoff | public-contract | truth=affected;transfer=unchanged;agent-write=affected;human-correction=unchanged | meaning | 2 | 0 | narrowed | po-evidence+po-steward |
| 9 | 2026-09-02 | Preserve exact repository case in semantic source addresses | one-way | review | handoff | public-contract | truth=affected;transfer=unchanged;agent-write=affected;human-correction=unchanged | meaning | 2 | 0 | verification-strengthened | po-evidence+po-steward |
| 10 | 2026-09-02 | Bind local app deployment to one exact bundle and its installed MCP behavior | one-way | review | handoff | public-contract | truth=affected;transfer=affected;agent-write=unchanged;human-correction=unchanged | meaning | 2 | 2 | redirected | po-evidence+po-steward |
| 11 | 2026-09-02 | Make Architecture an evidence-bound AI decision loop inside its own workbench | one-way | review | orient | positioning+substantial-investment | truth=unchanged;transfer=unchanged;agent-write=unchanged;human-correction=affected | meaning | 2 | 0 | evidence-bounded | po-evidence+po-steward |
| 12 | 2026-09-02 | Make compact task handoff honor persisted capability boundaries | one-way | review | handoff | public-contract | truth=unchanged;transfer=affected;agent-write=unchanged;human-correction=unchanged | meaning | 2 | 0 | narrowed | po-evidence+po-steward |
| 13 | 2026-09-03 | Preserve compact CLI bootstrap import review totals | one-way | review | judge | public-contract | truth=unchanged;transfer=affected;agent-write=unchanged;human-correction=unchanged | meaning | 2 | 0 | unchanged | none |
| 14 | 2026-09-03 | Close the download page's loop: repository and changelog links, a bookend download with the verification recipe, a phone-first winner | two-way | solo | judge | rollback-cheap | truth=unchanged;transfer=unchanged;agent-write=unchanged;human-correction=unchanged | none | 0 | 0 | unchanged | none |
| 15 | 2026-09-03 | The map becomes the ground of the download page's first screen, answers the pointer, and carries a scroll camera; the mascot leaves the hero | two-way | solo | orient | rollback-cheap | truth=unchanged;transfer=unchanged;agent-write=unchanged;human-correction=unchanged | none | 0 | 0 | unchanged | none |
| 16 | 2026-09-03 | The download hero rises inside half a second, hands off by view angle, and shows a phone three tiers | two-way | solo | orient | rollback-cheap | truth=unchanged;transfer=unchanged;agent-write=unchanged;human-correction=unchanged | none | 0 | 0 | unchanged | none |
| 17 | 2026-09-03 | Remove Architecture demo chrome and make evidence comparison the workbench | two-way | solo | judge | rollback-cheap | truth=unchanged;transfer=unchanged;agent-write=unchanged;human-correction=unchanged | none | 0 | 0 | unchanged | none |
| 18 | 2026-09-03 | Choose the comparison ladder by height, seat sentences on arrows, and let the person choose the agent task | one-way | review | judge | rollback-cheap+surface-inventory | truth=unchanged;transfer=unchanged;agent-write=unchanged;human-correction=affected | meaning | 2 | 0 | narrowed | po-steward |
| 19 | 2026-09-03 | Localize role summaries as summary_<role>_<locale> with per-profile parse isolation | one-way | review | explain | public-contract+rollback-cheap | truth=unchanged;transfer=unchanged;agent-write=unchanged;human-correction=unchanged | meaning | 2 | 0 | narrowed | po-evidence+po-steward |
| 20 | 2026-09-03 | Every drawn map node reserves its disc so a passive label never paints across a neighbouring shape | two-way | solo | explain | rollback-cheap | truth=unchanged;transfer=unchanged;agent-write=unchanged;human-correction=unchanged | none | 0 | 0 | unchanged | none |
| 21 | 2026-09-04 | A stale receipt may emit coordinates the live source verifies, and a capability's own name is part of its claim | one-way | review | orient | public-contract+rollback-cheap | truth=unchanged;transfer=unchanged;agent-write=unchanged;human-correction=unchanged | meaning | 2 | 0 | narrowed | po-evidence+po-steward |
| 22 | 2026-09-04 | A CLI exit code says whether the input could be answered, not whether the answer is empty | one-way | review | handoff | public-contract+rollback-cheap | truth=unchanged;transfer=unchanged;agent-write=unchanged;human-correction=unchanged | meaning | 2 | 0 | narrowed | po-evidence+po-steward |
| 23 | 2026-09-04 | An ontology change re-checks the witnesses the current graph declares, not only the recorded ones | one-way | review | orient | public-contract+rollback-cheap | truth=unchanged;transfer=unchanged;agent-write=unchanged;human-correction=unchanged | meaning | 2 | 0 | unchanged | none |
| 24 | 2026-09-04 | A named claim selects the task capability; prose corroborates and a capability keeps its own name | two-way | solo | handoff | rollback-cheap | truth=unchanged;transfer=unchanged;agent-write=unchanged;human-correction=unchanged | none | 0 | 0 | unchanged | none |
| 25 | 2026-09-05 | A session mode is judged by the class the adapter states, not only its name, and a moved session is announced | one-way | review | correct | rollback-cheap | truth=unchanged;transfer=unchanged;agent-write=affected;human-correction=affected | meaning | 2 | 0 | narrowed | po-evidence+po-steward |
| 26 | 2026-09-05 | An agent's lookups stand above its answer, and the folder keeps a list of names it was asked for and does not hold | one-way | review | judge | rollback-cheap+surface-inventory | truth=unchanged;transfer=unchanged;agent-write=unchanged;human-correction=affected | meaning | 2 | 0 | narrowed | po-evidence+po-steward |

| 27 | 2026-09-05 | Clarify existing agent authorization and verification scope; make hook recovery executable | two-way | solo | handoff | rollback-cheap | truth=unchanged;transfer=unchanged;agent-write=unchanged;human-correction=unchanged | none | 0 | 0 | unchanged | none |

| 28 | 2026-09-05 | Remove contradictory and excessive skill procedure while preserving evidence and approval boundaries | two-way | solo | handoff | rollback-cheap | truth=unchanged;transfer=unchanged;agent-write=unchanged;human-correction=unchanged | none | 0 | 0 | unchanged | none |

## Outcome updates

| Run | Date | Recovery proof | Owner clear | Boundary miss | Later result |
|---:|---|---|---|---|---|
| 1 | 2026-09-01 | pending | pending | pending | pending |
| 1 | 2026-09-01 | pass | pending | no | pending |
| 2 | 2026-09-01 | pending | pending | pending | pending |
| 2 | 2026-09-01 | pass | pending | no | held |
| 3 | 2026-09-01 | pending | yes | no | pending |
| 4 | 2026-09-02 | pass | pending | no | pending |
| 5 | 2026-09-02 | pass | yes | no | pending |
| 6 | 2026-09-02 | pass | yes | no | pending |
| 7 | 2026-09-02 | pending | yes | no | pending |
| 7 | 2026-09-02 | fail-caught | yes | no | reopened |
| 8 | 2026-09-02 | pending | yes | no | pending |
| 8 | 2026-09-02 | pending | yes | no | held |
| 9 | 2026-09-02 | pending | yes | no | pending |
| 8 | 2026-09-02 | pass | yes | no | held |
| 9 | 2026-09-02 | pass | yes | no | held |
| 10 | 2026-09-02 | pending | yes | no | pending |
| 10 | 2026-09-02 | pass | yes | no | held |
| 11 | 2026-09-02 | pending | pending | no | pending |
| 11 | 2026-09-02 | pass | pending | no | pending |
| 12 | 2026-09-02 | pending | yes | no | pending |
| 12 | 2026-09-02 | pass | yes | no | held |
| 13 | 2026-09-03 | pending | yes | no | pending |
| 13 | 2026-09-03 | pass | yes | no | held |
| 14 | 2026-09-03 | pass | pending | no | pending |
| 15 | 2026-09-03 | pending | pending | no | pending |
| 15 | 2026-09-03 | pass | pending | no | pending |
| 16 | 2026-09-03 | pending | pending | no | pending |
| 17 | 2026-09-03 | pending | yes | no | pending |
| 17 | 2026-09-03 | pass | yes | no | held |
| 18 | 2026-09-03 | pending | yes | no | pending |
| 19 | 2026-09-03 | pending | yes | no | pending |
| 20 | 2026-09-03 | pending | yes | no | pending |
| 21 | 2026-09-04 | pending | yes | no | pending |
| 22 | 2026-09-04 | pending | yes | no | pending |
| 23 | 2026-09-04 | pending | yes | no | pending |
| 24 | 2026-09-04 | pending | yes | no | pending |
| 25 | 2026-09-05 | pending | yes | no | pending |
| 26 | 2026-09-05 | pending | yes | no | pending |
| 27 | 2026-09-05 | pass | yes | no | pending |
| 28 | 2026-09-05 | pass | yes | no | pending |
