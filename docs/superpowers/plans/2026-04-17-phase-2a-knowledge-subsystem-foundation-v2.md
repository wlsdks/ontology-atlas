# Phase 2A 구현 계획 — Knowledge Subsystem Foundation v2

> Goal: 공개 제품을 건드리지 않고 admin-only knowledge subsystem의 foundation만 구축한다.

**Reference:**

- [`../specs/2026-04-17-document-knowledge-subsystem-v2.md`](../specs/2026-04-17-document-knowledge-subsystem-v2.md)
- [`../../DATA-MODEL.md`](../../DATA-MODEL.md)
- [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)
- [`../../ADMIN-GUIDE.md`](../../ADMIN-GUIDE.md)

---

## 1. 실행 게이트

이 플랜은 아래가 문서와 rules에 반영된 뒤에만 실행 가능하다.

1. public/private collection 경계 확정
2. private approved graph canonical store 확정
3. raw markdown Storage 계약 확정
4. trusted backend 경계 확정
5. document metadata canonical rule 확정

즉, 이 플랜은 foundation 구현 계획이지 탐색 문서가 아니다.

현재 repo 기준으로는 위 게이트가 문서상 반영된 상태다. 이제 남은 것은 구현과 검증이다.

---

## 2. 이번 단계의 범위

### 포함

- knowledge 컬렉션과 Storage 경로 스키마
- document/version/chunk 모델
- extraction job 모델
- review 모델의 저장 계약
- private approved graph canonical store
- public projection 컬렉션 계약
- `/admin/knowledge`
- `/admin/knowledge/documents`
- `/admin/knowledge/documents/new`
- `/admin/knowledge/documents/view/?id=...` (static export compatible detail)
- trusted backend contract 문서화

### 제외

- 홈 ontology canvas
- public domain/capability/element routes
- `/admin/knowledge/reviews`의 완성형 실행 UI
- `/admin/knowledge/graph`의 완성형 inspector UI
- actual extraction worker 구현
- Gemini adapter 구현
- publish executor 구현
- merge workflow 구현

이번 단계의 목표는 “운영 기반을 코드로 받을 수 있는 상태”를 만드는 것이다.

---

## 3. 선행 결정

구현 전 반드시 아래를 고정한다.

1. public vs private collection 경계
2. canonical hierarchy field = `parentId`
3. `projectIds: string[]`
4. raw markdown는 Storage `knowledge-documents/`에 저장
5. private approved graph canonical store 사용
6. public projection은 별도 컬렉션 사용
7. trusted backend = Cloud Functions for Firebase (2nd gen)
8. document metadata canonical rule = frontmatter 우선, 없으면 UI metadata, document header는 current version 파생값

---

## 4. 작업 트랙

### Track A — 문서/스키마

- [x] `docs/DATA-MODEL.md`에 knowledge subsystem 컬렉션 반영
- [x] `firestore.rules`에 public/private 및 backend-owned 경계 반영
- [x] `storage.rules`에 `knowledge-documents/` 원문 경로 반영
- [x] `firestore.indexes.json`에 documents/jobs/reviews/public projection 인덱스 반영
- [x] `docs/ADMIN-GUIDE.md`에 knowledge 운영 플로우 반영
- [x] `docs/ARCHITECTURE.md`와 backend contract 문서 반영

### Track B — 엔티티 모델

- [ ] `entities/knowledge-document`
- [ ] `entities/knowledge-version`
- [ ] `entities/knowledge-chunk`
- [ ] `entities/knowledge-job`
- [ ] `entities/knowledge-review`
- [ ] `entities/knowledge-approved-graph`
- [ ] `entities/knowledge-public-graph`

### Track C — 최소 Admin UI

- [x] `/admin/knowledge` 대시보드 뼈대
- [x] `/admin/knowledge/documents` 목록 화면
- [x] `/admin/knowledge/documents/new` 등록 화면 또는 주소 가능한 생성 시트
- [x] `/admin/knowledge/documents/view/?id=...` 상세 화면

문서 상세 최소 범위:

- [x] 현재 version 표시
- [x] version 목록
- [x] 새 version 업로드
- [x] extraction job 상태 확인
- [x] 실패/재시도 가능 여부 표시

화면 계약 최소 추가 항목:

- [x] metadata conflict preview
- [x] version timeline + diff panel
- [x] job action matrix
- [x] documents list query contract
- [x] empty/loading/error/no-access state

### Track D — Trusted Backend Contract

- [x] Cloud Functions 2nd gen 책임 범위 문서화
- [x] extraction input/output zod schema 정의
- [x] job 상태 머신 문서화
- [x] idempotency/lease/reclaim 규칙 문서화
- [x] approved graph write / public projection publish ownership 문서화
- [x] `enqueueExtractionJob` callable 스캐폴드 및 admin UI 연동

---

## 5. 권장 FSD 배치

```text
src/
  entities/
    knowledge-document/
    knowledge-version/
    knowledge-chunk/
    knowledge-job/
    knowledge-review/
    knowledge-approved-graph/
    knowledge-public-graph/
  features/
    knowledge-document-create/
    knowledge-document-version-upload/
    knowledge-job-enqueue/
  widgets/
    knowledge-dashboard-summary/
    knowledge-document-table/
    knowledge-document-detail/
    knowledge-job-status-panel/
  views/
    admin-knowledge-dashboard/
    admin-knowledge-documents/
    admin-knowledge-document-new/
    admin-knowledge-document-detail/
```

---

## 6. 이번 단계에서 하지 않을 것

- review queue 실행 UX 완성
- merge workspace 구현
- `/admin/knowledge/reviews`의 triage/publish 운영 UI
- `/admin/knowledge/graph`의 graph inspector 완성
- Gemini adapter 작성
- extraction executor 작성
- public projection writer 작성
- project detail knowledge cards 연결

이 항목들은 Phase 2B 이후로 넘긴다.

## 6.1 2A 종료점

2A는 아래 중 하나로 종료점을 명시해야 한다.

- `A안`: 문서 등록/버전 업로드/job enqueue/job 상태 관찰까지 구현
- `B안`: 위 + approved graph 저장 경계에 대한 fixture 검증까지 수행

팀은 구현 시작 전 둘 중 하나를 택해야 한다. 현재 문서 기준 권장은 `A안`이다.

---

## 7. 수용 기준

- knowledge 문서를 등록할 수 있다.
- 문서는 version 단위로 저장된다.
- raw markdown는 Storage에 저장된다.
- extraction job 문서와 상태 머신 계약이 문서/타입 수준에서 닫힌다.
- trusted backend 책임 범위가 명확히 문서화된다.
- private approved graph canonical store가 스키마에 존재한다.
- 공개 앱은 여전히 knowledge subsystem에 의존하지 않는다.

---

## 8. 리스크 메모

- private approved graph가 없으면 `knowledgePublic*`가 사실상 source of truth가 된다.
- raw markdown를 Firestore에 넣으면 곧바로 문서 크기 제한과 rewrite 비용에 걸린다.
- trusted backend가 없으면 backend-owned 컬렉션 보안 모델이 무너진다.
- Phase 2A 범위를 넓히면 foundation 단계에서 다시 갈아엎을 가능성이 높다.

## 9. Phase 2B 진입 게이트

아래가 모두 충족될 때만 2B를 연다.

1. 실제 knowledge 문서/버전/job 데이터가 최소 1세트 이상 생성됨
2. Firestore/Storage rules 검증 완료
3. Cloud Functions contract 고정
4. 운영자 기준 dry-run 1회 완료
5. public 앱에서 knowledge reference가 아직 0건임을 확인
