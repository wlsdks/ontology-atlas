---
slug: capabilities/topology-change-visualization
kind: capability
title: Topology Change Visualization (변경점 베이스라인 공유)
domain: views
elements: []
relates: [capabilities/topology-ontology-inspection]
---

`/ontology` 에서 "Mark baseline" 으로 잡은 vault 스냅샷을 기준으로, 그 이후 추가/편집/삭제된 노드를 `/topology` 의 Sigma 그래프에서 시각적으로 구분(recent-pulse 재사용)한다.

## 왜

에이전트가 MCP 로 vault 를 편집하면 사람은 회의에서 토폴로지를 보며 "무엇이 바뀌었나" 를 한눈에 봐야 한다. 변경점이 화면에서 구분되면 사람과 AI agent 가 같은 변경 단위를 두고 A/B 처럼 발전시킬 수 있다.

## 어떻게

- `src/shared/lib/ontology-tree/change-baseline-store.ts` — 모듈 싱글톤 스토어. `markChangeBaseline` / `clearChangeBaseline` / `useChangeBaseline` (useSyncExternalStore). client-side nav 간 baseline 지속, SSR-safe.
- `src/shared/lib/ontology-tree/ontology-changeset.ts` — `snapshotOntology` / `computeOntologyChangeset`. 노드 signature(kind·title·summary·정렬된 outgoing edges)로 added/changed/removed + touchedNodeIds 산출. 좌표/타임스탬프 무시.
- `src/views/ontology-view/ui/parts/OntologyChangePanel.tsx` — `/ontology` 의 변경 패널 (mark/clear CTA + added/changed/removed chip).
- `src/widgets/topology-map-sigma/lib/graph-build.ts` — `changedSlugs` 를 기존 `recentlyUpdated` pulse 에 OR 로 합쳐 project · ontology-ext 노드 양쪽에서 변경점 표시.
- `src/views/home/ui/HomePage.tsx` — `/topology` 가 같은 스토어를 읽어 `touchedNodeIds` 를 `SigmaTopology` 의 `changedSlugs` 로 전달.

브라우저: baseline 이 `/ontology` ↔ `/topology` 간 client-side nav 에서 지속됨 + 콘솔 0 에러 확인.

에이전트 측 "무엇이 바뀌었나" 는 `list_concepts({since})` 로 동일하게 조회 가능 (사람 surface 와 짝).