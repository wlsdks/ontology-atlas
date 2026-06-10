---
slug: capabilities/topology-skeleton-entry
kind: capability
title: Topology — Structural Skeleton Entry & Click-Level Reveal
domain: views
elements: []
---

# Topology — Structural Skeleton Entry & Click-Level Reveal

`/topology` 진입을 ForceAtlas2 scatter 대신 **결정론적 중앙-방사형 구조 골격**으로
렌더한다. project 정중앙(tier 0) → 도메인 ring(tier 1, 12시 기준 slug 순) → 도메인별
대표 역량(tier 2, governed subtree weight 상위 N) + contains spine 엣지. 좌표는
순수 함수가 precompute 해 replay-identical — 물리/난수 0, 진입 시 idle 모션 0.

**클릭-레벨 확장(semantic zoom, 누적 드릴다운)**: 도메인 클릭 → 그 도메인의 *모든*
역량이 wedge 안 outer ring 에 부채꼴 전개(다른 골격 유지) / 역량 클릭 → 형제 역량
레이어 유지 + 그 역량의 요소가 tier 3 호(ring 바깥)에 전개 / 요소 클릭 → 부모 역량
scope 유지(시야 붕괴 없음) / 배경 클릭 → overview 복귀. Shneiderman 의
*overview first, zoom and filter, details-on-demand* 원칙의 구현.

핵심 모듈 (모두 순수 + 단위 테스트):
- `src/views/home/lib/topology-ontology-skeleton.ts` — anchor(project+domain) +
  landmark(도메인별 subtree-weight 상위 역량) 선정
- `src/views/home/lib/topology-skeleton-layout.ts` — tiered radial 좌표
  (`buildSkeletonRadialLayout`) + 클릭 확장 좌표(`buildRevealRadialLayout`)
- `src/views/home/lib/topology-reveal-state.ts` — 클릭-레벨 가시성 상태
  (`computeRevealState`)
- 합성은 HomePage(view) 가 하고 SigmaTopology(widget) 는 데이터(props)만 받는다 —
  FSD import 방향 보존.

범례는 kind 색 + **계층 태그(1계층~4계층/별도)** 세로 1열로 위계를 명시하고, 좌상단
분석 패널은 아이콘 탭 + 280px 로 축소해 지도가 주인공이 되게 했다.
