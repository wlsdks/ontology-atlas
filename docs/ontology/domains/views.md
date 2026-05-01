---
slug: domains/views
kind: domain
title: Views (Topology · Tree · Builder)
capabilities:
  - topology-sigma-render
  - tree-ego-graph
  - builder-xyflow-canvas
  - md-export-from-builder
  - search-palette
  - global-search
elements:
  - src/views/home
  - src/views/ontology-view
  - src/views/ontology-edit
  - src/widgets/sigma-topology
  - src/widgets/global-search
relates:
  - domains/ontology-core
---

# Views

같은 ontology 그래프의 세 출구. 토폴로지 (Sigma + ForceAtlas2 spatial network),
트리 (`/ontology` 계층 + ego graph), 빌더 (xyflow ERD canvas + md 내보내기).
검색 — `⌘K` 프로젝트 / `⇧⌘K` 글로벌.
