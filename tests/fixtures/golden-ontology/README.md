# Golden Ontology Fixtures

T-11 측정 사이클의 정답 데이터. 진안의 한국어 spec 이 박힐 자리.

## 구조

각 fixture 는 두 파일 페어 — `<id>.md` (원본 spec) + `<id>.expected.json`
(사람이 정의한 정답 ontology).

채점은 `src/shared/lib/golden-ontology/score.ts` 의 `scoreOntology(expected, actual)` 가 담당. 노드 (title + kind) 와 edge (from title + type + to title) 를 set 비교해 precision / recall / f1 산출.

## 정답 JSON 스키마

```json
{
  "id": "<fixture id, 보통 파일명>",
  "description": "<한 줄 사람 설명>",
  "nodes": [
    { "title": "<노드 제목>", "kind": "project|domain|capability|element|document" }
  ],
  "edges": [
    { "from": "<출발 title>", "to": "<도착 title>", "type": "contains|belongs_to|depends_on|implements|uses|describes|related_to" }
  ]
}
```

- `title` 은 case-insensitive 비교. 띄어쓰기 / 대소문자만 다른 변형은 매칭됨.
- `kind` 는 5 종 enum 중 하나. 다른 kind 로 분류되면 같은 title 이라도 mismatch.
- `type` 은 7 종 edge type enum 중 하나. 의미 다른 매칭 (예: depends_on ↔ uses) 는 mismatch.

## 추가 방법

1. `01-design-system.md` 같은 패턴으로 spec md 추가 (한국어 spec 그대로 가능).
2. 같은 stem 의 `<id>.expected.json` 추가 — 사람이 정답 ontology 정의.
3. T-11 측정 사이클이 실제 추출 → `scoreOntology` 로 채점 → `overallF1` 보고.

현재는 1 sample (`01-design-system`) 만 박혀 있음. 진안 production 측정
진입 시 한국어 10 spec 으로 확장 예정 (cutover §3.3).
