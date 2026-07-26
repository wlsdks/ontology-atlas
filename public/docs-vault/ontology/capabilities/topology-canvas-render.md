---
slug: capabilities/topology-canvas-render
kind: capability
title: Topology — Canvas-2D Map Render
display_ko: 지도 그리기
display_en: Draw the Map
domain: views
elements: [elements/ontology-description-helper, src/views/home, src/widgets/topology-controls]
relates: [elements/sigma-graphology]
---

# Topology — Canvas-2D Map Render

`/` (root hub) 와 `/topology` (동일 진입) 는 자체 canvas-2D 렌더 엔진
`topology-map-v2`(`src/widgets/topology-map-v2/`)가 그린다. Sigma.js WebGL
렌더러는 은퇴했다 — Graphology + ForceAtlas2 물리 레이아웃은 그대로 재사용하되
(현재 topology-map-v2 내부의 선택적 layout pass), 실제 픽셀은 단일
`<canvas>` 컨테이너 위에 이 엔진이 직접 그린다. 퇴역한 ERD Builder와
공유하는 renderer는 없다. `HomePage`(`src/views/home`)가 마운트 지점이고,
`TopologyControls`(`src/widgets/topology-controls`)가 검색·depth·fit-view 같은
조작 UI를 담당한다.

## 진입 & 확장

기본 진입은 ForceAtlas2 scatter 가 아니라 결정론적 중앙-방사형 골격(project →
domain ring → 대표 capability) — 자세한 내용은
[[capabilities/topology-skeleton-entry]]. 노드 클릭은 ego 포커스 +
컴팩트 팝오버(`TopologyV2DetailPanel`)를 연다 — 풀스크린 모달이 아니라
Shneiderman 의 overview-first, details-on-demand 원칙을 따른다.

## 조작 표면

- `TopologyControls` — 접힌 기본 상태는 32px 아이콘 버튼 하나. `/` 검색 포커스,
  `1`–`6` depth, `0` depth 전체, `?` 단축키 도움말.
- `HubRail`(`src/widgets/topology-controls`) — degree 상위 허브 레일.
- 미니맵/줌·팬은 `topology-map-v2/interaction` 이 소유(별도 에이전트 작업 영역이라
  이 문서에서 세부 구현은 다루지 않는다 — `src/widgets/topology-map-v2/README`
  또는 코드 자체를 1차 출처로 본다).

## 노드 표현

kind(`domain`/`capability`/`element`) 별 fill·size 위계는
[[capabilities/topology-kind-legibility]] 가 소유. 노드 hover 요약 문구는
`elements/ontology-description-helper`(`src/shared/lib/ontology-description.ts`)가
body excerpt 를 160자 안팎으로 줄여 만든다.

## 2026-07-26 entry and map audit

Canvas labels now reserve rendered node shapes with owner IDs, derive paint and
bounds from one baseline function, and try the opposite side before suppressing
a passive label. Selected and hover labels therefore keep a minimum gap outside
the actual rendered ring. The bottom-right legend/readout stack is measured with
`ResizeObserver` and reserves the matching toast offset, so transient notices do
not cover persistent graph encoding. Korean relation labels no longer inherit
Latin-only mono/uppercase/wide-tracking decoration.
