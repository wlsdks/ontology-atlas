---
id: b9dba267-d755-4ad5-b854-6f930c7e5922
date: 2026-09-13
---
## 2026-09-13 — The Harness tab's spine is a coverage matrix of the repository's own areas

**Why**: owner chose direction C of `directions-harness-2.md`. Every tool here scores a repository from its files (`microsoft/agentrc`, 1,061 stars); the team that audited theirs across 21 repositories found it rated an official reference implementation the same as an abandoned toy, because files cannot tell "missing" from "correctly absent". Only a reviewed vault says what a part of a repository is **for**. `po-route: one-way · risk=meaning · po-evidence,po-steward`.
**Prior**: `3a63ada4` made this Harness with three peer views defaulting to `structure`; `9ba7d7be` gave the ladder the card's width. Both stand; only the spine is overturned, and the older reason is kept — `?focus=` still opens the ladder, and `?view=sensors`, which named this question and called it unbuilt, opens the answer.
**Decision**: rows are the vault's domains, columns Told, Gated, Watched. A file lands in an area when a path **it declares** reaches a path the vault records there: a nested `AGENTS.md`'s folder, a rule's `paths:`, a hook script's anchored filter, a check command's arguments, a workflow's trigger filter. A file's own location is never used; all 122 sit at the root anyway. Anything declaring no path stands once above the matrix. Every entry cites the text that put it there; an empty cell is a sentence beside the vault's record of the area's purpose. **No score, grade, level or percentage.** Authored Markdown also splits by whether a guide names it, by citation and never by glob. Read-only.
**Dissent**: Gated is nearly uniform here — `pre-push` reaches all eight areas, twenty gates declare no path — so it can read as decoration. Kept, because "one path-scoped gate covers your areas, the rest guard actions" is the true reading. Fallback: merge Gated into Watched.
**Falsifier**: a number that reads as a verdict; a cell not traceable to the line that filled it; an empty cell read as a fault; a repository whose areas and scopes describe different trees.
**Owner**: jinan
