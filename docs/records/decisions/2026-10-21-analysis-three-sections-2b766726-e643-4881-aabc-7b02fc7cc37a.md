---
id: 2b766726-e643-4881-aabc-7b02fc7cc37a
date: 2026-10-21
---
## 2026-10-21 — Analysis keeps three sections: System relationships, Review summary, Wiki

**Why**: the owner called Written explanations unneeded and Guidance hastily made; Guidance drew a weaker picture of what Harness At a glance now counts by domain. The owner chose three sections on 2026-10-20. Spec `docs/specs/2026-10-20-analysis-three-tabs.md`, Slice A.
**Prior**: overturns 2026-09-04 "Flow presentations are verified projections of one ACP turn" (`docs/DECISIONS.md` ~:5549), which kept Analysis > Flow as the entry to saved explanations: the entry goes, the runs stay. Overturns `e26f2d5b`, the measured Guidance presentation, whose code is deleted. Narrows `488f9b25`'s Analysis supporting records from four to two (Review summary, Wiki). Keeps `6a495b79` (At a glance owns told, gated, watched) and `7cec2380` (the project board).
**Decision**: the tab bar holds connections, brief, library. `?tab=harness` replaces itself with `/architecture/?view=overview`, keeping other flags and adding no history entry. `?tab=flow` opens System relationships with a notice naming the retired tab; it counts the runs the old tab listed and says where to read them. Nothing under `.ontology-atlas/` is written, moved or deleted. The map's `?ask=business-flow` presentation is now reachable only by address and is the next removal candidate; it stays.
**Dissent**: the browser loses its only in-Atlas reader of the archive; the agent panel that still reads it exists only in the macOS app, so a person on the web reads saved explanations only through a coding agent over MCP. The notice says so.
**Falsifier**: the owner looks for saved explanations in Analysis and cannot find them from the notice, or Harness (At a glance or Guides) misses a guidance fact the old Guidance tab showed.
**Owner**: Stark
