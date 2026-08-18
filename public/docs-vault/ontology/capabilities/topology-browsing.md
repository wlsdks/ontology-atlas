---
uid: c183b392-62bd-455f-a310-c541f49e7c38
slug: capabilities/topology-browsing
kind: capability
title: Topology Map Rendering & Search
domain: domains/topology-navigation
elements: [elements/global-search, elements/search-palette, elements/topology-controls, elements/topology-index-panel, elements/topology-map-v2]
path: src/widgets/topology-map-v2
created_by: "agent:unknown"
---

## 정의
볼트 전체 그래프를 커스텀 canvas-2D 엔진 위에서 렌더링·팬/줌·검색하는 능력. src/features/에 전용 폴더는 없으나 위젯 증거 + 문서 서술로 제안됨(review-required).

## 근거
- src/widgets/topology-map-v2, topology-controls, global-search (구현 증거)
- AGENTS.md: Tech stack ("The graph renderer is ours: a custom canvas-2D engine (topology-map-v2)")

## 뷰 모드
- **3D 보기(dome view, 2026-08-18)**: 지도를 kind 동심 링의 돔(project 꼭짓점 →
  domain → capability → element 링)으로 다시 배치하는 옵트인 모드. 상단 툴바의
  「3D」 칩으로 켠다. 자율 회전(48s/바퀴. 시선 끌기라 사용자가 개입하면 그
  세션에서 꺼지고 「자동 정렬」·3D 재진입이 재무장) · 궤도 드래그(pitch 는
  극점 직전 ±83° 전각) · 평면 내 노드 드래그 · 휠 줌 · 「제자리로」 · 선택
  리프레임(노드를 고르면 yaw·카메라가 한 시계로 그 노드를 앞면에 프레이밍,
  패널 열림/닫힘에도 보이는 영역 기준 재프레이밍). 기본은 2D(교차 실측 근거,
  `docs/DECISIONS.md` 2026-08-18). 구현: `src/widgets/topology-map-v2/model/dome-view.ts`,
  설정 키 `atlas.appearance.view3d`.

## 확신도
medium-high (0.85): capability 후보가 features/ 폴더가 아닌 widgets/ 증거로만 뒷받침됨을 명시
