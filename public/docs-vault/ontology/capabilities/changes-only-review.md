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

- `/ontology` — 변경 기준은 상단 command bar 의 작은 기준 버튼으로 유지하고, 실제 변경이 생긴 뒤에만 변경 리뷰 패널과 "변경점만" 토글을 펼친다. 토글을 켜면 트리가 `filterTreeByNodeIds(roots, touchedNodeIds)` 로 변경 노드 + 조상 경로만 남긴 최소 트리로 좁혀진다 (`src/shared/lib/ontology-tree/filter-tree.ts`, `src/views/ontology-view/ui/parts/OntologyChangePanel.tsx`). count strip·빈상태·warning 은 원본 트리 기준 유지. 변경 칩은 kind 별 24개에서 잘리되 "+N 더" 로 잘림을 명시한다(에이전트 bulk 변경 시 silent cap 방지 — insights 허브 패널과 같은 패턴). 모바일에서는 칩 묶음이 짧은 내부 스크롤로 제한되어 변경 검토가 ontology tree 검색과 첫 선택 흐름을 밀어내지 않는다.
- `/ontology/insights` — `InsightsChangeStrip` (`src/views/ontology-insights/ui/parts/InsightsChangeStrip.tsx`). census 를 왜곡하지 않도록 스코프 토글이 아니라 가벼운 요약 + deep-link. 칩 클릭 시 `?node=` 로 그 노드의 degree·hub·readiness 지표로 점프.

## 설계 원칙

- removed 노드는 그래프에 없어 트리 필터 대상이 아님 → `touchedNodeIds`(added|changed) 가 비면 토글/스코프를 숨겨 빈 트리 회피.
- baseline 은 공유 모듈 스토어(`useChangeBaseline`)라 /ontology·/topology·/insights 가 같은 기준을 본다. 변경이 없을 때는 기준 버튼만 남기고 리뷰 패널을 숨겨 기본 화면을 비침습적으로 유지한다.
- 변경 패널은 session review 보조면이지 tree의 대체 화면이 아니다. 모바일 첫 진입에서는 변경 요약과 agent handoff를 보존하되 tree role strip이 같은 viewport 안에 들어와야 한다.
- FSD: 두 surface 가 view 컴포넌트를 cross-import 하지 않고 core(changeset)만 공유.

에이전트 측 동일 정보는 `list_concepts({since})` 로 조회.
