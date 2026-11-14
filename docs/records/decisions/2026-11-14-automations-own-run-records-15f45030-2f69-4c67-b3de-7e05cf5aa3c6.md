---
id: 15f45030-2f69-4c67-b3de-7e05cf5aa3c6
date: 2026-11-14
---
## 2026-11-14 — Automations owns document run history; Library drops its check-history tab
**Why**: The owner, on Library's check history, judged its design lacking and its place wrong: an Automations destination exists, so the record of what a schedule did belongs beside the schedule.
**Prior**: Overturns the Library half of `2026-09-20-automations-hub-schedules-fd3d1a37-534b-43dc-a885-e9193918e096.md` ("Map and Library own execution context"); its Map and ontology half, and the read-only ontology review boundary, stand unchanged.
**Decision**: Library keeps Sources, Wiki and Ontology. Automations' Documents lane draws the pass ledger as a Run history section below the schedule list, only once a document pass has run; `?round=<id>` narrows it to that schedule. The morning summary, the schedulable-checks list and their explanatory copy are removed, and `/library/?tab=rounds` replaces itself with `/automations/?kind=documents`, keeping `round`.
**Dissent**: The wiki pages a pass found stale are Library content, and the away summary told a returning person what changed without opening a schedule; Automations now reports runs, not page news.
**Falsifier**: If people returning to the folder miss stale or redrafted pages they would have seen in the away summary, or keep asking where a schedule's results went, give the Library a page-level signal for pass findings rather than restore the tab.
**Owner**: Project owner, 2026-11-14; applied by Claude
