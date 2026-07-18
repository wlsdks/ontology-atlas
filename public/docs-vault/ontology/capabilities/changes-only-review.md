---
slug: capabilities/changes-only-review
kind: capability
title: Changes-Only Review (변경점만 보기)
domain: views
elements: []
relates: [capabilities/topology-change-visualization]
---

baseline 대비 변경된 노드만 보는 리뷰 흐름 — "이번 세션에 뭐가 바뀌었나"를
확인하는 기능. 원래 두 개의 분석 surface(`/ontology`의 `OntologyChangePanel` +
`/ontology/insights`의 `InsightsChangeStrip`)에 드릴다운으로 존재했으나, 2026-07
지도 재구성에서 두 surface 모두 삭제됐다: `src/views/ontology-view/` 디렉터리
전체(구 `/ontology` tree/ego 허브)와 `InsightsChangeStrip.tsx`가 함께 없어졌다.

## 현재 형태

baseline/changeset 계산 자체(`useChangeBaseline`, `computeOntologyChangeset` —
`src/shared/lib/ontology-tree/change-baseline-store.ts` /
`ontology-changeset.ts`)는 살아남아 새 위치에서 쓰인다:

- `src/features/vault-ontology/ui/LiveActivityIndicator.tsx` — 토폴로지 허브
  (`/`, `/topology`)의 Live 배지. 현재 baseline 대비 변경된 노드 수를 보여주고,
  열면 그 목록을 노출한다.
- `src/views/home/ui/HomePage.tsx` — 같은 baseline 상태를 초기화(`OntologyLiveBaselineInit.tsx`)한다.

트리 필터링(`filterTreeByNodeIds`, `src/shared/lib/ontology-tree/filter-tree.ts`)
자체는 여전히 존재하지만, 그 필터를 사용하던 `/ontology` 변경 리뷰 패널은 없다.
INDEX 패널(`src/widgets/topology-map-v2/`)에 변경-노드만 좁혀보는 전용 토글은
아직 없다 — 이 capability가 원래 약속한 "두 surface에서 드릴다운" 모델은 지금은
"하나의 Live 배지"로 축소된 상태다.

## 설계 원칙 (유지되는 부분)

- baseline 은 공유 모듈 스토어(`useChangeBaseline`)이므로 `/`, `/topology` 가
  같은 기준을 본다.
- removed 노드는 그래프에 없어 필터 대상이 아님 — 변경이 없으면 배지 자체가
  조용히 숨는다.

에이전트 측 동일 정보는 `list_concepts({since})` 로 조회 — 이 계약은 변경 없음.