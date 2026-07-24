---
slug: capabilities/studio-deep-link-focus
kind: capability
title: 나침 무대 딥링크 포커스 (?node=)
domain: views
elements: [ontology-deeplink-node-resolver, src/views/ontology-studio/ui/OntologyStudioPage.tsx]
---

# 나침 무대 딥링크 포커스 (?node=)

`/ontology/studio?node=<graph-node-id>` 는 나침 무대를 그 vault 노드를 focal
아이템으로 놓은 상태로 연다 (`OntologyStudioPage` 의 `requestedNode`). 요청한
id 가 현재 그래프에 있으면 그 노드가, 없으면 `selectDefaultStudioNodeId` 의
기본 노드가 무대 중앙에 놓인다.

은퇴한 xyflow 빌더의 `/ontology/edit?node=` 딥링크가 하던 "검사에서 편집으로
바로 넘기기" 역할을 이어받는다. `/topology` 의 detail 패널 / Focus / Path /
Health 핸드오프가 같은 canonical 헬퍼로 노드를 공방으로 넘겨, 사용자가 같은
노드를 다시 찾을 필요 없이 인스펙션에서 곧장 강화(쓰기)로 들어간다.
구 `/ontology/edit?node=capabilities/foo` 진입도 얇은 redirect에서
`/ontology/studio?node=capability:foo`로 정규화해 같은 focal item을 보존한다.
`src/entities/knowledge-graph/lib/ontology-node-href.ts`
(`elements/ontology-deeplink-node-resolver`) 가 graph-id ↔ `?node=` 변환을
소유해 여러 표면이 서로 다른 형식으로 갈라지지 않게 한다.

CREATE 모드에서 near-dup 후보를 열 때도 같은 딥링크를 쓴다: 이름이 겹치는
기존 노드를 `?node=<id>` 로 열어 새로 만드는 대신 기존 노드를 강화하도록
유도한다.
