---
slug: elements/ontology-workbench-summary
kind: element
title: Ontology Workbench Summary
domain: views
---

`src/views/ontology-view/ui/OntologyViewPage.tsx` renders the compact Browse / Write / Query summary at the top of `/ontology`.

It frames the tree as one browse mode inside the graph workbench, then hands off to Builder for frontmatter-backed writes and Insights for graph DB-style query validation. The first viewport also keeps a separate role strip for Tree role / Graph refs / Evidence so the hierarchy view does not pretend to be the whole ontology system.

The local frontmatter compile proof below the role strip is intentionally compact: it states that the current graph was compiled from the selected vault, exposes node/relation counts and a Builder CTA, and keeps the kind census collapsed. It no longer renders the full kind-by-kind node list before the actual tree, so `/ontology` starts as a browse surface rather than a document inventory dump.

The Korean surface now labels that proof as `프론트매터 그래프`, `노드 · 관계`, and `종류별 요약` instead of repeating English body captions such as `VAULT FRONTMATTER ONTOLOGY` or `KIND CENSUS`. This keeps the page header hierarchy intact while still proving that the browse tree is backed by a compiled local graph.

This element is the `/ontology` browse counterpart to the Builder write summary and Insights query cockpit: Browse shows hierarchy and selection, Write mutates frontmatter, Query proves graph state through scans and paths.
