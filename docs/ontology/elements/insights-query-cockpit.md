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

The role-question strip now adds a compact business signal to each reader preset, derived from the live ontology snapshot rather than route names or implementation paths. Planning sees domain/capability scale, marketing sees capability/evidence-node proof, leadership sees domain/relation impact shape, developers see evidence/relation coverage, and agents see readiness plus relation count. The strip shows the same read order as a plain visible label — outcome, domain, capability, implementation evidence — before graph operations, so the visible first action starts with business meaning rather than code paths. The copied handoff still keeps the exact `business-first` policy and `outcome -> domain -> capability -> element` contract for agents.

The graph DB query pack now includes a dedicated `business_questions` item. That
item runs outcome facets, domain node scans, domain coupling, and
capability-to-element evidence edge scans so the Query cockpit and copied CLI
pack can answer the four shared business ontology questions with graph evidence:
which outcome the ontology should explain or improve, which business/product
boundary changed, what capability claim a non-developer can discuss, and which
implementation evidence proves or disproves the claim.

The cockpit also exposes a copyable business decision brief for that item. The
brief keeps the `outcome -> domain -> capability -> element` read order, the four shared
business ontology questions, the scan/path evidence contract, the
`pnpm dogfood:graph-db` runtime gate, and the exact `business_questions` MCP/CLI
payloads in one handoff so a planner, marketer, leader, developer, or agent can
start from business meaning before citing implementation paths.

Those questions are now visible before the tabbed run-order details, but the
lane no longer renders four full explanation cards at once. It shows four
compact choices — outcome, boundary, claim, and evidence — then opens only the
selected question, its copy action, and an optional answer-criteria disclosure.
This follows progressive disclosure: a reviewer can see the business-first
order immediately without parsing every rubric, while agents still receive the
bounded handoff for the selected question. The exact `facets`, `domain_matrix`,
`match_nodes`, and `capability -> element match_edges` operations stay inside
the copied handoff payloads and desktop chunk contract.

Each visible business question now includes an answer acceptance criterion, but
the criterion is hidden behind "Show answer criteria" / "답변 기준 보기" until the
reviewer asks for it. The selected question must name the outcome, boundary,
human capability claim, or proof verdict with graph evidence before it can be
treated as a business ontology answer. This gives non-developer reviewers and
agents the same rubric without turning the default surface into a checklist dump.

The lane exposes one focused copy action for the selected question. Boundary
copies only the domain `match_nodes` and `domain_matrix` payloads, outcome
copies `facets` and `domain_matrix`, while claim and evidence copy the
capability-to-element `match_edges` payloads, so an agent receives a bounded
handoff for the selected business ontology question instead of the full pack.
The copied handoff includes the same acceptance criterion so a pasted Claude
Code or Codex task can be reviewed against the visible app rubric.

Each role question is also copyable as a small agent handoff packet. The visible
role cards now use plain labels such as "map terms and boundaries" or "AI
evidence" instead of rendering raw graph operation names like
`facets + domain_matrix`, `match_nodes + lineage`, or `agent_brief + health`.
The copied packet keeps those exact operations, the reader role, business
question, live signal, local app URL, the shared `business-first` ontology lens
(`outcome -> domain -> capability -> element`, not paths/APIs/routes as the
root), business extraction checks for boundary/capability/evidence, executable
`query_ontology(...)` payloads for that role, matching
`ontology-atlas ... [vault]` CLI fallback commands, `pnpm dogfood:graph-db`, and
the scan/path evidence gate, so a planner or marketer can hand the exact
question to Claude Code or Codex without translating UI labels into MCP work.

The collaborator brief copy packet now includes a reader decision lens before the meeting agenda. The exported markdown names the planning, marketing, leadership, developer, and agent questions that should be answered from the same graph evidence, so a person can paste the brief into a meeting or hand it to Claude Code/Codex without losing the business decision frame.

The page title avoids starting with "Graph DB cockpit" because that made the
route sound like an internal agent console. The first-screen language now names
the user's job: ask about boundaries, impact, and ownership; then keep calls
that reproduce the evidence. The graph DB machinery remains present in the
payloads and run-order tabs, but it is introduced as a bounded question pack
rather than as the page's primary identity.

The tabbed details now keep the same rule. The visible metric rail says readiness,
check order, AI checks, terminal checks, and runtime checks instead of leading
with MCP, CLI, payloads, or contracts. The run-order tab now reads as a check
order, and the result panel opens runnable checks only when needed rather than
front-loading execution gates.
The copied payloads, command names, and result fields still stay inside copy
actions and code snippets. This keeps the macOS app readable as a product
workbench first, while agents still receive precise graph DB evidence contracts
when they ask for them.

The status tab now treats the AI check criteria the same way. The default view
shows a small "5 criteria" summary so people know the agent judgment map exists,
but the context/tool/evidence/drift/workflow cards render only after opening the
AI judgment criteria disclosure. This keeps the first screen focused on the
business question and graph status while preserving the full agent checklist on
demand.

The visible business question lane follows the same simplification. It now says
decision questions instead of business decision lane, and the implementation
evidence criterion asks for evidence rows rather than proof rows. The underlying
business_questions payload still requires followUp and
proves/disproves/needs-review verdicts, but the screen starts with language a
planner or marketer can read before handing the exact check to an AI agent.

The role-based question presets use the same progressive disclosure rule. The
first row keeps planning, marketing, leadership, developer, and AI as compact
role selectors, while only the selected role shows its business signal, readable
operation label, and copy action. This keeps the first viewport from repeating
five evidence cards at once, but the copied handoff still carries the full
business lens, MCP payloads, CLI fallback, and graph evidence gate.

The page still renders a compact current-session check strip below the primary
query/proof path. Its first layer now shows only the three checks a person needs
to recognize: current AI session, terminal fallback, and stale cache. The exact
criteria sit behind a "show details" disclosure so the screen starts with
orientation, not a wall of tool contracts. The underlying contract is unchanged:
the live Claude Code/Codex session must expose `tools/list` with 24 tools,
`index_project`, and callable `query_ontology`;
`pnpm cli:mcp-verify docs/ontology --timeout-ms 15000` only proves the local
server and vault are healthy; a 23-tool inventory or missing `query_ontology` is
treated as stale client cache/reload work.

The proof strip includes a copyable session proof packet for agents. It keeps the direct MCP first calls (`list_kinds`, `query_ontology` agent/workspace/health briefs), the CLI fallback command, and the stale-cache recovery note in one clipboard action so Claude Code or Codex can hand the exact verification contract to another run without retyping.

That session proof packet now also carries the actual app surface and graph evidence gate. It names `tauri://localhost/ko/ontology/insights/`, requires `pnpm dogfood:graph-db`, and repeats the scan/path evidence contracts (`totalMatches`, `limited`, `followUp`, and `evidence.pathsComplete`) before graph rows or paths can be used as decision evidence.

Together these pieces make the connection and verification screen read as a question-and-evidence workbench instead of a generic dashboard or agent-only console: first ask small bounded questions, then prove whether the current agent session is actually attached, then copy or run the same MCP/CLI evidence pack.
