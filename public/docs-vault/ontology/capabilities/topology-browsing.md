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
- **3D 표현 층(2026-08-18 3차)**: 돔이 돔으로 읽히게 하는 렌더 장치 다섯.
  ① 볼록 껍질 위를 타는 **자오선 관계선**(제어점이 현이 아니라 껍질 위라서
  실루엣이 천막이 아니라 구면이 된다), ② **깊이 헤일로**(잉크 직전에 같은
  기하를 바탕색으로 굵게 한 번 그어 뒤를 가린다. Everts et al. 2009),
  ③ **엣지 화가 정렬**(먼 것부터), ④ **위도 링**(kind 평면 셋을 96 표본
  폴리라인으로, 호마다 자기 깊이의 잉크. `render/dome-rings.ts`),
  ⑤ **노드 입체 음영**(위쪽 약간 왼쪽 광원 가정, Sun & Perona 1998).
  값은 전부 `model/dome-view.ts` 와 `--topology-v2-dome-ring` 토큰 하나에 산다.
- **3D 조작·모션(2026-08-18 4차)**: 빈 곳 드래그가 자리에 따라 갈린다.
  돔 실루엣(그려진 노드 bbox 에 내접하는 타원, 여백 1.08) **안**이면 궤도 회전,
  **밖**이면 2D 와 같은 카메라 팬이다(`isInsideDomeGrip`). 판정은 pointerdown
  에서 한 번만 하고, 커서가 두 구역을 표시한다(`grab` / `move`). 티어 비틀림은
  손 드래그와 프로그램 자세 이동이 **같은 함수**(`chargeTierLag`)를 쓴다.
  진입에는 자기 시계를 갖는 자세 스윕이 있고(`domeEntrySweep`), 손이 닿으면
  그 각을 자세에 개어 넣어 화면이 안 튄다(`commitDomeEntrySweep`).
- **카메라 궤적(2026-08-18 5차)**: 프로그램 카메라 이동이 축별 선형 보간에서
  **van Wijk & Nuij 최적 경로**로 바뀌었다(`vanWijkCameraKeyframe`, ρ=1.42).
  배율이 로그로 보간되고, 먼 이동에서는 카메라가 중간에 물러났다가 다시
  파고들어 화면 광학 흐름이 일정하다. 궤도 릴리스는 자연 착지점을 투영해
  도메인 자오선 근처면 그리로 겨눈다(`projectOrbitLanding` ·
  `domeFacingYaws` · `snapOrbitLanding`), 접근의 시간 상수는 릴리스 속도에서
  역산해 속도가 연속이다(`orbitSnapTauMs`).
- **배치 기준(2026-08-18 6차)**: 3D 는 배치를 둘 갖는다. `ownership`(기본)은
  기존 돔(높이=티어, 방위=부모), `coupling` 은 관계가 자리를 정하는 3D 힘
  구름(`relaxCouplingCloud`: 모든 쌍 밀어냄 + 관계 스프링 + 냉각, 소유 좌표
  워밍스타트라 난수 0). 구름은 위도 링도 껍질 휨도 안 그린다. 설정 키
  `atlas.appearance.map-arrangement`, UI 는 지도 상단 「3D」 칩이 여는 고르개
  (`widgets/search-hint/ui/View3dMenu.tsx`) 한 곳. 세 줄(평면·돔·구름)이라
  「3D 끄기」와 「모양 고르기」가 한 자리에서 읽힌다.

## 확신도
medium-high (0.85): capability 후보가 features/ 폴더가 아닌 widgets/ 증거로만 뒷받침됨을 명시
