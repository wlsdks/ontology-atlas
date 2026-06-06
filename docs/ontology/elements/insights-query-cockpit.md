---
slug: elements/insights-query-cockpit
kind: element
title: Insights Query Cockpit
domain: views
capabilities: [capabilities/agent-graph-readiness, capabilities/agent-practitioner-concerns-map]
---

`src/views/ontology-insights/ui/parts/InsightsQueryPackCockpit.tsx` renders the first-viewport question/evidence surface for `/ontology/insights`. `src/views/ontology-insights/ui/parts/InsightsInfoButton.tsx` provides the shared explanation affordance for the page header, evidence gate, question-pack header, and proof metric cards.

`src/views/ontology-insights/ui/OntologyInsightsPage.tsx` keeps the proof tab ordered around the user-visible wedge: ask the graph, then verify the evidence. Focused node proof links and the bounded question pack appear before supporting session-proof material. On mobile this keeps the bounded query pack and focused proof shortcut in the first screen, so planners, decision-makers, developers, and agents can see how the ontology becomes executable evidence before reading the longer setup explanation.

The desktop/tablet first screen now includes a quiet role-question strip in `OntologyInsightsPage.tsx`. It does not add another dashboard card; it names the first question each reader should ask over the same graph: planning checks vocabulary boundaries, marketing checks capability evidence, leadership checks ownership and impact, developers check implementation proof, and agents check MCP/CLI replay evidence. The strip stays off the mobile first screen so the focused proof rail and bounded query cockpit still appear above the bottom navigation. This dogfood pass used Atlas MCP (`list_kinds`, `validate_vault`) and CodeGraph (`codegraph_context`) before editing, which made the change smaller: the existing `reader` URL contract already mapped stakeholders to tabs, so the UI only needed to expose that ontology workflow instead of inventing a new feature surface.

The page title avoids starting with "Graph DB cockpit" because that made the route sound like an internal agent console. The first-screen language now names the user's job: ask about hubs, paths, impact, and ownership; then keep MCP/CLI calls that reproduce the evidence. The graph DB machinery remains present in the payloads and run-order tabs, but it is introduced as a bounded question pack rather than as the page's primary identity.

The page still renders a compact current-session proof strip below the primary query/proof path. The strip uses the same vocabulary as app settings: direct MCP proof means the live Claude Code/Codex session exposes `tools/list` with 24 tools, `index_project`, and callable `query_ontology`; CLI fallback proof means `pnpm cli:mcp-verify docs/ontology --timeout-ms 15000` only proves the local server and vault are healthy; a 23-tool inventory or missing `query_ontology` is treated as stale client cache/reload work.

The proof strip includes a copyable session proof packet for agents. It keeps the direct MCP first calls (`list_kinds`, `query_ontology` agent/workspace/health briefs), the CLI fallback command, and the stale-cache recovery note in one clipboard action so Claude Code or Codex can hand the exact verification contract to another run without retyping.

Together these pieces make the connection and verification screen read as a question-and-evidence workbench instead of a generic dashboard or agent-only console: first ask small bounded questions, then prove whether the current agent session is actually attached, then copy or run the same MCP/CLI evidence pack.
