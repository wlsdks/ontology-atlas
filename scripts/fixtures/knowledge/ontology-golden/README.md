# Ontology golden fixtures — T-11 자동 정확도 채점

`scripts/aggregate-extraction-metrics.mjs --golden=scripts/fixtures/knowledge/ontology-golden` 옵션이 이 디렉토리의 fixture 와 실 추출 결과를 비교해 정확도 (precision / recall / F1) 를 자동 채점한다.

진안이 첫 측정 사이클에서 수동 채점한 결과를 fixture JSON 으로 박아 두면, 두 번째 사이클부터는 사람이 매번 채점하지 않아도 된다.

## 파일 형식

`<documentId>.json` 1 파일 = 1 문서의 기대 추출 결과:

```json
{
  "documentId": "auth-login",
  "note": "측정 1 회차 결과 박음 — 진안 yyyy-mm-dd",
  "expected": {
    "nodes": [
      { "kind": "capability", "title": "사용자 로그인" },
      { "kind": "element", "title": "JWT 토큰" }
    ],
    "edges": [
      { "type": "depends_on", "fromTitle": "사용자 로그인", "toTitle": "JWT 토큰" }
    ]
  }
}
```

## 매칭 규칙

기본 (`--golden-mode=exact`):
- 노드 매칭 = `(kind, title)` 쌍의 정확 일치. 한·영 혼합 OK 단 공백·대소문자 정규화.
- 엣지 매칭 = `(type, fromTitle, toTitle)` triple 의 정확 일치.
- LLM 이 살짝 다른 title 을 만들어내면 (예: "사용자 로그인" vs "로그인 기능") FN/FP 로 잡힌다 — fixture 의 title 을 LLM 이 가장 자주 내는 표기로 통일.

옵션 (`--golden-mode=fuzzy --golden-threshold=0.7`):
- 노드: `kind` 정확 일치 + title token-Jaccard ≥ threshold = TP. Greedy 1:1 매칭.
- 엣지: `type` 정확 일치 + (fromTitle, toTitle) Jaccard 평균 ≥ threshold = TP.
- LLM 표기 변동에 robust. 단 token 단위라 공백 분할이 의미 단위와 안 맞으면 (한국어) threshold 를 살짝 낮추거나 fixture title 을 다듬는다.

## 채점 정의

```
TP = |expected ∩ actual_approved|
FN = |expected - actual_approved|  (놓친 것)
FP = |actual_approved - expected|  (잘못 승인)
precision = TP / (TP + FP)
recall    = TP / (TP + FN)
F1        = 2 · precision · recall / (precision + recall)
```

T-11 §3.3 cutover 의 "정확도 ≥ 80%" 는 F1 기준으로 판정.

## 첫 정답 박는 절차

1. 첫 측정 사이클에서 한 spec 추출 → 검수 → 승인 결과 (`approve_output` reviewRef 의 approvedNodeIds + approvedEdgeIds) 를 보고
2. 같은 documentId 로 `<documentId>.json` 생성, 위 schema 로 noted nodes/edges 박음
3. 다음 사이클부터 같은 spec 재추출 시 자동 채점 — drift 즉시 감지

## 현재 fixture

(비어 있음 — 진안이 첫 측정 결과로 채워 넣음)
