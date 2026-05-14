---
slug: domains/views
kind: domain
title: Views (Topology · Browse · Builder)
capabilities:
  - builder-canvas-polish
  - builder-vault-write
  - ontology-hub-mode-aware
  - topology-sigma-render
elements:
  - sigma-graphology
  - src/views/home
  - src/views/ontology-edit
  - src/views/ontology-view
  - src/widgets/global-search
  - src/widgets/topology-map-sigma
  - xyflow
relates:
  - domains/onboarding-ux
  - domains/ontology-core
---

# Views

같은 ontology 그래프의 세 출구. 토폴로지 (Sigma + ForceAtlas2 spatial network),
둘러보기 (`/ontology` 트리 계층 + ego graph + 노드 detail), 빌더 (xyflow ERD
canvas + md 내보내기). 검색 — `⌘K` 프로젝트 / `⇧⌘K` 노드+프로젝트 통합.
