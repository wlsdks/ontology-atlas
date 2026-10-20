---
id: 2b766726-e643-4881-aabc-7b02fc7cc37a
date: 2026-10-21
---
## 2026-10-21 — Analysis keeps three sections: System relationships, Review summary, Wiki

**Why**: the owner called Written explanations unneeded and Guidance hastily made; Guidance drew a second, weaker picture of what Harness At a glance now counts by domain. Owner chose to cut it to three sections on 2026-10-20. Spec `docs/specs/2026-10-20-analysis-three-tabs.md`, Slice A.
**Prior**: retires the Guidance and Written explanations tabs; keeps `6a495b79` (At a glance owns told, gated and watched), `7cec2380` (the project board) and `488f9b25` (relationships and evidence). Saved runs under `.ontology-atlas/analyses/` stay readable from the agent panel and through MCP.
**Decision**: the tab bar holds connections, brief, library. `?tab=harness` replaces itself with `/architecture/?view=overview`, keeping other flags and adding no history entry; `?tab=flow` opens System relationships with a notice that names the retired tab and where its files stay. Nothing under `.ontology-atlas/` is written, moved or deleted.
**Dissent**: a person who read saved explanations inside Analysis now opens the agent panel or asks an agent, one step further.
**Falsifier**: the owner looks for saved explanations in Analysis and cannot find them from the notice, or At a glance misses a guidance fact the old tab showed.
**Owner**: Stark
