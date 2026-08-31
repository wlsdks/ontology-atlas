# Screening grades — 2026-08-31-gb-r3

> **This is a model-graded screening pass, not the human grading the rubric asks for.**
> It was produced by the same assistant that built the scoring split. It read the
> shuffled packet in `2026-08-31-gb-r3-blind-packet.md` and saved these grades
> before opening the key. Two limits are structural and cannot be argued away:
> the grader is not a person, and an answer written with a vault names its
> concepts while an answer written without one does not, so the two sides are
> often recognisable from wording alone. Read this as a pointer to where to
> look, and replace it when a person grades the same packet.

Criteria: [`rubric.md`](../rubric.md). Correctness 0–3; citations, boundary and
next step 0–2; unsupported claims counted, lower is better.

| Cell | Subject | Question | Side | Correct | Citations | Boundary | Next step | Unsupported |
|---|---|---|---|---:|---:|---:|---:|---:|
| C01 | brownfield | B1 | without | 3 | 2 | 2 | 2 | 0 |
| C02 | greenfield | G2 | without | 2 | 2 | 2 | 2 | 0 |
| C03 | brownfield | B2 | without | 3 | 2 | 2 | 2 | 0 |
| C04 | brownfield | B1 | with Atlas | 3 | 2 | 2 | 2 | 0 |
| C05 | greenfield | G2 | with Atlas | 3 | 2 | 2 | 2 | 0 |
| C06 | brownfield | B1 | without | 3 | 2 | 2 | 2 | 0 |
| C07 | brownfield | B2 | without | 2 | 2 | 2 | 2 | 0 |
| C08 | brownfield | B2 | without | 3 | 2 | 2 | 2 | 0 |
| C09 | brownfield | B1 | without | 1 | 2 | 1 | 1 | 1 |
| C10 | greenfield | G1 | with Atlas | 3 | 2 | 2 | 2 | 0 |
| C11 | greenfield | G2 | with Atlas | 3 | 2 | 2 | 2 | 0 |
| C12 | brownfield | B2 | with Atlas | 3 | 2 | 2 | 2 | 0 |
| C13 | brownfield | B1 | with Atlas | 3 | 2 | 2 | 2 | 0 |
| C14 | brownfield | B1 | with Atlas | 2 | 2 | 2 | 1 | 0 |
| C15 | greenfield | G1 | without | 3 | 2 | 2 | 2 | 0 |
| C16 | greenfield | G1 | without | 3 | 2 | 2 | 2 | 0 |
| C17 | greenfield | G2 | with Atlas | 3 | 2 | 2 | 2 | 0 |
| C18 | brownfield | B2 | with Atlas | 3 | 2 | 2 | 2 | 0 |
| C19 | greenfield | G1 | without | 3 | 2 | 2 | 2 | 0 |
| C20 | greenfield | G1 | with Atlas | 2 | 2 | 2 | 1 | 0 |
| C21 | greenfield | G2 | without | 2 | 2 | 2 | 2 | 0 |
| C22 | greenfield | G1 | with Atlas | 3 | 2 | 2 | 2 | 0 |
| C23 | brownfield | B2 | with Atlas | 3 | 2 | 2 | 2 | 0 |
| C24 | greenfield | G2 | without | 2 | 2 | 2 | 2 | 0 |

## Averages

| Side | Correct | Citations | Boundary | Next step | Unsupported |
|---|---:|---:|---:|---:|---:|
| without Atlas | 2.5 | 2 | 1.917 | 1.917 | 0.083 |
| with Atlas | 2.833 | 2 | 2 | 1.833 | 0 |

## Correctness by question

| Question | What it asked | Without Atlas | With Atlas |
|---|---|---:|---:|
| G1 | who should own a new discount rule, and what to read first | 3 | 2.667 |
| G2 | should reconciliation move into checkout, and what is the recorded relation | 2 | 3 |
| B1 | what an acknowledgement change touches, and what is only declared | 2.333 | 2.667 |
| B2 | where permission evaluation belongs, and what to verify next | 2.667 | 3 |

## Note on every cell

- **C01** · brownfield / B1 / without Atlas · correctness 3 — Coordination correct; names capabilities in prose. Recorded-vs-proven distinction stated correctly. Docs-first read order is defensible when the packages are empty.
- **C02** · greenfield / G2 / without Atlas · correctness 2 — Right answer; describes the dependency in its own words rather than as a recorded relation.
- **C03** · brownfield / B2 / without Atlas · correctness 3 — Correct placement, states the exclusion outright, concrete next verification.
- **C04** · brownfield / B1 / with Atlas · correctness 3 — Names all three capabilities, quotes both recorded dependencies with their rationale, reads apps/web first which matches the asked capability.
- **C05** · greenfield / G2 / with Atlas · correctness 3 — Typed relation, quoted reason, both exclusions, honest that no test path is recorded.
- **C06** · brownfield / B1 / without Atlas · correctness 3 — Same shape as C01. Correct, prose capability names, honest about unproven runtime impact.
- **C07** · brownfield / B2 / without Atlas · correctness 2 — Correct placement but calls the package itself the capability, conflating a deliverable with a responsibility.
- **C08** · brownfield / B2 / without Atlas · correctness 3 — Correct placement, states the exclusion outright.
- **C09** · brownfield / B1 / without Atlas · correctness 1 — Invents capability names by borrowing the Access Control permission verbs: calls 'coordinate' and 'read' capabilities of Coordination. Next action just restates the read order.
- **C10** · greenfield / G1 / with Atlas · correctness 3 — Correct, and labels each read by provenance: which path is a recorded anchor and which was source-discovered.
- **C11** · greenfield / G2 / with Atlas · correctness 3 — Typed relation with quoted reason, both exclusions, separate source anchors.
- **C12** · brownfield / B2 / with Atlas · correctness 3 — Bidirectional exclusion plus the most concrete verification path: check consumers do not reimplement the rules.
- **C13** · brownfield / B1 / with Atlas · correctness 3 — Names the chain with rationale, anchors each capability, reads apps/web first.
- **C14** · brownfield / B1 / with Atlas · correctness 2 — Complete content, but reads packages/realtime before apps/web for an acknowledgement question, contradicting the anchor it just cited.
- **C15** · greenfield / G1 / without Atlas · correctness 3 — Owner correct, names the two relevant paths, refuses to invent a pricing capability without requirements.
- **C16** · greenfield / G1 / without Atlas · correctness 3 — Owner correct. Second read is cart-summary, the surface a discount actually changes. Seven specific unknowns.
- **C17** · greenfield / G2 / with Atlas · correctness 3 — Both inclusion/exclusion sets plus the typed relation and its quoted reason.
- **C18** · brownfield / B2 / with Atlas · correctness 3 — States the exclusion in both directions: Coordination excludes permissions and Access Control excludes decision content.
- **C19** · greenfield / G1 / without Atlas · correctness 3 — Owner correct, rules out theme-toggle explicitly, unusually specific unknowns.
- **C20** · greenfield / G1 / with Atlas · correctness 2 — Right owner but hedged to provisional, and never considers the cart-summary display surface; second read goes to inventory-sync instead.
- **C21** · greenfield / G2 / without Atlas · correctness 2 — Right answer; relation paraphrased rather than recorded.
- **C22** · greenfield / G1 / with Atlas · correctness 3 — Owner and exclusion correct; conditions cart-summary on whether the rule touches display.
- **C23** · brownfield / B2 / with Atlas · correctness 3 — Bidirectional exclusion plus corroboration from the product docs.
- **C24** · greenfield / G2 / without Atlas · correctness 2 — Right answer and boundary, but the question asked for the recorded relationship; it supplies the product goal instead, because no typed relation exists in the prose.
