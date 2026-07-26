---
slug: capabilities/topology-change-visualization
kind: capability
title: Topology Change Visualization (변경점 베이스라인 공유)
display_ko: 최근 바뀐 곳 표시
display_en: Highlight Recent Changes
domain: views
elements:
  - src/features/vault-ontology/ui/OntologyLiveBaselineInit.tsx
  - src/shared/lib/ontology-tree/change-baseline-store.ts
  - src/shared/lib/ontology-tree/ontology-changeset.ts
  - src/widgets/topology-map-v2
relates: [capabilities/topology-ontology-inspection]
---

# Topology Change Visualization

로컬 vault를 연 시점의 graph snapshot과 현재 frontmatter graph를 비교해,
이후 추가·편집된 노드를 `/`·`/topology` 지도와 INDEX, 기록 표면에서 같은
변경 단위로 표시한다. 퇴역한 `/ontology` 변경 패널이나 Sigma renderer는
현재 계약이 아니다.

## 왜

에이전트가 MCP로 vault를 편집하면 사람은 지도와 git workbench에서 “무엇이
바뀌었나”를 같은 기준으로 확인해야 한다. 변경 강조, 리뷰 진입점, agent
activity count가 서로 다른 계산을 쓰면 한 변경이 표면마다 다르게 보인다.

## 어떻게

- `OntologyLiveBaselineInit`은 local vault에서 persisted baseline을 먼저
  복원하고, 유효한 snapshot이 없으면 현재 graph를 한 번 auto-mark한다.
  static dogfood sample은 auto-mark하지 않는다.
- `change-baseline-store.ts`는 `useSyncExternalStore` 기반 singleton과
  `localStorage` persistence를 제공한다. 다른 vault의 오래된 snapshot은
  content-overlap guard가 폐기한다.
- `ontology-changeset.ts`는 kind·title·summary·정렬된 outgoing relation
  signature로 added/changed/removed와 `touchedNodeIds`를 계산한다.
  좌표·timestamp는 의미 변경으로 세지 않는다.
- `HomePage`가 changeset을 한 번 계산하고, `topology-v2-adapter.ts`가
  touched id를 각 canvas node의 `recentlyUpdated`/fresh 채널로 바꾼다.
  `TopologyMapV2`의 world model이 그 값을 실제 강조로 그린다.
- 같은 `changedSlugs`는 `TopologyIndexPanel`/`TopologyRealmLedger`의 fresh
  표식, 상단 리뷰 링크, 접근성 change announcement에 전달된다.
- `LiveActivityIndicator`와 `useAtlasGitContext`도 같은 baseline과
  `computeOntologyChangeset`을 사용해 activity count와 `/git` workbench가
  지도와 같은 변경 집합을 말한다.

최근 변경 스포트라이트(`?recent=`)는 별도 mtime window다. 스포트라이트가
켜진 동안 fresh 시각 채널은 그 window의 node set만 사용하고 session
changeset과 섞지 않는다. 그래서 “왜 이 노드가 켜졌나”에 한 기준으로 답한다.

에이전트 측 시간 기반 조회는 `list_concepts({since})`가 제공한다. 이것은
사람 표면의 session baseline과 목적은 같지만 입력 계약은 다르므로 동일
snapshot이라고 과장하지 않는다.
