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

The role-question strip now adds a compact business signal to each reader preset, derived from the live ontology snapshot rather than route names or implementation paths. Planning sees domain/capability scale, marketing sees capability/evidence-node proof, leadership sees domain/relation impact shape, developers see evidence/relation coverage, and agents see readiness plus relation count. The strip also shows the shared `business-first · outcome -> domain -> capability -> element` lens before the graph operations, so the visible first action starts with business meaning rather than code paths. This keeps the first action grounded in business/product ontology evidence before the user opens lower-level graph DB query packs.

The graph DB query pack now includes a dedicated `business_questions` item. That
item runs domain node scans, domain coupling, and capability-to-element evidence
edge scans so the Query cockpit and copied CLI pack can answer the three shared
business ontology questions with graph evidence: which business/product boundary
changed, what capability claim a non-developer can discuss, and which
implementation evidence proves or disproves the claim.

The cockpit also exposes a copyable business decision brief for that item. The
brief keeps the `outcome -> domain -> capability -> element` read order, the three shared
business ontology questions, the scan/path evidence contract, the
`pnpm dogfood:graph-db` runtime gate, and the exact `business_questions` MCP/CLI
payloads in one handoff so a planner, marketer, leader, developer, or agent can
start from business meaning before citing implementation paths.

Those questions are now visible before the tabbed run-order details. The
business decision lane shows boundary, claim, and evidence questions with their
graph handles (`match_nodes + domain_matrix`, `capability claim`, and
`capability -> element`) plus the live `business_questions · MCP` payload count,
so the screen itself teaches the business-first query order instead of hiding it
inside the copied packet.

Each lane row also has a focused copy action. Boundary copies only the domain
`match_nodes` and `domain_matrix` payloads, while claim and evidence copy the
capability-to-element `match_edges` payloads, so an agent receives a bounded
handoff for the selected business ontology question instead of the full pack.

Each role question is also copyable as a small agent handoff packet. The copied packet keeps the reader role, business question, live signal, local app URL, the shared `business-first` ontology lens (`outcome -> domain -> capability -> element`, not paths/APIs/routes as the root), business extraction checks for boundary/capability/evidence, executable `query_ontology(...)` payloads for that role, matching `ontology-atlas ... [vault]` CLI fallback commands, `pnpm dogfood:graph-db`, and the scan/path evidence gate, so a planner or marketer can hand the exact question to Claude Code or Codex without translating UI labels into MCP work.

The collaborator brief copy packet now includes a reader decision lens before the meeting agenda. The exported markdown names the planning, marketing, leadership, developer, and agent questions that should be answered from the same graph evidence, so a person can paste the brief into a meeting or hand it to Claude Code/Codex without losing the business decision frame.

The page title avoids starting with "Graph DB cockpit" because that made the route sound like an internal agent console. The first-screen language now names the user's job: ask about hubs, paths, impact, and ownership; then keep MCP/CLI calls that reproduce the evidence. The graph DB machinery remains present in the payloads and run-order tabs, but it is introduced as a bounded question pack rather than as the page's primary identity.

The page still renders a compact current-session proof strip below the primary query/proof path. The strip uses the same vocabulary as app settings: direct MCP proof means the live Claude Code/Codex session exposes `tools/list` with 24 tools, `index_project`, and callable `query_ontology`; CLI fallback proof means `pnpm cli:mcp-verify docs/ontology --timeout-ms 15000` only proves the local server and vault are healthy; a 23-tool inventory or missing `query_ontology` is treated as stale client cache/reload work.

The proof strip includes a copyable session proof packet for agents. It keeps the direct MCP first calls (`list_kinds`, `query_ontology` agent/workspace/health briefs), the CLI fallback command, and the stale-cache recovery note in one clipboard action so Claude Code or Codex can hand the exact verification contract to another run without retyping.

That session proof packet now also carries the actual app surface and graph evidence gate. It names `tauri://localhost/ko/ontology/insights/`, requires `pnpm dogfood:graph-db`, and repeats the scan/path evidence contracts (`totalMatches`, `limited`, `followUp`, and `evidence.pathsComplete`) before graph rows or paths can be used as decision evidence.

Together these pieces make the connection and verification screen read as a question-and-evidence workbench instead of a generic dashboard or agent-only console: first ask small bounded questions, then prove whether the current agent session is actually attached, then copy or run the same MCP/CLI evidence pack.
