---
name: 온톨로지 TBox 진화 — version + schema evolution
description: 5 클래스 + 7 관계 고정 → 사용자가 클래스/관계 type 추가·수정 가능한 surface 설계
status: 🌱 draft (P1 spec)
date: 2026-04-28
related:
  - docs/superpowers/specs/2026-04-27-ontology-design-loop.md (v0 백본)
  - docs/superpowers/specs/2026-04-27-ontology-frontmatter-contract.md (등급 A/B/C 입력 계약)
  - docs/superpowers/specs/2026-04-27-ontology-id-resolution.md (canonical ID + stub)
  - docs/superpowers/specs/2026-04-27-ontology-v1-experience-concept.md (v1 UX)
---

# 온톨로지 TBox 진화

> v0 가 **고정 schema** 위에서 fact 만 자라게 했다면, v1 다음 단계는 **schema 자체가 자라는** 시스템. 사용자가 새 클래스·관계를 정의할 수 있어야 ontology 가 진짜 "성장하는 지식 그래프" 가 된다.

---

## 1. 한 문장

> **사용자가 자기 도메인에 맞는 새 ontology 클래스/관계 타입을 추가하면, 기존 fact graph 는 깨지지 않고 새 schema 를 흡수한다.**

---

## 2. 현재 상태와 문제

### 2.1 v0 의 TBox 고정 정책

- `ontologyClasses` Firestore 컬렉션: `project / domain / capability / element / document / unknown` (6 docs, `unknown` 은 stub placeholder)
- `ontologyRelations` Firestore 컬렉션: `contains / belongs_to / depends_on / implements / uses / describes / related_to` (7 docs)
- 시드 진실원: `seed-ontology-tbox.mjs` + `DEFAULT_ONTOLOGY_CLASSES` / `DEFAULT_ONTOLOGY_RELATIONS` (functions/index.js)
- 변경 path: 없음. Firestore 콘솔 직접 수정만 가능.

### 2.2 문제

- 진안의 도메인이 자라면 새 kind 가 필요해질 수 있음 (예: `concept`, `pattern`, `decision`, `incident`, `team`)
- 현재 `kind` 가 5 종으로 제한돼, frontmatter contract `kind: <enum>` 에서 미허용.
- 추출 워커도 `kind` enum validator 가 hardcoded.
- 결과: ontology 가 "현재 도메인 모델을 정확히 반영" 못 함 → "어쩔 수 없이 element 로 다 욱여넣음" 식 노이즈 누적.

---

## 3. 해결 옵션

### 3.1 옵션 A — TBox versioning (권장)

- `ontologyTBoxVersions/{vN}` 새 컬렉션. 각 version 이 classes/relations snapshot.
- 활성 version 1 개 (`ontologyTBoxState/active.versionId`).
- 사용자가 schema 변경 시 **새 version 생성** + 활성화.
- **장점**: 기존 fact node `kind` 가 어떤 version 의 클래스인지 추적 가능 (`KnowledgeGraphNode.tboxVersionId`).
- **단점**: 데이터 모델 1단계 추가. fact 와 TBox 간 join 비용.

### 3.2 옵션 B — TBox 단일 mutable + audit log

- `ontologyClasses` / `ontologyRelations` 그대로 mutable. 변경 시 `ontologyTBoxAudit/{auditId}` 에 기록.
- 활성 version 개념 없음 — 항상 최신.
- **장점**: 모델 단순. 기존 코드 변경 최소.
- **단점**: 과거 fact 가 "이 노드 만들 때 kind 정의가 어땠는가?" 추적 불가. 클래스 삭제 시 dangling reference 발생.

### 3.3 옵션 C — Append-only TBox

- 클래스·관계는 **추가만 가능**, 삭제 불가. `deprecated: true` flag 로 hide.
- **장점**: dangling reference 0. 모델 단순.
- **단점**: schema 정리 욕구 (잘못 만든 클래스 폐기) 충족 못 함.

### 3.4 결정

→ **옵션 A (versioning)** 채택. 이유:
- ontology 의 audit 가치는 fact 와 schema 가 시간상 일치해야 하는 데 있음.
- 기존 fact 가 "어느 시점 schema 에 따라 만들어졌는지" 보존돼야 추출 결과 재현 가능.
- 모바일 / export 기획에서도 version 단위 snapshot 이 유용.

옵션 C 의 append-only 는 단계적으로 흡수 — Phase 1 은 클래스 추가만 허용, deprecate 는 Phase 3.

---

## 4. 사용자 시나리오

### S1 — 진안, 새 클래스 `concept` 추가

- `/settings/ontology` (신규 라우트) 진입
- "새 클래스 추가" 버튼 → 모달
- name=`concept`, label=`개념`, description=`도메인 핵심 개념 — capability 보다 추상적`
- 제출 → 새 TBox version 생성 + 활성화
- 새 문서 frontmatter 에 `kind: concept` 사용 가능

### S2 — 진안, 기존 `element` 클래스 라벨 수정 (오타 fix)

- `/settings/ontology` 클래스 행 클릭 → inline 편집
- label=`요소` → `요소(컴포넌트)` 변경
- 제출 → 새 TBox version 생성 + 활성화
- 기존 element 노드의 표시 라벨이 새 version 에 따라 갱신

### S3 — 진안, 새 관계 type `triggers` 추가

- `/settings/ontology` "관계 탭" → "새 관계 타입 추가"
- name=`triggers`, label=`발화`, fromKinds=`[event]`, toKinds=`[capability]`
- 제출 → 새 version 활성화
- 새 manual edge create modal 에서 `triggers` 선택 가능

### S4 — 시스템, deprecate 처리

- (Phase 3) `/settings/ontology` 클래스 행 → "사용 중단"
- 새 문서가 그 kind 사용 못 함 (frontmatter 검증 거부)
- 기존 노드는 그대로, 단 UI 에서 "사용 중단된 kind" 안내

---

## 5. 데이터 모델

### 5.1 새 컬렉션 — `ontologyTBoxVersions/{versionId}`

```ts
interface OntologyTBoxVersion {
  versionId: string;       // 'v1' / 'v2' / ... 또는 timestamp
  accountId: string;
  createdAt: Timestamp;
  createdBy: string;       // uid
  classes: OntologyClassDef[];
  relations: OntologyRelationDef[];
  /** 변경 요약 (사람이 읽음). */
  changeNote?: string;
}

interface OntologyClassDef {
  name: string;            // 'capability', 'concept', ...
  label: string;           // 한국어 라벨
  description?: string;
  /** Phase 3 deprecate. */
  deprecated?: boolean;
  /** 색·아이콘 token (UI 일관성). UNKNOWN_TONE 같은 token 참조. */
  toneToken?: string;
}

interface OntologyRelationDef {
  name: string;            // 'depends_on', 'triggers', ...
  label: string;
  fromKinds?: string[];    // 제약 (옵션) — beyond 모든 kind
  toKinds?: string[];
  description?: string;
  deprecated?: boolean;
}
```

### 5.2 활성 version 포인터

```ts
// ontologyTBoxState/active
interface OntologyTBoxActiveState {
  accountId: string;
  versionId: string;       // 현재 활성 version
  activatedAt: Timestamp;
  activatedBy: string;
}
```

### 5.3 fact node 확장

`KnowledgeGraphNode` 에 `tboxVersionId?: string` 옵션 필드 추가. legacy default = 'v0' (현재 5 클래스 시드).

추출 워커가 노드 생성 시 활성 version 의 versionId 를 박음.

### 5.4 호환성

- `ontologyClasses` / `ontologyRelations` 컬렉션은 **read-only legacy** 유지 — 신규 surface 는 `ontologyTBoxVersions/{active}` 만 read.
- mapper 함수에 `loadActiveTBox(accountId)` 추가 — 기존 `loadOntologyTBox()` 와 fallback chain.

---

## 6. UI 진입점

### 6.1 새 라우트 — `/settings/ontology`

(또는 `/ontology/schema`. `/settings/*` 가 시스템 설정 컨벤션이라 `/settings/ontology` 우선.)

- 두 탭: "클래스" / "관계"
- 각 탭에 list + "추가" 버튼 + 행 클릭 inline 편집
- "현재 활성 version v3 (3 분 전)" 표시
- "version 히스토리" link → 과거 version 목록 (read-only)

### 6.2 새 widget

- `<TBoxClassEditor>` — 클래스 추가/수정 모달
- `<TBoxRelationEditor>` — 관계 추가/수정 모달
- `<TBoxVersionHistory>` — 과거 version 시각화

---

## 7. Firestore rules

```
match /ontologyTBoxVersions/{versionId} {
  allow read: if isAccountMember(resource.data.accountId);
  allow create: if isAccountOwner(request.resource.data.accountId)
                && request.resource.data.createdBy == request.auth.uid;
  // immutable — 새 변경은 새 version 으로.
  allow update, delete: if false;
}

match /ontologyTBoxState/{stateId} {
  allow read: if isAccountMember(resource.data.accountId);
  allow update: if isAccountOwner(resource.data.accountId);
}
```

권한: account owner 만 schema 변경 (member 는 read).

---

## 8. 단계적 구현 plan

### Phase 1 — versioning 데이터 모델 (docs-first)

- 타입 + mapper + Firestore rules + DATA-MODEL.md 갱신
- 기존 `loadOntologyTBox` 가 `loadActiveTBox` 로 fallback chain
- legacy v0 = 시드된 6 클래스 + 7 관계 (변환)
- **분량**: 3-4 fire

### Phase 2 — 클래스 추가만 (read-mostly)

- `/settings/ontology` 라우트 + 클래스 list + "새 클래스 추가" 모달
- 새 version 생성 → 활성화
- 추출 워커가 활성 version 사용
- **분량**: 4-5 fire

### Phase 3 — 관계 타입 추가

- "관계 탭" + 새 관계 추가 모달
- ManualEdgeCreateModal 의 type 드롭다운이 활성 version 사용
- **분량**: 3-4 fire

### Phase 4 — 클래스/관계 수정 (라벨·설명만)

- 기존 항목 inline 편집
- name 변경은 deprecation+추가 패턴 (호환 보존)
- **분량**: 3 fire

### Phase 5 — Deprecate

- 기존 항목 "사용 중단" 토글
- 새 문서/노드가 deprecated kind 사용 못 함
- 기존 노드는 그대로
- **분량**: 2-3 fire

**총 15-19 fire** — 큰 작업. Phase 1-2 만 해도 가치 큼.

---

## 9. 위험 / 대안

### 9.1 위험

- **schema thrashing**: 사용자가 자주 클래스 추가 → version 폭발. 완화: rate limit (1 일 N version)
- **fact graph 호환**: `tboxVersionId` 가 옛 version 가리키는데 그 version 이 polluted? 완화: version 은 immutable
- **추출 워커 prompt drift**: 활성 version 이 자주 바뀌면 LLM 출력 안정성 ↓. 완화: prompt 에 version snapshot 포함

### 9.2 대안

- "TBox 변경은 docs PR 형태" — 코드 레벨에서만 변경 가능. 단점: 비기술 사용자 불가
- "TBox 는 read-only, 새 kind 는 `unknown` 으로 자라고 검수자가 promote" — 단점: 검수 부담 ↑

---

## 10. 다음 액션

1. **사용자 결정 항목**:
   - 옵션 A (versioning) vs B (mutable + audit) vs C (append-only) 채택?
   - `/settings/ontology` 라우트 vs `/ontology/schema` 위치?
   - 권한: owner only vs member 전부?
2. Phase 1 docs-first 시작 — 타입 + mapper + rules.

---
