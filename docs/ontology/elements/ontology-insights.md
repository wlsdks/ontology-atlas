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

The Analysis workbench names its subject first: a segmented control picks the Brief across every core, the ontology's Concepts, the Wiki or the Guidance, and only Concepts opens a second row of seven questions (To fix, Missing concepts, Inventory, Relations, Domain boundaries, Accumulation, Product flow). The Brief measures from the reader's last visit to this folder; Wiki and Guidance are single views that re-read the model their own screens use and send every row there to act. One ACP conversation stays beside the tabs in the installed app; changing tabs preserves its draft and request origin. Explicit tab actions seat read-only questions, and the person owns Send.

## Evidence

- Visible loading boundary: src/views/ontology-insights/ui/InsightsPageEntry.tsx#InsightsPageEntry
- Primary implementation: src/views/ontology-insights/ui/OntologyInsightsPage.tsx#OntologyInsightsPage
- Brief panel: src/views/ontology-insights/ui/tabs/BriefTab.tsx#BriefTab
- Brief facts: src/views/ontology-insights/lib/brief/use-insights-brief.ts#useInsightsBrief
- Evidence dating: src-tauri/src/git.rs#git_paths_last_change
- Wiki panel: src/views/ontology-insights/ui/tabs/LibraryTab.tsx#LibraryTab
- Guidance panel: src/views/ontology-insights/ui/tabs/HarnessTab.tsx#HarnessTab
- Saved explanations: src/views/ontology-insights/lib/flow-history.ts#selectFlowVersions
- Two-level navigation: src/views/ontology-insights/lib/insights-tab-state.ts#coreOfTab
- Brief regression: tests/e2e/insights-brief.spec.ts
- Shared conversation: src/views/ontology-insights/ui/parts/InsightsAgentDock.tsx#InsightsAgentDock
- Prompt planning: src/views/ontology-insights/lib/insights-agent.ts#planInsightsAgentPrompt
- Layout regression: tests/e2e/insights-flow-scroll.spec.ts

## Includes

- Explicitly labelled examples distinguish the Wiki source-to-page-to-checks flow from Guidance code-area-to-instructions/gates/checks when measurements are unavailable. Reversible local disclosures explain setup and link to existing destinations without writes or fabricated counts.
- Guidance report state is scoped to the selected folder and source binding, showing reading state immediately while resolving a new binding instead of retaining results from the previous folder.
- A named loading destination painted before the analysis workbench loads and mounts; navigation remains available while its code loads. Graph derivation still runs on the main thread.
- A brief that states each core in three words, sums stale and unknown lines apart, and names the concept, file, and both dates behind a drift count.
- One bounded request that hands the drifted concepts to the tab's own agent, asking for a judgement and a proposed sentence and never for a write.
- Product flow read as versions: the written explanation, when and by whom, whether the folder moved since, and which scenes changed against the previous writing.
- A flat Do-next list with one count, and Not held names with occurrence and requester facts.
- Derived inventory, connection, boundary, and freshness facts from the loaded ontology.
- One vault-and-runtime-scoped ACP dock with explicit draft replacement and browser copy fallback.
- An ephemeral, evidence-anchored Flow presentation with optional Map continuation.
- Available-width card reflow and 40px desktop scroll-end space.

## Excludes

- Automatic prompt submission or write approval triggered by tab navigation.
- A health score, grade, or percentage; and any claim that evidence is current where this session could not date it.
- A second copy of the Library's or the Harness's own lists: those panels count from the same model and open those screens to act.
- The ACP process and permission boundary itself, owned by agent integration.
- Saved presentations or certification of the agent explanation as semantic truth.
