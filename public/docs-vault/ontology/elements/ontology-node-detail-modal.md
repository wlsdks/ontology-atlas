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

The detail workbench is mounted through a `document.body` portal. This is part of the contract, not an implementation detail: page scroll containers, tree layout, and route content wrappers must not turn the selected concept into an inline right-side rail.

The modal shell is static `div` / `aside` markup rather than a motion wrapper so the macOS WebView cannot leave the selected concept workbench invisible while its accessibility tree is present.

`src/views/ontology-view/ui/NodeDetailPanel.layout.test.tsx` locks the body portal, wide dialog size, LNB structure, selected-concept summary, section isolation, and large reading-pane typography so the detail view does not regress into a cramped stacked panel.
