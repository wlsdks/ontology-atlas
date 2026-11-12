---
id: 0f91c1c2-7d72-499d-b74d-9714a66dbc95
date: 2026-11-12
---
## 2026-11-12 — Records stop refusing work for their size, a design-spec edit or a non-feature title

**Why**: owner, 2026-11-12: remove harness that only gets in the way of development. Three record rules refused merges for form rather than harm: a byte and line ceiling on decision records, a census that demanded a decision record whenever a design primitive or ramp file moved, and `pnpm pr:land` refusing every `fix`, `perf` or `design` pull request without a change record or a `No change record:` line.
**Prior**: overturns the 24-line and 2,000-byte cap of 2026-09-02 "Every decision record is six fields on one screen" (the six fields stay), 2026-08-03 "Add a gate to 'changing the spec calls the system'", and the fix/perf/design half of the 2026-10-10 landing rule (commit 51760ce75); `pnpm design:route` still routes a `design-contract` change.
**Decision**: a decision record is a dated heading and the six fields Why, Prior, Decision, Dissent, Falsifier, Owner at any length; `pnpm decisions:check` triggers only on an added or removed route or a changed MCP/CLI contract; `pnpm pr:land` asks for a change record only when the title is `feat`; the pull request template is Summary and Test plan.
**Dissent**: the 2026-10-10 rule existed because release notes for v1.7.0 had to be rebuilt from pull request bodies; without the refusal a visible fix can again ship with no line in the changelog.
**Falsifier**: a visible `fix` ships that the owner later could not find in the changelog and missed; restore the refusal for `fix` titles.
**Owner**: stark
