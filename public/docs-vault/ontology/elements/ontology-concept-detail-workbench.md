---
slug: elements/ontology-concept-detail-workbench
kind: element
title: Ontology Concept Detail Workbench
domain: views
relates: [elements/ontology-node-detail-modal]
---

> **Superseded (B3 허브가 곧 지도, 2026-07).** `src/views/ontology-view/`
> is physically deleted (commit `3fa2c2508`) — see
> `elements/ontology-node-detail-modal` for the current successor
> (`TopologyV2DetailPanel` + opt-in `FullDetailA1`) and its own superseded
> note. This node is kept only because it still carries useful historical
> rationale for the large-centered-modal-over-narrow-rail decision below;
> the concrete component name is stale.

`src/views/ontology-view/ui/OntologyViewPage.tsx` rendered the selected concept detail workbench for the former `/ontology` tree hub.

It opens as a large centered modal instead of a narrow side rail and keeps the reading pane large enough for macOS app inspection. The first layer now uses short section labels: Meaning and Connections stay visible, while AI Check and Team Review remain behind the extra-checks disclosure. The left rail keeps only the selected concept and section navigation, leaving duplicate kind/relation/source facts out of the rail. The reading pane starts with sentence-level meaning cards — what the concept is, whether it already connects to other concepts, and where its starting evidence comes from — then lets readers open relation proof, AI handoff checks, or collaborator review only when needed.

Regression coverage lived in `src/views/ontology-view/ui/NodeDetailPanel.layout.test.tsx` (also deleted with the tree hub) so the detail view could not quietly collapse back into a small right panel; the successor's layout contract now lives in `FullDetailA1`'s own test suite.
