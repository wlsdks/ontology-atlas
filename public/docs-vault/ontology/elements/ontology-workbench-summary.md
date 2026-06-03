---
slug: elements/ontology-workbench-summary
kind: element
title: Ontology Workbench Summary
domain: views
relates: [elements/ontology-graph-proof-rail, elements/ontology-tree-projection-summary]
---

`src/views/ontology-view/ui/OntologyViewPage.tsx` renders the Browse / Write / Query summary for `/ontology`.

The summary is intentionally compact: it keeps the graph DB proof loop (`tree projection` → `frontmatter write` → `dogfood:graph-db`) and the active canonical slug handoff, but it does not use visible numbered guide cards. The workbench overview behaves like a lightweight action rail so the primary tree, selected node, change state, and agent handoff remain easier to scan.