---
slug: capabilities/changes-only-review
kind: capability
title: Changes-Only Review (변경점만 보기)
domain: views
elements: []
relates: [capabilities/topology-change-visualization]
---

baseline 대비 변경된 노드만으로 좁혀 보는 리뷰 흐름 — B1(토폴로지 pulse)의 짝으로, 회의·설계 리뷰에서 "이번 세션에 뭐가 바뀌었나" 를 두 분석 surface 에서 드릴다운한다.

## 어떻게

- `/ontology` — 변경 패널의 "변경점만" 토글. 켜면 트리가 `filterTreeByNodeIds(roots, touchedNodeIds)` 로 변경 노드 + 조상 경로만 남긴 최소 트리로 좁혀진다 (`src/shared/lib/ontology-tree/filter-tree.ts`, `src/views/ontology-view/ui/parts/OntologyChangePanel.tsx`). count strip·빈상태·warning 은 원본 트리 기준 유지. 변경 칩은 kind 별 24개에서 잘리되 "+N 더" 로 잘림을 명시한다(에이전트 bulk 변경 시 silent cap 방지 — insights 허브 패널과 같은 패턴).
- `/ontology/insights` — `InsightsChangeStrip` (`src/views/ontology-insights/ui/parts/InsightsChangeStrip.tsx`). census 를 왜곡하지 않도록 스코프 토글이 아니라 가벼운 요약 + deep-link. 칩 클릭 시 `?node=` 로 그 노드의 degree·hub·readiness 지표로 점프.

## 설계 원칙

- removed 노드는 그래프에 없어 트리 필터 대상이 아님 → `touchedNodeIds`(added|changed) 가 비면 토글/스코프를 숨겨 빈 트리 회피.
- baseline 은 공유 모듈 스토어(`useChangeBaseline`)라 /ontology·/topology·/insights 가 같은 기준을 본다. baseline 있을 때만 노출 → 기본 화면 비침습.
- FSD: 두 surface 가 view 컴포넌트를 cross-import 하지 않고 core(changeset)만 공유.

에이전트 측 동일 정보는 `list_concepts({since})` 로 조회.