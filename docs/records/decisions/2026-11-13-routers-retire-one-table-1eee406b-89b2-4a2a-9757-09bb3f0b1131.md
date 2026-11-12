---
id: 1eee406b-89b2-4a2a-9757-09bb3f0b1131
date: 2026-11-13
---
## 2026-11-13 — One workflow table replaces the product and design routers

**Why**: the product route line appears in 13 of 100 eligible pull requests and the design route line in 11 of 100; no machine reads either output; both are lookup tables keyed by the agent's own classification of its change, so they add a step without adding a fact; and the pilot the `po:pilot` checker serves closed on 2026-09-26.
**Prior**: overturns 2026-09-26 "PO routing stays; the per-run pilot register stops" and the router-selection part of 2026-09-27 "One independent reviewer replaces the PO and design councils", whose one `reviewer` and lenses stand; 2026-09-26 "A copy-only change proves itself with one final capture" stands as the words-only row of `/ui-proof`.
**Decision**: delete `po:route`, `design:route`, `po:pilot`, their contracts and the `product-check` skill; the `AGENTS.md` workflow table names the one-way facts (public MCP, CLI or vault contract; a route added or removed; what leaves the machine; what an agent may write or approve; first-contact positioning) that take `pnpm decisions:find`, one `reviewer` and one decision record; `/ui-proof` carries the same proof classes as a table with `pnpm ui:look` as the look; a reviewer is due for a one-way change, a new or removed primary surface or a navigation or grouping change, or a security-surface path, and token or primitive changes get the rendered inventory instead.
**Dissent**: a router forces the builder to state facts before choosing a proof, and a table read by the same agent can be skipped silently; the counts say the router was skipped too, and a typed refusal no machine reads does not prevent that.
**Falsifier**: a one-way change ships without a reviewer, or a token or primitive change ships a regression on an audited route nobody captured.
**Owner**: Stark
