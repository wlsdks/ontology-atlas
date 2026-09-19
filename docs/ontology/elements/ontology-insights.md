---
uid: 4f5ec185-5722-4ff2-854b-ab661168f65c
slug: elements/ontology-insights
kind: element
title: Ontology Insights
display_ko: 분석 화면
domain: domains/graph-modeling
path: src/views/ontology-insights
created_by: "agent:unknown"
---

## Definition

The Analysis workbench opens on a Brief across the ontology, the wiki, the harness, and agent activity, measured from the reader's last visit to this folder, and then answers seven further questions through Do next, Not held, Inventory, Connections, Boundaries, Growth, and Flow. One ACP conversation stays beside the tabs in the installed app; changing tabs preserves its draft and request origin. Explicit tab actions seat read-only questions, and the person owns Send.

## Evidence

- Primary implementation: src/views/ontology-insights/ui/OntologyInsightsPage.tsx#OntologyInsightsPage
- Brief panel: src/views/ontology-insights/ui/tabs/BriefTab.tsx#BriefTab
- Brief facts: src/views/ontology-insights/lib/brief/use-insights-brief.ts#useInsightsBrief
- Evidence dating: src-tauri/src/git.rs#git_paths_last_change
- Brief regression: tests/e2e/insights-brief.spec.ts
- Shared conversation: src/views/ontology-insights/ui/parts/InsightsAgentDock.tsx#InsightsAgentDock
- Prompt planning: src/views/ontology-insights/lib/insights-agent.ts#planInsightsAgentPrompt
- Layout regression: tests/e2e/insights-flow-scroll.spec.ts

## Includes

- A brief that states each core in three words, sums stale and unknown lines apart, and names the concept, file, and both dates behind a drift count.
- A flat Do-next list with one count, and Not held names with occurrence and requester facts.
- Derived inventory, connection, boundary, and freshness facts from the loaded ontology.
- One vault-and-runtime-scoped ACP dock with explicit draft replacement and browser copy fallback.
- An ephemeral, evidence-anchored Flow presentation with optional Map continuation.
- Available-width card reflow and 40px desktop scroll-end space.

## Excludes

- Automatic prompt submission or write approval triggered by tab navigation.
- A health score, grade, or percentage; and any claim that evidence is current where this session could not date it.
- The ACP process and permission boundary itself, owned by agent integration.
- Saved presentations or certification of the agent explanation as semantic truth.
