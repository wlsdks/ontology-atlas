---
slug: elements/insights-query-cockpit
kind: element
title: Insights Query Cockpit
domain: views
capabilities: [capabilities/agent-graph-readiness, capabilities/agent-practitioner-concerns-map]
---

`src/views/ontology-insights/ui/parts/InsightsQueryPackCockpit.tsx` renders the first-viewport query cockpit for `/ontology/insights`. `src/views/ontology-insights/ui/parts/InsightsInfoButton.tsx` provides the shared explanation affordance for the page header, proof band, cockpit header, and proof metric cards.

`src/views/ontology-insights/ui/OntologyInsightsPage.tsx` now also renders a compact current-session proof strip before the query cockpit. The strip uses the same vocabulary as app settings: direct MCP proof means the live Claude Code/Codex session exposes `tools/list` with 24 tools, `index_project`, and callable `query_ontology`; CLI fallback proof means `pnpm cli:mcp-verify docs/ontology --timeout-ms 15000` only proves the local server and vault are healthy; a 23-tool inventory or missing `query_ontology` is treated as stale client cache/reload work.

The proof strip includes a copyable session proof packet for agents. It keeps the direct MCP first calls (`list_kinds`, `query_ontology` agent/workspace/health briefs), the CLI fallback command, and the stale-cache recovery note in one clipboard action so Claude Code or Codex can hand the exact verification contract to another run without retyping.

Together these pieces make the connection and verification screen read as a graph proof surface instead of a generic dashboard: first prove whether the current agent session is actually attached, then copy or run the graph DB query pack.