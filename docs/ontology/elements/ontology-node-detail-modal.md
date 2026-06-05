---
slug: elements/ontology-node-detail-modal
kind: element
title: Ontology Node Detail Modal
domain: views
---

`src/views/ontology-view/ui/OntologyViewPage.tsx` renders the selected-node detail experience on `/ontology` as a centered modal workbench instead of a narrow fixed right rail.

The modal keeps selected concept evidence readable at production app sizes: summary, graph signal, direct relations, Claude/Codex proof path, and review notes are grouped behind an internal section rail (`Overview`, `Relations`, `Agent`, `Review`). This gives humans a clear inspection surface while preserving copyable agent handoff packets for the same selected ontology node.

Validation evidence: `src/views/ontology-view/ui/NodeDetailPanel.layout.test.tsx` guards the centered modal contract, `aria-modal=true`, the internal section navigation, and removal of the old desktop right-rail classes.