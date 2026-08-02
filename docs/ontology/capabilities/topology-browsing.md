---
uid: c183b392-62bd-455f-a310-c541f49e7c38
slug: capabilities/topology-browsing
kind: capability
title: Topology Map Rendering & Search
domain: domains/topology-navigation
elements: [elements/global-search, elements/search-palette, elements/topology-controls, elements/topology-index-panel, elements/topology-map-v2]
created_by: "agent:unknown"
---

## 정의
볼트 전체 그래프를 커스텀 canvas-2D 엔진 위에서 렌더링·팬/줌·검색하는 능력. src/features/에 전용 폴더는 없으나 위젯 증거 + 문서 서술로 제안됨(review-required).

## 근거
- src/widgets/topology-map-v2, topology-controls, global-search (구현 증거)
- AGENTS.md — Tech stack ("The graph renderer is ours — a custom canvas-2D engine (topology-map-v2)")

## 확신도
medium-high (0.85) — capability 후보가 features/ 폴더가 아닌 widgets/ 증거로만 뒷받침됨을 명시
