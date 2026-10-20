---
id: 2b766726-e643-4881-aabc-7b02fc7cc37a
date: 2026-10-21
---
## 2026-10-21 — Analysis keeps three sections: System relationships, Review summary, Wiki

**Why**: the owner called Written explanations unneeded and Guidance hastily made; Guidance drew a second, weaker picture of what Harness At a glance now counts by domain. Owner chose to cut it to three sections on 2026-10-20. Spec `docs/specs/2026-10-20-analysis-three-tabs.md`, Slice A.
**Prior**: overturns three records. 2026-09-04 "Flow presentations are verified projections of one ACP turn" (`docs/DECISIONS.md`, ~:5549) kept Analysis > Flow as the entry to saved explanations; the entry goes and the saved runs stay. `e26f2d5b`, the measured Guidance presentation, is overturned because its code is deleted and Harness At a glance now shows what it showed. `488f9b25` narrows Analysis supporting records from four to two (Review summary and Wiki). It keeps `6a495b79` (At a glance owns told, gated and watched) and `7cec2380` (the project board). Saved runs under `.ontology-atlas/analyses/` stay readable from the agent panel and through MCP.
**Decision**: the tab bar holds connections, brief, library. `?tab=harness` replaces itself with `/architecture/?view=overview`, keeping other flags and adding no history entry; `?tab=flow` opens System relationships with a notice that names the retired tab and, from the runs the old tab listed, counts the saved explanations and says where to read them. Nothing under `.ontology-atlas/` is written, moved or deleted.
**Dissent**: the browser loses its only in-Atlas reader of the archive, and the agent panel that still reads it exists only in the macOS app. A person on the web can now read saved explanations only by asking a coding agent through MCP. The notice on the old address says so.
**Falsifier**: the owner looks for saved explanations in Analysis and cannot find them from the notice, or Harness (At a glance or Guides) misses a guidance fact the old Guidance tab showed.
The map's business-flow presentation (`?ask=business-flow`) is now reachable only by address and is the next removal candidate; this decision does not remove it.
**Owner**: Stark
