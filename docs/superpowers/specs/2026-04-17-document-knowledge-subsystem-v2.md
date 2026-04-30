# Aslan Project Map — Document Knowledge Subsystem v2

**작성일**: 2026-04-17
**작성자**: 진안 + Codex
**상태**: 제안
**버전**: 2.1
**이전 검토안**: [`2026-04-17-ontology-driven-project-map.md`](./2026-04-17-ontology-driven-project-map.md)

---

## 1. 결정

### 1.1 이번에 만드는 것

이번 단계에서 만드는 것은 공개 홈을 온톨로지로 교체하는 제품이 아니다.

이번 단계의 정체는 아래와 같다.

- `문서 기반 지식 운영 서브시스템`
- 운영 경로는 `/admin/knowledge/*`
- Markdown 문서를 등록하고
- 추출 후보를 만들고
- 사람이 검수하고
- 승인된 결과만 private canonical graph에 반영한 뒤
- 공개용 projection으로 publish하는 구조

즉, 공개 포트폴리오 맵은 유지하고 지식 구조화 시스템은 **분리된 admin-only subsystem**으로 먼저 구축한다.

### 1.2 왜 이렇게 바꾸는가

현재 제품의 중심은 아래다.

- 공개 프로젝트 토폴로지
- 프로젝트 상세 페이지
- 1인 어드민 프로젝트 CRUD

여기에 곧바로 문서 추출 기반 온톨로지를 얹으면 제품의 중심이 방문자 경험에서 내부 운영 시스템으로 바뀐다. 따라서 knowledge는 먼저 별도 운영 서브시스템으로 설계해야 한다.

### 1.3 이번 설계의 목표

1. 공개 제품을 깨지 않는다.
2. 문서 기반 지식 추출 파이프라인을 admin 전용으로 구축한다.
3. raw 문서, extraction, review는 비공개로 유지한다.
4. 승인된 결과만 private canonical graph와 public projection으로 분리 저장한다.
5. 이후 공개 화면이 필요해지더라도 projection만 읽게 만든다.

### 1.4 이번 설계의 Non-Goals

- 홈 `/`를 ontology 메인 뷰로 바꾸는 것
- 기존 `projects` CRUD를 없애는 것
- 자유형 Markdown을 완전 자동으로 정답화하는 것
- review 없이 자동으로 공개 반영하는 것
- Next.js 앱 안에 worker/job executor를 직접 넣는 것

---

## 2. 제품 경계

### 2.1 유지할 것

- `/` 공개 프로젝트 토폴로지
- `/project/[slug]` 프로젝트 상세
- `/admin/dashboard` 프로젝트 운영 홈
- 기존 `projects` 컬렉션 기반 CRUD

### 2.2 새로 추가할 것

- `/admin/knowledge`
- `/admin/knowledge/documents`
- `/admin/knowledge/documents/new`
- `/admin/knowledge/documents/[id]`
- `Phase 2A 구현 경로: /admin/knowledge/documents/view/?id=...`
- `/admin/knowledge/reviews`
- `/admin/knowledge/graph`

### 2.3 아직 하지 않을 것

- 공개 홈에서 domain/capability/element를 주인공으로 승격
- raw markdown 또는 review 상태를 공개 페이지에서 직접 노출
- public route에 knowledge node 전용 permalink 도입

---

## 3. 핵심 원칙

### 3.1 Public과 Private를 분리한다

아래는 **비공개 admin 데이터**다.

- raw markdown 원문
- parsed chunks
- extraction jobs
- extraction outputs
- review queue
- approved graph canonical store

아래는 **공개 가능 projection**이다.

- 승인된 knowledge public node
- 승인된 knowledge public edge
- 공개용 evidence summary

공개 화면은 raw ingest 데이터를 읽지 않는다.

### 3.2 Source of truth를 섞지 않는다

이번 단계에서는 진실원을 아래처럼 분리한다.

- 공개 프로젝트 truth: `projects`
- knowledge canonical truth: `knowledgeApprovedNodes`, `knowledgeApprovedEdges`
- 공개 knowledge read model: `knowledgePublicNodes`, `knowledgePublicEdges`

`knowledgePublic*`는 source of truth가 아니다. publish 결과물이다.

### 3.3 Projection만 공개한다

공개용 graph는 raw candidate graph가 아니라 **approved public graph projection**이다.

즉:

- review 전 후보는 절대 공개 안 함
- review 후 승인된 구조만 private approved graph에 반영
- publish가 private approved graph를 public projection으로 내보냄
- 공개 클라이언트는 projection만 구독

### 3.4 Evidence는 immutable해야 한다

evidence는 나중에 재현 가능해야 한다.

필수 속성:

- `documentVersionId`
- `versionHash`
- `chunkId`
- `chunkHash`
- `charRange`
- `excerpt`
- `locatorVersion`
- `extractorVersion`
- `createdAt`

문서가 수정되어도 과거 승인 근거는 사라지지 않아야 한다.

### 3.5 Trusted backend를 명시한다

추출과 publish는 브라우저가 직접 수행하지 않는다.

이번 설계에서 trusted backend는 다음으로 고정한다.

- **Cloud Functions for Firebase (2nd gen)** 또는 동급의 Firebase Admin SDK 실행 경계

책임은 아래와 같이 나눈다.

- Next.js 앱: 문서 등록, job 생성 요청, review UI, publish 요청
- trusted backend: chunk 생성, extraction 실행, output 저장, approved graph 반영, public projection publish

즉, 정적 export 제약을 유지하면서도 쓰기 신뢰 경계를 분리한다.

---

## 4. 정보구조

### 4.1 공개 제품의 정보구조

공개 제품의 첫 화면 서사는 여전히 아래다.

- "아슬란의 프로젝트 생태계"
- "어떤 허브 위에 어떤 프로젝트가 얹혀 있는가"

즉, 공개 메인 IA는 유지한다.

### 4.2 지식 서브시스템의 정보구조

서브시스템 내부에서는 아래 4개 층을 다룬다.

1. `Document`
2. `Candidate Output`
3. `Approved Graph`
4. `Public Projection`

운영자는 문서에서 후보를 만들고, 후보를 승인해 approved graph로 승격한 뒤, 공개가 필요할 때만 projection으로 publish한다.

운영 IA 우선순위는 아래처럼 둔다.

1. `Documents`
2. `Reviews`
3. `Publish`
4. `Graph`

`Graph`는 탐색 도구이지, 1차 운영 루프의 중심이 아니다.

### 4.3 공개 연동 방식

승인 그래프는 바로 홈에 붙지 않는다.

공개 연동 우선순위:

1. 프로젝트 상세 페이지 안의 보조 지식 섹션
2. 어드민 내부 knowledge graph 화면
3. 이후 필요 시 공개 서브페이지

홈 전면 교체는 마지막 단계다.

### 4.3.1 단계별 구현 범위

| 단계 | admin routes | review/publish | public reads |
| --- | --- | --- | --- |
| `Phase 2A` | `documents`, `documents/new`, `documents/[id]`, `dashboard shell` | 계약 문서만 존재 | 없음 |
| `Phase 2B` | `reviews`, `graph` 운영 화면 추가 가능 | review workflow / publish workflow | 여전히 없음 |
| `Public Integration` | admin 운영 유지 | publish 안정화 이후 | `knowledgePublic*`만 허용 |

`Phase 2A`에서는 공개 페이지가 knowledge 데이터를 읽지 않는다.

### 4.4 프로젝트 상세의 field ownership

프로젝트 상세에서 데이터 소유권은 아래처럼 분리한다.

- `projects` 소유:
  - 제목
  - 기본 설명
  - detail markdown
  - tags
  - stack
  - links
  - screenshots
- `knowledgePublic*` 소유:
  - domain/capability/element 요약 카드
  - 관련 문서 요약 카드
  - evidence count

같은 UI 카드 안에서 두 진실원을 섞어 편집하지 않는다.

---

## 5. 데이터 모델 원칙

### 5.1 컬렉션 그룹

초기 컬렉션은 아래처럼 나눈다.

```text
firestore/
├── projects/                        public canonical
├── knowledgePublicNodes/            public projection
├── knowledgePublicEdges/            public projection
├── knowledgeDocuments/              admin private
├── knowledgeDocumentVersions/       admin private
├── knowledgeDocumentChunks/         admin private
├── knowledgeExtractionJobs/         admin private
├── knowledgeExtractionOutputs/      admin private
├── knowledgeReviews/                admin private
├── knowledgeApprovedNodes/          admin/private canonical
└── knowledgeApprovedEdges/          admin/private canonical
```

### 5.2 `Document`와 `Version`을 분리하는 이유

문서 본문은 시간이 지나며 변한다. evidence는 과거 특정 시점의 문서를 가리켜야 한다.

따라서:

- `knowledgeDocuments`: 문서 헤더와 현재 상태
- `knowledgeDocumentVersions`: raw markdown version 메타
- `knowledgeDocumentChunks`: 버전별 chunk

### 5.3 raw markdown는 Storage에 둔다

raw markdown를 Firestore 문서 본문에 넣지 않는다.

이유:

- Firestore 문서 크기 제한 회피
- 큰 문서 업로드/교체 안정성 확보
- version 메타와 원문 payload 분리

따라서 version 문서는 아래만 가진다.

- `storagePath`
- `sizeBytes`
- `hash`
- `frontmatter`
- 생성 메타

원문은 `knowledge-documents/{documentId}/{versionId}.md` 경로에 저장한다.

### 5.4 계층 표현은 하나만 canonical로 둔다

상하위 구조는 아래 하나만 canonical로 둔다.

- `parentId`

`contains`와 `belongs_to`는 저장형 canonical relation으로 두지 않는다. 필요하면 projection 단계에서 파생해 만든다.

이번 설계에서는 **canonical hierarchy = `parentId`** 로 고정한다.

### 5.5 relation 모델

관계 타입은 아래만 허용한다.

- `depends_on`
- `implements`
- `uses`
- `describes`
- `related_to`

구조 관계는 relation으로 중복 저장하지 않는다.

### 5.6 project 연결 정책

초기에는 `projectIds: string[]`로 둔다.

이유:

- shared capability/element가 여러 프로젝트에 걸칠 수 있음
- 단일 `projectId`로 고정하면 재마이그레이션 가능성이 큼

---

## 6. 문서 모델

### 6.1 `knowledgeDocuments`

문서 엔트리 메타.

예상 필드:

- `id`
- `title`
- `kind`
- `projectIds`
- `sourceType`
- `currentVersionId`
- `formatScore`
- `status`
- `createdAt`
- `updatedAt`

### 6.2 `knowledgeDocumentVersions`

문서 원문 버전 메타.

예상 필드:

- `id`
- `documentId`
- `title`
- `kind`
- `projectIds`
- `frontmatter`
- `storagePath`
- `sizeBytes`
- `hash`
- `createdAt`
- `createdBy`

버전은 append-only로 취급한다. 기존 version 본문을 덮어쓰지 않는다.

### 6.3 `knowledgeDocumentChunks`

버전 기반 chunk.

예상 필드:

- `id`
- `documentVersionId`
- `headingPath`
- `markdown`
- `charStart`
- `charEnd`
- `createdAt`

### 6.4 문서 규격 정책

규격 문서는 우대하고, 자유형 문서는 허용하되 review 부하를 감수한다.

필수 최소값:

- `title`
- `kind`
- `projectIds`

### 6.5 metadata canonical rule

문서 메타의 우선순위는 아래로 고정한다.

1. frontmatter가 있으면 frontmatter 우선
2. frontmatter가 없으면 UI form 입력 사용
3. `knowledgeDocuments` 헤더는 `currentVersionId`의 canonical metadata를 반영한 파생 상태

즉, UI form과 version frontmatter가 서로 다른 값을 동시에 진실원으로 갖지 않는다.

### 6.6 등록 화면의 metadata conflict UX

`/admin/knowledge/documents/new`는 업로드 직후 아래 3열 비교를 보여준다.

- `UI 입력값`
- `frontmatter 값`
- `최종 canonical 값`

충돌 필드는 배지로 표시한다.

최소 CTA:

- `이 값으로 등록`
- `업로드 취소`
- `frontmatter 없는 새 문서로 등록`

---

## 7. Candidate Output와 Review

### 7.1 candidate는 공개 데이터가 아니다

candidate는 아래 특성을 가진다.

- 불완전함
- 중복 가능
- 잘못된 kind 가능
- 잘못된 relation 가능

따라서 candidate는 raw extraction output으로만 저장한다.

### 7.2 review는 3개 버킷으로 나눈다

운영 UX는 한 화면에 모든 결정을 몰아넣지 않는다.

초기 버킷:

1. `Document Batch Review`
   - 이 문서 결과를 통째로 승인 가능한가
   - 규격 위반이 심한가
   - 재추출이 필요한가
2. `Merge Queue`
   - 기존 node와 merge가 필요한가
   - 영향 범위가 큰가
3. `Low-confidence Item Review`
   - relation type correction
   - hierarchy correction
   - 신규 edge/node의 세부 수정

foundation 단계에서는 이 구조를 저장 계약으로만 닫고, 완성형 운영 UX는 다음 단계로 미룬다.

### 7.3 safe publish 정책

모든 후보를 수동 승인하지 않는다.

초기 정책:

- 높은 confidence + 충돌 없음 + 규격 문서 기반 = batch auto-approvable candidate
- merge/reparent/type correction 필요 = manual review

### 7.4 review 상태

- `open`
- `approved`
- `rejected`
- `snoozed`
- `superseded`

### 7.5 merge 정책

merge는 가장 위험한 작업이므로 별도 뷰에서 처리한다.

- 일반 queue와 분리
- 양측 evidence 비교
- 영향 노드 수 표시
- merge 전 preview 제공

---

## 8. Worker와 Job 설계

### 8.1 worker 책임

- document version 로드
- chunking
- extraction prompt 구성
- provider 호출
- candidate output 저장
- review item 생성

### 8.2 메인 앱 책임

- 문서 등록
- version 생성
- job enqueue 요청
- review UI
- publish 요청

### 8.3 job 필수 필드

- `status`
- `attemptCount`
- `leaseOwner`
- `leaseExpiresAt`
- `idempotencyKey`
- `errorCode`
- `errorMessage`
- `createdAt`
- `updatedAt`

상태 머신은 아래로 닫는다.

- `queued`
- `leased`
- `processing`
- `succeeded`
- `failed`
- `superseded`

### 8.4 멱등성 규칙

같은 `documentVersionId + extractorVersion` 조합은 한 번의 논리적 extraction으로 본다.

즉:

- 같은 입력으로 중복 결과 생성 금지
- retry는 기존 output을 supersede하거나 overwrite rule이 있어야 함
- stale lease는 `leaseExpiresAt` 기준 reclaim 가능해야 함

### 8.5 provider 경계

Gemini는 첫 provider로 사용 가능하다. 다만 계약은 아래만 노출한다.

```ts
type ExtractionProvider = {
  extract(input: ExtractionInput): Promise<ExtractionOutput>;
};
```

메인 앱과 review UI는 Gemini SDK를 몰라야 한다.

---

## 9. Approved Graph와 Public Projection

### 9.1 private canonical store

승인 결과의 진실원은 아래 private 컬렉션이다.

- `knowledgeApprovedNodes`
- `knowledgeApprovedEdges`

이 컬렉션은 account member 가 보는 canonical graph 다. **두 가지 출처가 공존**한다 (§9.1.1 참조). evidence excerpt 자체를 진실원으로 들고 있지 않고, evidence ID 참조를 통해 승인 근거를 추적한다.

### 9.1.1 source 계약 — extraction vs manual

`knowledgeApprovedNodes` / `knowledgeApprovedEdges` 의 모든 엔트리는 `source` 필드로 출처를 구분한다.

| source | 누가 쓰는가 | 검수 단계 |
|---|---|---|
| `"extraction"` | trusted server (Cloud Function `applyReviewActionCore`) | 추출 → 검수 → 승인 |
| `"manual"` | account member 클라이언트 (직접 쓰기) | 우회 — 작성자가 곧 검수자 |

**필수 필드 (manual)**:

- `source: "manual"`
- `manualAuthor: <auth.uid>` — Firestore rules 가 `request.auth.uid` 와 일치 여부를 강제.
- `manualNote?: string` — 작성자가 남긴 자유 메모.

**Firestore rules 강제** (`firestore.rules` knowledgeApprovedNodes/Edges):

- account member 만 manual 노드/관계를 create / update / delete.
- create 시 노드 kind 화이트리스트 5 종 (project / domain / capability / element / document) — `unknown` 은 server-only (stub placeholder).
- create 시 client 가 `isStub` / `pendingType` / `pendingFromId` 필드를 주입해 server-created stub 으로 위장하는 경로 차단.
- update 시 server-created stub (`resource.data.isStub == true`) 은 client 가 수정 불가 — promote/dismiss 는 Cloud Function (`promoteStubNode` / `dismissStubNode`) 전용.
- update 시 `source` / `kind` / `accountId` / 엣지의 `from` / `to` / `type` 변조 금지.

**§3.2 source-of-truth 단일성**:

`source: "manual"` 는 v0 의 ontology manual editor (별도 spec: `2026-04-27-ontology-manual-editor-v0.md`) 가 검수 단계를 우회해도, **canonical store 는 여전히 `knowledgeApproved*` 하나** 라는 원칙을 유지하기 위한 채널이다. extraction 과 manual 이 같은 컬렉션에서 공존하되 source 필드로 lineage 가 보존된다. publish 시 두 source 모두 같은 public projection 으로 흘러간다.

### 9.2 public projection

공개용 graph는 아래 컬렉션으로 분리한다.

- `knowledgePublicNodes`
- `knowledgePublicEdges`

publish는 private approved graph를 읽어 public projection을 재생성하거나 갱신한다.

### 9.3 `knowledgePublicNodes`

예상 필드:

- `id`
- `title`
- `kind`
- `projectIds`
- `parentId`
- `summary`
- `evidenceCount`
- `lastApprovedAt`

### 9.4 `knowledgePublicEdges`

예상 필드:

- `id`
- `from`
- `to`
- `type`
- `projectIds`
- `lastApprovedAt`

### 9.5 공개 Evidence 정책

공개에는 raw excerpt 전체를 보여주지 않는다.

공개 가능 evidence는 요약형만 쓴다.

- `source document title`
- `approved summary`
- `evidence count`

raw excerpt, char range, chunk markdown는 admin private로 유지한다.

### 9.6 공개 연동 1차 위치

가장 현실적인 1차 공개 연동 위치는 프로젝트 상세다.

예시:

- `이 프로젝트의 주요 도메인`
- `주요 capability`
- `구현 요소`
- `관련 문서 요약`

홈 메인 캔버스는 기존 토폴로지를 유지한다.

### 9.7 공개 연동 착수 조건

프로젝트 상세에 knowledge를 붙이려면 최소 아래가 닫혀야 한다.

1. public projection publish 구현
2. private/public rules 검증 완료
3. `knowledgePublic*` lineage 추적 가능
4. 운영 승인 SLA 확보
5. 기존 URL 계약 정리 완료

---

## 10. 라우트 전략

### 10.1 이번 단계에서 확정할 라우트

- `/admin/knowledge`
- `/admin/knowledge/documents`
- `/admin/knowledge/documents/new`
- `/admin/knowledge/documents/[id]`
- `/admin/knowledge/reviews`
- `/admin/knowledge/graph`

`/admin/knowledge/documents/new`는 새 문서 등록의 명시적 진입점이다. 등록 성공 후에는 해당 문서 상세로 이동한다.

정적 export 제약 때문에 `Phase 2A` 구현은 `/admin/knowledge/documents/view/?id=...`를 detail route로 사용한다. canonical `[id]` 경로는 나중 단계에서 URL 계약을 정리할 때 다시 올린다.

### 10.1.1 문서 상세의 최소 운영 흐름

문서 상세는 아래 작업을 한 화면에서 처리할 수 있어야 한다.

1. 현재 기준 version 확인
2. 새 version 업로드
3. 현재 기준 version과 신규 version의 차이 확인
4. extraction job 상태 확인
5. 실패 원인 확인과 안전한 재시도 판단

즉, 상세 페이지는 viewer가 아니라 운영 판단 화면이다.

문서 상세 기본 레이아웃은 아래 3패널을 기준으로 한다.

- `Version timeline`
- `Selected version panel`
- `Diff panel`

Diff는 최소 아래 두 섹션을 분리한다.

- `Metadata changes`
- `Markdown changes`

새 version에 대해 표시하는 상태 기반 액션:

- `기준 버전으로 지정`
- `extraction 요청`
- `폐기`

Diff 확인 전에는 extraction CTA를 비활성화할 수 있다.

### 10.1.2 Job action matrix

문서 상세는 상태별 허용 액션을 명확히 보여줘야 한다.

| 상태 | 허용 액션 | 비고 |
| --- | --- | --- |
| `queued` | 상태 보기 | 읽기 전용 |
| `leased` | 상태 보기 | 읽기 전용 |
| `processing` | 상태 보기 | 읽기 전용 |
| `failed` | `새 job으로 재시도` | 원 job 재활성화 금지 |
| `succeeded` | 결과 보기 | 다음 단계 판단 가능 |
| `superseded` | 대체 job으로 이동 | 링크만 제공 |

stale lease는 UI가 직접 회수하지 않고 backend reclaim 결과를 기다리거나 재시도 요청만 허용한다.

### 10.1.3 목록 URL 계약

문서 목록은 최소 아래 query를 지원한다.

```text
/admin/knowledge/documents?project=reactor&kind=spec&docStatus=active&jobStatus=failed&q=auth
```

상세 진입 시에는 `returnTo`를 유지해 목록의 필터 문맥을 복원한다.

### 10.1.4 화면 상태 매트릭스

Phase 2A에서 최소한 아래 상태를 정의한다.

| 화면 | 상태 | 기본 행동 |
| --- | --- | --- |
| documents list | `empty` | `새 문서 등록` CTA |
| documents list | `loading` | skeleton rows |
| documents list | `error` | 재시도 CTA |
| document new | `frontmatter conflict` | canonical preview 표시 |
| document new | `uploading` | 중복 제출 방지 |
| document detail | `no versions` | `새 version 업로드` CTA |
| document detail | `no jobs` | `추출 요청` CTA |
| document detail | `job failed` | 오류 상세 + `새 job으로 재시도` CTA |
| any | `no access` | 권한 없음 메시지 + admin 홈 이동 |

### 10.1.5 Phase 2A 대시보드 카드

`/admin/knowledge`는 최소 아래 4개 카드를 가진다.

- `새 문서 등록`
- `최근 업로드`
- `실패한 추출`
- `추출 대기 중 버전`

`Reviews`, `Graph`, `Publish`는 Phase 2A에서 비활성 카드 또는 숨김 처리 가능하다.

### 10.2 이번 단계에서 확정하지 않을 라우트

- 공개 `/knowledge/*`
- 공개 `domain/capability/element` 상세 URL

즉, knowledge 엔티티의 public permalink는 나중 단계로 미룬다.

### 10.3 기존 라우트 정리 원칙

온톨로지 공개 연동 전에 아래를 먼저 정리해야 한다.

- `/?p=slug`
- `/project/view/?slug=...`
- `/project/[slug]`

새 knowledge route를 얹기 전에 기존 URL 계약이 더 꼬이지 않게 유지한다.

---

## 11. 이번 단계의 개발 가능 판정

이번 v2는 아래 조건에서만 개발 착수가 가능하다.

1. `docs/DATA-MODEL.md`에 knowledge 컬렉션과 trusted backend 경계가 반영될 것
2. `firestore.rules`, `storage.rules`, `firestore.indexes.json`이 public/private 모델에 맞게 갱신될 것
3. `AGENTS.md`, `CLAUDE.md`, `ADMIN-GUIDE.md`가 같은 운영 기준을 말할 것
4. Phase 2A 범위가 foundation-only로 축소될 것

이 조건이 안 닫히면 knowledge는 구현이 아니라 탐색 상태로 본다.

---

## 12. 요약

이번 단계의 knowledge subsystem은 공개 제품 교체가 아니라, 다음을 위한 운영 기반이다.

- 문서를 관리하고
- 후보를 검수하고
- 승인된 지식 그래프를 canonical하게 저장하고
- 필요한 부분만 공개 projection으로 publish하는 것

핵심은 `public product`, `private canonical graph`, `public projection`, `trusted backend`, `Storage-based raw markdown`를 분리해서 설계하는 것이다.
