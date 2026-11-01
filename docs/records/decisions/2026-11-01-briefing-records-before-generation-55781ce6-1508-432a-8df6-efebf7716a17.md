---
id: 55781ce6-1508-432a-8df6-efebf7716a17
date: 2026-11-01
---
## 2026-11-01 — Start an ungenerated briefing with recorded sources

**Why**: In the installed app the first reading view placed model and PR setup above all source records, leaving an empty report even when the period contained commits. The owner asked for a useful, less text-heavy development review surface.
**Prior**: Retains e33872d5-45ee-4545-ba0d-e91635ebc0b5's exclusive reading modes, one report column, explicit transfer and exact-source return; changes the first attention when no generated explanation exists.
**Decision**: Show a compact list of recorded commit and explicitly fetched PR originals first, with source identity and a direct original reader; put optional generation and PR retrieval after that list. Do not present author messages as verified behavior or unchecked PR counts as complete.
**Dissent**: An always-open two-column original reader reduces navigation for repeated inspection but consumes reading width and adds an empty panel before a selection; keep exclusive reading views unless a real review task shows otherwise.
**Falsifier**: Reopen if a reader cannot distinguish author records from verified behavior, loses their position after opening an original, or cannot find the summary and source-coverage actions without searching.
**Owner**: User delegated direction selection to Codex in this session.
