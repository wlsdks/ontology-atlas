---
slug: capabilities/collaborator-reader-brief
kind: capability
title: Collaborator Reader Brief
display_ko: 동료를 위한 읽기 안내
display_en: Reader Brief for Teammates
domain: views
elements: [elements/ontology-node-detail-modal, elements/ontology-reader-intent-contract, topology-ontology-drawer-model]
relates: [documents/business-to-code-dogfood-audit]
---

Shared stakeholder reader lane for planners, marketers, C-level decision-makers,
developers, and AI agents — the idea that the same graph should turn
business/product meaning, ownership, dependency, evidence, and impact into
something the whole decision loop can read, not just developers.

**2026-07 status note.** Most of this capability's original description was
about two surfaces that the map-rebuild round deleted outright:

- The old `/ontology` semantic map (`src/views/ontology-view/`,
  `OntologyViewPage.tsx`) — the reading-order strip, business-to-code brief
  copy button, and node detail collaborator card it described are gone.
  `/ontology` is now a thin redirect to `/topology?index=expanded`.
- The old `/ontology/insights` workspace-level collaborator brief
  (`collaborator-insights-brief.ts`, `InsightsCollaboratorBriefPanel.tsx`) —
  also deleted. `/ontology/insights` is now a fixed 3-tab dashboard (Overview /
  Relations / Freshness) with a single bottom handoff row per tab instead of a
  dedicated collaborator lane.

What survives and is still accurate:

- `elements/ontology-node-detail-modal` — node click on `/topology` opens
  `TopologyV2DetailPanel.tsx` (plus the legacy `FullDetailA1.tsx`), which still
  carries a plain-language kind/relation/evidence summary for a selected node.
- `elements/ontology-reader-intent-contract` — the `reader=` URL intent
  (`planning` / `marketing` / `leadership` / `developer` / `agent`) still
  exists, but its only current consumer is the builder
  (`/ontology/edit`, `BuilderReaderIntentStrip`), not `/ontology/insights`
  tab selection as originally described.
- `topology-ontology-drawer-model` — `src/views/home/lib/topology-ontology-drawer.ts`
  is unaffected by this round.

There is currently no dedicated "collaborator brief" copy/markdown export
feature on any live route — that stakeholder-handoff idea would need a new UI
home (most likely `/project/[slug]`'s 3-zone view or a future insights tab) if
still wanted. This capability is being kept rather than deleted because the
underlying product need (a shared reader lane across roles) is still named in
`AGENTS.md` / `PRODUCT-DIRECTION.md`; only its 2026-07-era implementation
description was stale.