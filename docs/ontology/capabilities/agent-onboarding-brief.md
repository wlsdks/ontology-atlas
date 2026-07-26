---
slug: capabilities/agent-onboarding-brief
kind: capability
title: Agent Onboarding Brief (1-paste prime)
display_ko: AI에게 줄 첫 안내문
display_en: First Brief for AI
domain: views
elements: [cli/src/lib/query-result-contract.mjs, elements/business-ontology-lens, elements/ontology-node-detail-modal, mcp/src/ontology-engine.mjs, src/features/vault-ontology/ui/LiveActivityIndicator.tsx, src/shared/lib/ontology-tree/agent-briefing-packet.ts, src/views/home/ui/HomePage.tsx]
relates: [capabilities/agent-graph-readiness, domains/ai-agent-partner]
dependencies: [capabilities/mcp-server, capabilities/ontology-hub-mode-aware]
---

Agent onboarding brief composer — a purely-functional packet builder that was
originally designed to unify the "Copy …" buttons scattered across the old
4-tab `/ontology/insights` (run order · graph-DB pack · readiness · write
guardrails · CLI fallback) into a single 1-paste briefing.

That insights UI is gone (2026-07 rebuild — see `capabilities/agent-graph-readiness`
for the split). Two of this capability's original UI elements no longer exist:
`src/views/ontology-insights/lib/collaborator-insights-brief.ts` and
`src/views/ontology-insights/ui/parts/InsightsCollaboratorBriefPanel.tsx` were
both deleted along with the old reader-persona system. The old
`/ontology` semantic map (`OntologyViewPage.tsx`, "브리핑 복사" button) this
capability also described is gone too — `/ontology` is now a thin redirect to
`/topology?index=expanded`.

What survives, unchanged, is the MCP/CLI-side contract:

- `mcp/src/ontology-engine.mjs` still builds `agent_brief`'s
  `businessOntologyLens` — `policy: business-first`,
  `readOrder: outcome -> domain -> capability -> element`, business domain /
  capability-outcome / implementation-evidence candidates, and the four
  `decisionQuestions` (business outcome, business/product boundary, capability
  claim, implementation evidence).
- `cli/src/lib/query-result-contract.mjs` still fails the CLI `agent-brief`
  output closed if those four questions are missing, so terminal-fallback and
  MCP-connected agents can't drift onto different business-extraction
  contracts.
- `src/shared/lib/ontology-tree/agent-briefing-packet.ts`
  (`buildAgentBriefingPacket`) still exists as a pure composer, but currently
  has no UI caller (confirmed by repo-wide grep, 2026-07) — it is reachable
  only through the `shared/lib/ontology-tree` barrel export.

The closest thing to a live "onboarding brief" surface today is
`LiveActivityIndicator.tsx` on the topology hub (`/`, `/topology`), which
copies a business-question / graph-check packet built from
`agent-query-recipes.ts` (see `capabilities/agent-graph-readiness`) — not from
`agent-briefing-packet.ts`. A dedicated 1-paste onboarding surface, if still
wanted, needs a new UI home; it does not currently have one.

## 2026-07-26 freshness review

`HomePage` changed local-folder fallback, toast reservation, and selected-node
freshness wiring. None of those changes created a dedicated onboarding-brief
surface, so the current capability boundary above remains accurate.
