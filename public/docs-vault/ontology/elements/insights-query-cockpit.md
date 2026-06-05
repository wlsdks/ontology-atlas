---
slug: elements/insights-query-cockpit
kind: element
title: Insights Query Cockpit
domain: views
capabilities: [capabilities/agent-graph-readiness, capabilities/agent-practitioner-concerns-map]
---

# Insights Query Cockpit

`src/views/ontology-insights/ui/parts/InsightsQueryPackCockpit.tsx` renders the first-viewport query cockpit for `/ontology/insights`. `src/views/ontology-insights/ui/parts/InsightsInfoButton.tsx` provides the shared explanation affordance for the page header, proof band, cockpit header, and proof metric cards.

The cockpit keeps the graph DB query pack compact by splitting details into `status`, `run`, and `contracts` tabs. The first screen shows readiness, pack/MCP/CLI/runtime counts, a next-step prompt, and the `agent-practitioner-concerns-map` lens without expanding every result contract by default.

The `contracts` tab now carries an explicit agent execution gate rail. It maps the same `Context`, `Tools`, `Evidence`, `Drift`, and `Workflow` checks to concrete preflight gates: `agent_brief`, `/mcp` or `codex mcp list`, `relation_check`, `health` or `maintenance_plan`, and the `read-check-write-sync` loop. This keeps Claude Code/Codex guidance attached to the actual result-contract surface instead of living only in the connection popover.

The cockpit's proof details preserve the graph DB runtime contract: setup gate, runtime gate, self-check fields, scan contract, path contract, and copyable CLI/MCP fallback commands. Tests keep the tab density low and assert that the agent execution gates are visible when the result criteria tab is opened.