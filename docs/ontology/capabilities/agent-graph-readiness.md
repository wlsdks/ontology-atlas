---
slug: capabilities/agent-graph-readiness
kind: capability
title: Agent Graph Readiness
domain: views
dependencies: [capabilities/ontology-hub-mode-aware]
elements: [elements/operations-nav, src/features/vault-ontology/ui/LiveActivityIndicator.tsx, src/shared/lib/ontology-tree/agent-query-recipes.ts, src/shared/lib/ontology-tree/agent-readiness.ts, src/views/home/ui/TopologyAnalysisBar.tsx, src/views/ontology-edit/ui/RelationWriteConfirm.tsx, src/views/ontology-insights/ui/OntologyInsightsPage.tsx]
relates: [capabilities/mcp-server, capabilities/ontology-hub-mode-aware, domains/ai-agent-partner, domains/views]
---

`/ontology/insights` was the original home of this readiness surface (4-tab
reader-persona system: proof/collaboration/agent/census). The 2026-07 map
rebuild replaced that page with a fixed 3-tab dashboard (Overview / Relations /
Freshness, `src/views/ontology-insights/ui/OntologyInsightsPage.tsx`) plus a
single bottom `InsightsHandoffRow` per tab — the row's own code comment says
it "replaces the old 4-tab system's giant agent collaboration cockpit
(readiness/query-recipes/collaborator brief etc.)". The old
`InsightsQueryPackCockpit.tsx` / `InsightsInfoButton.tsx` components and the
`elements/insights-query-cockpit` node they backed are gone; do not reference
them from new nodes.

The underlying readiness/graph-DB apparatus did not fully disappear — it split:

- **Readiness surfaced on the topology hub, not insights.** `AgentReadinessGate`
  in `src/views/home/ui/TopologyAnalysisBar.tsx` now shows the agent-readiness
  chip strip (ready / preflight / review counts) on `/` and `/topology`'s
  overview panel, using its own `formatTopologyAgentReadinessSummary`
  (`src/views/home/lib/topology-analysis.ts`) — a separate, simpler
  implementation from the original `agent-readiness.ts` scorer.
- **Post-change sync gate survives widely.** `agent-readiness.ts`'s
  `buildAgentPostChangeSyncCliCommands` / `formatAgentPostChangeSyncPacket`
  are still the shared "run health/cycles/growth/maintenance/validate after a
  vault write" packet, consumed by `RelationWriteConfirm.tsx`,
  `RelationPostSaveHandoff.tsx`, `OntologyEditPage.tsx`,
  `TopologyAnalysisBar.tsx`, and `VaultToolsMenu.tsx`.
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