---
slug: elements/ontology-node-detail-modal
kind: element
title: Ontology Node Detail Modal
domain: views
relates: [capabilities/agent-graph-readiness, elements/ontology-review-brief, elements/ontology-tree-view]
elements: [src/views/ontology-view/ui/NodeDetailPanel.layout.test.tsx, src/views/ontology-view/ui/OntologyViewPage.tsx]
---

`src/views/ontology-view/ui/OntologyViewPage.tsx` renders the selected-node detail experience on `/ontology` as a centered modal workbench instead of a narrow fixed right rail.

It keeps concept inspection readable by separating overview, relations, agent proof, and review questions into an internal LNB/tab structure. The dialog uses stable internal scrolling, a larger reading pane, and a pinned selected-concept summary so users can see why the concept exists, which typed relations give it meaning, and which MCP checks Claude Code or Codex should run next.

`src/views/ontology-view/ui/NodeDetailPanel.layout.test.tsx` locks the wide dialog size, LNB structure, selected-concept summary, section isolation, and large reading-pane typography so the detail view does not regress into a cramped stacked panel.