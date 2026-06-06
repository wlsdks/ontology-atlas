---
slug: elements/ontology-concept-detail-workbench
kind: element
title: Ontology Concept Detail Workbench
domain: views
---

`src/views/ontology-view/ui/OntologyViewPage.tsx` renders the selected concept detail workbench for `/ontology`.

It opens as a large centered modal instead of a narrow side rail, uses an internal LNB/tab structure for overview, relations, agent checks, and review, and keeps the reading pane large enough for macOS app inspection. The workbench explains why a concept exists, which typed relations give it meaning, and which MCP/CLI checks an AI agent should run next.

Regression coverage lives in `src/views/ontology-view/ui/NodeDetailPanel.layout.test.tsx` so the detail view cannot quietly collapse back into a small right panel.