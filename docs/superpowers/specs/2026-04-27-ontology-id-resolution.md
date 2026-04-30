# Ontology id resolution v1 — node 식별·매핑·다국어 정책

**작성일**: 2026-04-27
**상태**: 결정 (ontology design loop 의 T-3 §8 미해결 3 항목 종결)
**관련**:
- 입력 계약: [`2026-04-27-ontology-frontmatter-contract.md`](./2026-04-27-ontology-frontmatter-contract.md)
- 워커 / 검수: [`2026-04-27-ontology-design-loop.md`](./2026-04-27-ontology-design-loop.md) §3 / §4 (T-1·T-4·T-5)
- 기존 컨벤션: `functions/index.js` 의 `buildCanonicalNodeId()`

---

## 0. 배경

T-3 frontmatter 계약을 만들면서 미해결 3 항목을 §8 에 남겼다 — 모두 "노드의 정체성" 에 관한 것:

1. frontmatter 의 `id` 와 canonical node ID 의 매핑 — 누가 우선?
2. `relates.target` 이 아직 존재하지 않는 노드 ID 인 경우 — placeholder 노드 생성? warning 만?
3. 다국어 (한·영 혼용) alias 매칭 정확도

이 결정들은 **T-4 추출 워커** 와 **T-5 검수 / approval Cloud Function** 모두에 영향. T-11 측정에서 정확도 ≥ 80% 를 달성하려면 식별 충돌이 깔끔해야 한다.

---

## 1. canonical node ID 규칙

### 1.1 결정 — frontmatter `id` 가 우선

문서가 `id: auth-login` 을 선언하면, **canonical node ID = `<kind>:<id>`** (예: `capability:auth-login`).

frontmatter 가 `id` 를 안 주면 (등급 B / C 일 때 가능), **legacy 컨벤션** 으로 fallback:
`<kind>:<projectScopeSlug>:<titleSlug>` — 예: `element:aslan-maps:login-action`.

### 1.2 Why

- **사용자 의도 우선**: frontmatter 는 사용자가 직접 박은 명시 사실. LLM 추출보다 신뢰도 높음 (T-3 §3.3 에서 1.0 으로 못 박았음).
- **kebab-case 강제**: `id` 는 정규식 `^[a-z0-9]+(-[a-z0-9]+)*$` 통과해야 함 (T-3 frontmatter parser 가 이미 검증).
- **kind prefix**: 같은 슬러그를 다른 kind 가 쓰는 충돌 방지 (예: `capability:auth` vs `domain:auth`).
- **legacy 호환**: 기존 `applyReviewActionCore` 의 `buildCanonicalNodeId()` 를 깨지 않음. ontology 분기에서만 새 규칙 적용.

### 1.3 충돌 케이스 처리

| 케이스 | 처리 |
|---|---|
| 두 문서가 같은 `id` + 같은 `kind` 를 선언 | **같은 canonical node 로 병합** (의도된 case — 같은 개념을 가리킴). `evidenceIds[]` 에 두 문서 모두 추가. |
| 두 문서가 같은 `id` + 다른 `kind` | **충돌 — 검수 큐에 보고**. canonical node 생성 보류 + warning. 검수자가 둘 중 하나의 frontmatter 를 수정해야 진행. |
| frontmatter `id` ≠ extracted node `tempId` | extracted `tempId` 는 무시, frontmatter `id` 가 canonical. (LLM 이 내부 work id 를 별도로 쓴 것뿐.) |
| `id` 누락 (등급 B/C) | legacy 슬러그 컨벤션. |

---

## 2. `relates.target` 미존재 시 정책

### 2.1 결정 — **placeholder 노드 생성 + 낮은 confidence + warning**

frontmatter `relates: [{ type: depends_on, target: iam }]` 인데 `iam` 이 ontology 에 아직 없으면:

1. **stub 노드 생성** — id = `iam`, kind = **`unknown`** (특수 placeholder kind), confidence = 0.0 (아직 검증 안 됨), evidenceIds = [현재 문서].
2. **edge 생성** — `from = <현재 문서 id>`, `to = iam`, type = `depends_on`, confidence = 1.0 (사용자 명시).
3. **warning** — "stub created for unknown target 'iam' — please import or define."

stub 노드는 검수 큐에서 노출되어, 검수자가 두 가지 액션 중 선택:
- **promote** — kind 를 정해 (예: `project`) 진짜 노드로 승격. 다른 문서가 같은 id 로 등장하면 자연스럽게 evidenceIds 가 누적.
- **dismiss** — 잘못된 reference. edge + stub 모두 삭제.

### 2.2 Why

- **frontmatter 의 명시 관계는 보존되어야 함** — 사용자가 "이거 의존한다" 고 단언한 사실을 무음 처리 (그냥 drop) 하면 의도 손실.
- **placeholder 가 진짜 노드와 섞이지 않게** — `kind: unknown` 로 분리해 트리·검색에서 별도 표시.
- **자연스러운 진화** — 미래에 `iam` 문서가 들어오면 자동으로 evidenceIds 가 누적되고 사용자가 promote 만 누르면 됨.

### 2.3 schema 추가

`ontologyClasses` 에 6 번째 시드 추가 (T-1 후속):

```ts
{
  id: 'unknown',
  name: '미지',
  description: 'frontmatter relates.target 이 가리키는 미존재 노드의 placeholder. 검수자가 promote 또는 dismiss.',
  version: 1,
  createdBy: 'system',
}
```

`KnowledgeEdgeType` enum 변경 없음 (관계 타입은 그대로 7 종, source/target class 만 `unknown` 도 허용하도록 ontologyRelations 의 sourceClassIds/targetClassIds 를 빈 배열로 확장 — 이미 `related_to` 만 비어 있고 다른 건 제약 있음).

→ 결정: **placeholder edge 의 type 은 항상 `related_to` 로 강등** (사용자가 명시한 type 은 stub 노드 메타에 보존). 검수자가 promote 시 진짜 type 으로 복원.

이렇게 하면 `ontologyRelations` 변경 없이도 stub 노드 처리 가능.

### 2.4 stub 노드 메타 필드 (knowledgeApprovedNodes 확장)

| 필드 | 타입 | 설명 |
|---|---|---|
| `isStub` | boolean | true 면 placeholder. 검수자 전용 표시. |
| `pendingType` | string | 원본 frontmatter relates 의 type. promote 시 edge 복원에 사용. |
| `pendingFromId` | string | promote 시 복원할 source canonical ID. |

DATA-MODEL.md `knowledgeApprovedNodes` 표에 추가 필요 (별도 PR — T-12).

---

## 3. 다국어 정규화 (한·영 alias 매칭)

### 3.1 결정 — **v0 에서는 단순 대소문자 / 공백 정규화만, 한·영 양방향 매칭은 별도 task 로 미룸**

normalizeKey 함수 (functions/index.js 에 이미 존재):
```js
.toLowerCase()
.replace(/[^a-z0-9가-힣]+/g, '-')
.replace(/^-+|-+$/g, '');
```

이걸 ontology 신규 매핑에 동일하게 적용. 한글은 그대로 보존 (`가-힣` 범위), 영문은 lowercase, 그 외 문자는 하이픈.

`aliases` 매칭 알고리즘:
1. 새 노드의 `title` 과 `aliases` 모두 normalizeKey 적용 → set
2. 기존 노드들의 `title` + `aliases` 도 동일 처리
3. 두 set 의 교집합이 있으면 **병합 후보** → 검수 큐로 (자동 병합 X — confidence 0.7 이하).

### 3.2 Why not 한·영 양방향 매칭

- **번역 자동화는 별도 모델 필요** — 작은 LLM call 또는 사전 (translation API). 비용·복잡도 증가.
- **C-1 측정에 차이가 있을지 미확정** — 진안의 spec 문서가 한·영 혼용인지 확인 후 (T-11) 결정해도 늦지 않음.
- **휴리스틱 위험** — "auth" / "인증" 을 자동으로 같다고 판단하면 잘못된 병합이 더 큰 비용. 사용자가 alias 로 명시하는 게 더 안전.

### 3.3 향후 — 다국어 task (T-13 후보)

C-1 측정 데이터에서 다국어 alias 누락이 정확도 손실의 ≥ 5% 를 차지하면 별도 task:

- LLM 으로 추출 시 자동 영문 alias 제안
- 사용자가 alias 사전 (도메인 용어집) 을 frontmatter 에 추가할 수 있도록 확장 키 (`aliasesEn`)
- 검수 UI 에 "이 alias 추가?" 제안 prompt

---

## 4. 영향 — 다음 dev task

이 결정으로 발생하는 후속 PR 단위:

### T-12 — canonical mapping 모듈 (functions/ + entities/)

- **brief**: T-4 추출 결과의 frontmatter `id` → canonical node ID 매핑 + stub placeholder 생성 로직.
- **영향**:
  - `functions/ontology-extract.js` 또는 별도 `ontology-canonicalize.js`
  - 새 함수 `resolveCanonicalNodeId(extractedNode, frontmatter): { id, kind }`
  - stub 생성 함수 `createStubNode(targetId, declaredType, evidenceDocId)`
  - DATA-MODEL.md `knowledgeApprovedNodes` 에 `isStub`, `pendingType`, `pendingFromId` 필드 추가
  - `ontologyClasses` 시드에 `unknown` 6번째 클래스 추가
- **추정**: 1일.
- **상태**: ⏳ todo

### T-13 — stub promote / dismiss 검수 UI

- **brief**: 검수 큐에서 `isStub: true` 노드를 별도 섹션으로 노출 + promote (kind 선택) / dismiss 액션.
- **영향**:
  - `KnowledgeReviewWorkspacePage` 에 stub 섹션
  - 새 Cloud Function action `promoteStubNode({ nodeId, newKind })` / `dismissStubNode({ nodeId })`
- **추정**: 1.5일.
- **상태**: ⏳ todo

### T-14 — 다국어 alias matching 평가 (T-11 후 조건부)

- **brief**: T-11 측정에서 alias 매칭이 정확도 손실의 핵심이면 진행. 그 외 보류.
- **상태**: 측정 결과 의존.

---

## 5. 검증 (이 결정의 합리성)

| 결정 | 어떻게 검증할까 |
|---|---|
| frontmatter `id` 우선 | T-12 단위 테스트 — frontmatter `id` 있을 때 그대로, 없을 때 legacy slug |
| stub placeholder | T-12 + T-13 통합 테스트 — stub 노드 생성 → promote → 정상 노드로 변환 |
| 다국어 보류 | T-11 측정 결과 (alias 누락이 정확도 손실에 차지하는 비중) |

---

## 6. 변경 이력

- **2026-04-27**: 초판. T-3 §8 미해결 3 항목 결정.
