---
slug: elements/ontology-node-detail-modal
kind: element
title: Ontology Node Detail Modal
domain: views
relates: [capabilities/agent-graph-readiness, elements/ontology-tree-view, ontology-review-brief]
---

`src/views/ontology-view/ui/OntologyViewPage.tsx` renders the selected-node detail experience on `/ontology` as a centered modal workbench instead of a narrow fixed right rail.

The modal behaves like the app settings dialog: the header stays outside the scroll body, the modal shell hides page overflow, and the content area owns its own vertical scroll. This prevents the selected concept inspection flow from making the background page scroll or forcing users to read a cramped side panel.

The left navigation is a real LNB contract, not just four tiny anchor labels. It uses a 286px desktop rail, expanding to 300px on wide screens, with section descriptions for Overview, Relations, Agent, and Review so a user can understand why the panel exists: read the concept meaning, inspect typed graph neighbors, copy the MCP proof packet, then run review/write-guard checks.

The reading pane is deliberately larger than the old detail surface: desktop text resolves to 17px / 36px line height, the modal can use up to a 1440px workbench width, and mobile keeps a vertical header layout so action buttons do not squeeze the purpose text into a tall unreadable column. Relation previews, proof packets, and signal cards use larger spacing so the selected concept is inspectable without the old tiny right-panel feel.

Runtime proof from the dogfood app: selecting `project:ontology-atlas` at `/ko/ontology` now opens a centered concept workbench with LNB sections, readable proof/action cards, internal `overflow-y:auto`, and no fixed desktop right rail.