---
slug: elements/ontology-concept-detail-workbench
kind: element
title: Ontology Concept Detail Workbench
domain: views
---

`src/views/ontology-view/ui/OntologyViewPage.tsx` renders the selected concept detail workbench for `/ontology`.

It opens as a large centered modal instead of a narrow side rail and keeps the reading pane large enough for macOS app inspection. The first layer now uses short section labels: Meaning and Connections stay visible, while AI Check and Team Review remain behind the extra-checks disclosure. The left rail keeps only the selected concept and section navigation, leaving duplicate kind/relation/source facts out of the rail. The reading pane starts with sentence-level meaning cards — what the concept is, whether it already connects to other concepts, and where its starting evidence comes from — then lets readers open relation proof, AI handoff checks, or collaborator review only when needed.

Regression coverage lives in `src/views/ontology-view/ui/NodeDetailPanel.layout.test.tsx` so the detail view cannot quietly collapse back into a small right panel.
