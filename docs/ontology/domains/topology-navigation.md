---
slug: domains/topology-navigation
kind: domain
title: Topology Map Navigation
display_ko: 토폴로지 지도 탐색
display_en: Topology Map Navigation
capabilities: [capabilities/topology-browsing]
elements: [elements/src/widgets/domain-capacity-bar, elements/src/widgets/full-detail-a1, elements/src/widgets/gesture-hint, elements/src/widgets/global-search, elements/src/widgets/recent-node-row, elements/src/widgets/search-hint, elements/src/widgets/search-palette, elements/src/widgets/shortcut-sheet, elements/src/widgets/topology-controls, elements/src/widgets/topology-index-panel, elements/src/widgets/topology-map-v2]
---

## 정의
canvas-2D 그래프 브라우징 표면(지도·검색·인덱스 패널) — 볼트 전체를 시각적으로 탐색하는 제품의 1차 진입 경로.

## 근거
- docs/ARCHITECTURE.md — "the current route model converges browsing on Topology, writing on Workshop, maintenance on five-question Insights" (risky-citation 경고 — AGENTS.md와 함께 인용하여 상호 검증)
- AGENTS.md — Routes ("`/topology` is the map's address, not `/`")

## 포함 / 제외
- 포함: topology-map-v2 렌더러, 검색 팔레트, 인덱스 패널
- 제외: 그래프 편집(Studio, graph-modeling 도메인)

## 확신도
medium-high (0.85) — 독립 소스 2건(ARCHITECTURE.md + AGENTS.md) 대조