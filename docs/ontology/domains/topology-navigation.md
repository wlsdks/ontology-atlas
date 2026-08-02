---
uid: 1d2e6601-19af-4547-9e3b-bddf98ce9a77
slug: domains/topology-navigation
kind: domain
title: Topology Map Navigation
display_ko: 토폴로지 지도 탐색
display_en: Topology Map Navigation
capabilities: [capabilities/topology-browsing]
elements: [elements/domain-capacity-bar, elements/full-detail-a1, elements/gesture-hint, elements/global-search, elements/recent-node-row, elements/search-hint, elements/search-palette, elements/shortcut-sheet, elements/topology-controls, elements/topology-index-panel, elements/topology-map-v2]
created_by: human
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