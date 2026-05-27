---
slug: domains/views
kind: domain
title: Views (Topology · Browse · Builder)
capabilities: [agent-graph-readiness, builder-canvas-polish, builder-deep-link-focus, builder-relation-write-confirm, builder-vault-write, collaborator-reader-brief, ontology-hub-mode-aware, topology-analysis-modes, topology-ontology-inspection, topology-sigma-render]
elements: [builder-node-query-focus, builder-relation-proposal, builder-relation-write-confirm-panel, elements/builder-graph-anchor-rail, elements/builder-write-summary, elements/insights-query-cockpit, elements/ontology-design-surface-guard, elements/ontology-edit-canvas, elements/ontology-graph-proof-rail, elements/ontology-sub-nav, elements/ontology-tree-projection-summary, insights-collaborator-brief, insights-orphan-repair-packet, ontology-deeplink-node-resolver, ontology-review-brief, ontology-workbench-summary, sigma-graphology, src/views/home, src/views/ontology-edit, src/views/ontology-view, src/widgets/global-search, src/widgets/topology-map-sigma, topology-analysis-bar, topology-analysis-state, topology-ontology-drawer, topology-ontology-drawer-model, topology-selected-node-resolver, xyflow]
relates: [domains/onboarding-ux, domains/ontology-core]
---

# Views

같은 ontology 그래프의 세 출구. 토폴로지 (Sigma + ForceAtlas2 spatial network),
둘러보기 (`/ontology` 트리 계층 + ego graph + 노드 detail), 빌더 (xyflow ERD
canvas + md 내보내기). 검색 — `⌘K` 프로젝트 / `⇧⌘K` 노드+프로젝트 통합.
Builder 와 Insights 는 design-system 의 operation page header 계약을 따른다:
English caption 으로 surface 를 식별하고, Korean h1 로 실제 작업 모드를 읽게 한다.
