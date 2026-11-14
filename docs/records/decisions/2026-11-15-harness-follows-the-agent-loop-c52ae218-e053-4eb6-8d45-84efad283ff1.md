---
id: c52ae218-e053-4eb6-8d45-84efad283ff1
date: 2026-11-15
---
## 2026-11-15 — Harness Setup lists what an agent reads, what stops it and what checks it

**Why**: the owner could not tell why the Harness screen was a harness: its domain matrix, "gaps" verdict and coined words described the ontology, not the repository. Current practice (Böckeler, Hashimoto, HumanLayer, Osmani, Claude Code and Codex docs) names a harness as context, guardrails and verification, never by product domain.
**Prior**: overturns only the layout of `6a495b79` (domains by Told, Gated, Watched; gap count and copied request) and of `b9dba267` on this screen; the Analysis brief keeps the matrix. Keeps `8e69bcb5` (owner-selected direction C: one harness tab before a reading) and `8a2effcf` (evidence beside the list, no left-edge stripe), and "no score".
**Decision**: tabs Setup (`?view=overview`) and Architecture; `?view=guides` lands on Setup. Setup is one sentence, a tool filter, a problems strip only for a missing or unresolved hook script, Codex's AGENTS.md over 32 KiB or differing Claude and Codex copies, and three sections in loop order (Context, Guardrails, Verification) whose groups are real artefact names. A file opens the existing detail and paired diff. Groups come from the existing scan, which now keeps scope declarations without capability paths.
**Dissent**: direction C's case: only a reviewed ontology says what a part of the repository is for, and a list by artefact cannot show an unguarded domain. The Analysis brief keeps that count.
**Falsifier**: a person cannot say from Setup which file an agent reads at session start, or cannot find from it why a hook does not run.
**Owner**: Stark
