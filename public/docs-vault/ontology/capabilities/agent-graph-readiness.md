---
slug: capabilities/agent-graph-readiness
kind: capability
title: Agent Graph Readiness
display_ko: AI가 쓸 준비가 됐는지 점검
display_en: Is the Map Ready for AI
domain: views
dependencies: [capabilities/ontology-hub-mode-aware]
elements: [elements/app-settings-menu, src/entities/knowledge-graph/lib/relation-quality.ts, src/features/vault-ontology/ui/LiveActivityIndicator.tsx, src/shared/lib/ontology-tree/agent-query-recipes.ts, src/shared/lib/ontology-tree/agent-readiness.ts, src/views/ontology-insights/ui/OntologyInsightsPage.tsx, src/views/ontology-insights/ui/tabs/DoNextTab.tsx]
relates: [capabilities/mcp-server, domains/ai-agent-partner]
---

`/ontology/insights` was the original home of this readiness surface (4-tab
reader-persona system: proof/collaboration/agent/census). The 2026-07 map
rebuild replaced that page with a fixed 3-tab dashboard (Do next / Structure /
Freshness, `src/views/ontology-insights/ui/OntologyInsightsPage.tsx`) plus a
single bottom `InsightsHandoffRow` per tab — the row's own code comment says
it "replaces the old 4-tab system's giant agent collaboration cockpit
(readiness/query-recipes/collaborator brief etc.)". The old
`InsightsQueryPackCockpit.tsx` / `InsightsInfoButton.tsx` components and the
`elements/insights-query-cockpit` node they backed are gone; do not reference
them from new nodes.

The underlying readiness/graph-DB apparatus did not fully disappear — it split:

- **Readiness moved back to insights (W3 분석 보기 은퇴, 2026-07).** It briefly
  lived as `AgentReadinessGate` inside `TopologyAnalysisBar.tsx`'s overview
  panel; that panel body was retired (reader lens, handoff copy, and this
  readiness gate all duplicated what the map/INDEX/insights already showed).
  Readiness now surfaces at the top of `/ontology/insights`' Do next tab,
  followed by the repair queue (`DoNextTab`,
  `src/views/ontology-insights/ui/tabs/DoNextTab.tsx`). The
  classifier itself moved down to `classifyRelationQuality` +
  `summarizeAgentReadiness` in `src/entities/knowledge-graph/lib/relation-quality.ts`
  — the single source both `DoNextTab` and the topology map's
  `formatTopologyOverviewBrief` copy text (`views/home/lib/topology-analysis.ts`,
  now a thin re-export) read from, so the map's INDEX-footer handoff brief and
  the insights gauge cannot drift into two different readiness formulas.
- **The three views share a keyboard and URL contract (A17, 2026-07-25).**
  `src/shared/ui/tab-bar.tsx` uses roving tabindex: only the selected tab is in
  sequential focus order, Left/Right wraps, and Home/End jump to the first or
  last tab with automatic activation. `?tab=` remains the shareable source of
  truth; the page updates only that query through native history while
  preserving the locale pathname, so focus remains on the newly selected tab
  instead of dropping to the document root. The focused tab uses the design
  system's `--color-indigo-ring-a46` token as an inset ring so the horizontal
  scroll container cannot clip it, while `aria-controls` continues to bind it
  to the active `tabpanel`.
- **Post-change sync gate survives widely.** `agent-readiness.ts`'s
  `buildAgentPostChangeSyncCliCommands` / `formatAgentPostChangeSyncPacket`
  are still the shared "run health/cycles/growth/maintenance/validate after a
  vault write" packet, consumed by `RelationWriteConfirm.tsx`,
  `RelationPostSaveHandoff.tsx`, `OntologyEditPage.tsx`,
  `TopologyAnalysisBar.tsx`, and `VaultAgentSetupPanel.tsx` (the agent-setup
  panel merged into `AppSettingsMenu`, B2 2026-07).
- **The live-activity badge reuses the graph DB query pack.**
  `LiveActivityIndicator.tsx` (`src/features/vault-ontology/ui/`, shown on the
  topology hub) calls `buildAgentGraphDbQueryPack` and
  `formatAgentBusinessQuestionHandoff` from `agent-query-recipes.ts` to build
  its copyable business-question / graph-check packet — the only current UI
  caller of that module.
- **Everything else in `agent-query-recipes.ts` is currently dead code.** The
  recipe grid, run-order rail, traversal-strategy rail, investigation
  playbooks, and `buildAgentHandoffPrompt` / `buildAgentBriefingPacket` /
  `buildAgentQueryRecipes` exports have no UI, MCP, or CLI caller left after the
  insights rebuild (confirmed via repo-wide grep, 2026-07). They are not wired
  into any current page. This is flagged here rather than deleted — dead-code
  removal is a code-cleanup decision, not a vault decision.

The MCP/CLI side of agent readiness is unaffected by any of this: `agent_brief`,
`workspace_brief`, `health`, and the 14-check runtime graph DB gate
(`pnpm dogfood:graph-db`) are backend contracts served by `mcp/` and `cli/`
independent of which page renders them. Claude Code / Codex sessions should
keep treating those as the source of truth for readiness, not the removed
insights UI.
