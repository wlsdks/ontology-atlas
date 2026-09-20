---
id: fd3d1a37-534b-43dc-a885-e9193918e096
date: 2026-09-20
---
## 2026-09-20 — Automations owns schedules; Map and Library own execution context

**Why**: The owner asked for recurring ACP calls that keep an ontology more precise, while the Library's existing automation is document and wiki analysis. Putting both schedules in separate surfaces would hide the relationship and make the user choose the wrong kind of automation.
**Prior**: Extends `2026-09-17-library-rounds-standing-scope-0e82da66-48d2-44f1-a923-82857d7a3710`, which keeps the app-open local clock, standing scope, and ontology-write refusal for Library rounds.
**Decision**: Add one desktop LNB destination at `/automations/` as the schedule manager with two lanes: Ontology and Documents. Map opens the Ontology lane with its current construction context; Library opens the Documents lane. An ontology schedule runs a bounded, read-only ACP refinement review and leaves a review packet in the local ledger. It never writes ontology files or calls `finalize_project_meaning`; the foreground Map construction lifecycle remains the only path to human-approved ontology writes.
**Dissent**: A single combined runner could make automation feel more powerful, but it would hide the different evidence and write boundaries. Keeping the lanes in one manager preserves discovery without collapsing their authority.
**Falsifier**: People schedule an ontology review and cannot find the resulting review packet or the path to inspect/apply it, or a scheduled pass writes an ontology file, finalizes meaning, or runs when no native folder is open. In that case the manager needs a persisted review queue or the scope must narrow further.
**Owner**: jinan
