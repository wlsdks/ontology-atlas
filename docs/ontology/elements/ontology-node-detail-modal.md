---
slug: elements/ontology-node-detail-modal
kind: element
title: Ontology Node Detail Modal
domain: views
relates: [capabilities/agent-graph-readiness, elements/ontology-tree-view, ontology-review-brief]
---

`src/views/ontology-view/ui/OntologyViewPage.tsx` renders the selected-node detail experience on `/ontology` as a centered modal workbench instead of a narrow fixed right rail.

The modal now behaves like the app settings dialog: the header stays outside the scroll body, the modal shell hides page overflow, and the content area owns its own vertical scroll. This prevents the selected concept inspection flow from making the background page scroll or forcing users to read a cramped side panel.

The left navigation is a real LNB contract, not just four tiny anchor labels. It uses a 260px desktop rail with section descriptions for Overview, Relations, Agent, and Review so a user can understand why the panel exists: read the concept meaning, inspect typed graph neighbors, copy the MCP proof packet, then run review/write-guard checks.

The reading pane is deliberately larger than the old detail surface: desktop text resolves to 16px / 32px line height, the modal can use up to a 6xl width, and mobile switches the header to a vertical layout so action buttons do not squeeze the purpose text into a tall unreadable column.

Runtime proof from the dogfood app: selecting `project:ontology-atlas` at `/ko/ontology` produced an 1152 x 828 desktop modal with a 260px LNB, 822px reading pane, internal `overflow-y:auto`, and no mobile horizontal overflow at 390 x 844.