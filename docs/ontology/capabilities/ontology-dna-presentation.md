---
uid: 831f55df-dc9d-4e00-baa9-c846b2a11273
slug: capabilities/ontology-dna-presentation
kind: capability
title: Ontology DNA Presentation
domain: domains/agent-integration
elements: []
path: src/features/acp-session/model/presentation-trace.ts
created_by: "agent:codex"
---

## Definition

The ability to use one Analysis-owned ACP conversation across all Analysis tabs and turn one explicitly sent, completed Flow turn into an ephemeral guided explanation of the ontology business-to-implementation chain without requiring a move to the map.

## Behaviour Contract

- Analysis > Flow remains the entry and the exact app-authored request is only prefilled; the person still sends it.
- One ACP conversation sits outside the keyed Analysis tab panel. Tab changes do not send, prefill, replace draft text, or create sessions; only an explicit tab action seats a request, and replacing a non-empty draft requires a second explicit choice.
- Presentation eligibility is derived from the current turn tool record, not from prose: only Atlas read tools may appear, no more than 12 concepts may be read in full, every scene has at least one fully read current anchor, only fully read anchors become evidence badges, and explicitly written typed relations must exist in the loaded graph.
- Three to seven headed scenes are shown inside the Analysis ACP dock. Back and Next change the current scene without navigation; citations retain their exact slug and an explicit action can follow that fact on the map.
- Limitation language such as partial, visible-gap, and unknown remains visible as a distinct qualified scene state.
- A failed qualification explains why no presentation was made. No presentation auto-sends, writes ontology Markdown, creates a route, or persists a second narrative.

## Evidence

- src/features/acp-session/model/presentation-trace.ts
- src/widgets/acp-chat-panel/ui/AcpPresentationPanel.tsx
- src/widgets/acp-chat-panel/ui/AcpChatPanel.tsx
- src/views/ontology-insights/lib/insights-agent.ts
- src/views/ontology-insights/ui/parts/InsightsAgentDock.tsx
- src/views/ontology-insights/ui/OntologyInsightsPage.tsx
- src/views/home/ui/HomePage.tsx
- src/features/acp-session/model/presentation-trace.test.ts
- src/widgets/acp-chat-panel/ui/AcpChatPanel.test.tsx

## Boundaries

The capability projects a verified read trace for human explanation; it does not certify semantic truth, replace the transcript, create a durable analysis record, or extend ACP write authority. Browsers retain the copyable Flow request because they cannot launch a local ACP runtime.

## Confidence

medium-high: parser and interaction tests plus source-built installed-app walkthroughs prove the bounded flow and the shared Analysis session. The capability still does not certify the agent's semantic interpretation.
