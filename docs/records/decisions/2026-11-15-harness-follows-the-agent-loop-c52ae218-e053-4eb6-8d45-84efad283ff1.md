---
id: c52ae218-e053-4eb6-8d45-84efad283ff1
date: 2026-11-15
---
## 2026-11-15 — Harness Setup lists what an agent reads, what stops it and what checks it

**Why**: the owner could not tell why the Harness screen was a harness: its domain matrix, gap verdict and coined words described the ontology, not the repository. Agent docs name a harness as context, guardrails and verification.
**Prior**: overturns on this screen `6a495b79` (at-a-glance table) and direction C, `b9dba267` (coverage matrix of areas); the Analysis brief keeps the matrix (`683f0641`). Keeps `e47518a9`: Claude and Codex trees are independent, so a differing copy is a neutral fact, never a problem. Keeps `8e69bcb5` (one tab before a reading), now true by construction, and `8a2effcf`.
**Decision**: tabs Setup (`?view=overview`) and Architecture; `?view=guides` lands on Setup. Setup lists every scanned file in Context, Guardrails or Verification, sorts hooks by one named-event table, and flags only a missing hook script or Codex's AGENTS.md over its default limit.
**Dissent**: this screen loses per-domain coverage and its "no check" count, tests found under a domain's paths, the last-changed column, the uncited-claim marker, unreached documents and the copied request. Only a reviewed ontology says what a part is for.
**Falsifier**: `buildHarnessSetup` over this repository's own scan leaves a scanned agent file in no section, or reports a Claude Code session size other than CLAUDE.md plus its always-loaded rules plus an imported AGENTS.md.
**Owner**: Stark
