# Aslan Project Map — Knowledge Backend Contract v1

**작성일**: 2026-04-17
**상태**: 제안
**목적**: knowledge subsystem v2에서 Next.js 앱과 trusted backend 사이의 실행 계약을 고정한다.

---

## 1. 범위

이 문서는 아래만 다룬다.

- extraction input/output 계약
- job 상태 머신
- idempotency / lease reclaim 규칙
- evidence contract
- publish/audit contract
- approved graph / public projection write ownership

이 문서는 UI 설계나 Firestore 전체 스키마를 다시 설명하지 않는다.

관련 문서:

- [`2026-04-17-document-knowledge-subsystem-v2.md`](./2026-04-17-document-knowledge-subsystem-v2.md)
- [`../plans/2026-04-17-phase-2a-knowledge-subsystem-foundation-v2.md`](../plans/2026-04-17-phase-2a-knowledge-subsystem-foundation-v2.md)
- [`../../DATA-MODEL.md`](../../DATA-MODEL.md)
- [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)

---

## 2. 실행 경계

trusted backend는 다음으로 고정한다.

- **Cloud Functions for Firebase (2nd gen)**

브라우저 클라이언트는 다음만 수행한다.

- 문서 등록
- version 메타 생성
- raw markdown 업로드
- extraction job enqueue 요청
- review action 요청
- publish 요청

trusted backend만 수행하는 작업:

- raw markdown 로드
- chunk 생성
- extraction provider 호출
- extraction output 저장
- review seed 생성
- approved graph write
- evidence write
- publish log write
- public projection write
- stale lease reclaim

## 2.1 함수 경계

최소 함수 집합은 아래로 고정한다.

| 함수 | Trigger | Caller | 주요 책임 |
| --- | --- | --- | --- |
| `enqueueExtractionJob` | callable | admin UI | version 확인, 중복 검사, job 생성 |
| `processExtractionJob` | async/task worker | backend only | lease 획득, chunking, extraction, output/evidence/review seed 저장 |
| `reclaimStaleExtractionJobs` | scheduler | backend only | stale lease 판정, reclaim 또는 fail 처리 |
| `applyReviewAction` | callable | admin UI | review 결정 반영, approval/audit 이벤트 저장 |
| `publishKnowledgeProjection` | callable 또는 protected HTTP | admin UI | approved graph snapshot을 public projection으로 게시 |

함수별로 region, service account, timeout, memory, secrets는 인프라 설정에 고정해야 한다.

---

## 3. Job lifecycle

## 3.1 상태 머신

허용 상태는 아래로 고정한다.

```text
queued
  -> leased
  -> processing
  -> succeeded
  -> failed
  -> superseded
```

### 상태 의미

- `queued`: enqueue 완료, 아직 worker가 가져가지 않음
- `leased`: worker가 가져갔고 lease를 점유함
- `processing`: chunking 또는 extraction 실행 중
- `succeeded`: output 저장 완료
- `failed`: 재시도 가능 또는 수동 확인 필요
- `superseded`: 더 최신 job이 이 job을 대체함

### 금지

- `succeeded -> processing`
- `failed -> queued` 직접 회귀
- `superseded -> *` 재활성화

재시도는 새 job 생성 또는 backend reclaim을 통해서만 한다.

## 3.2 Job key

논리적 동일 job은 아래 조합으로 식별한다.

- `documentVersionId`
- `extractorVersion`

`idempotencyKey = ${documentVersionId}:${extractorVersion}`

같은 key의 활성 job이 있으면 새 job을 중복 생성하지 않는다.

권장 구현:

- 브라우저가 Firestore에 직접 `knowledgeExtractionJobs` 문서를 만들지 않는다.
- callable/function 경계에서 transaction으로 생성하거나 deterministic job ID로 `create` 충돌을 이용해 중복을 막는다.

## 3.3 Lease 규칙

job 문서는 아래 필드를 가진다.

- `leaseOwner`
- `leaseExpiresAt`
- `attemptCount`
- `maxAttempts`
- `retryable`
- `nextAttemptAt`
- `generation`

규칙:

1. worker는 `queued` job을 lease하여 `leased`로 바꾼다.
2. 처리 시작 시 `processing`으로 바꾸고 lease를 연장한다.
3. `leaseExpiresAt`이 지났으면 stale lease로 본다.
4. stale lease는 backend가 reclaim해 새 job으로 대체하거나 원 job을 `failed`로 종료한다.
5. 클라이언트는 lease를 수정하지 않는다.

worker 완료 반영은 `leaseOwner + generation`이 현재 문서와 일치할 때만 허용한다.

---

## 4. Extraction input contract

```ts
type ExtractionInput = {
  documentId: string;
  documentVersionId: string;
  extractorVersion: string;
  title: string;
  kind: string;
  projectIds: string[];
  frontmatter?: Record<string, unknown>;
  source: {
    storagePath: string;
    mimeType: string;
    sizeBytes: number;
    versionHash: string;
  };
  chunks: Array<{
    chunkId: string;
    headingPath: string[];
    markdown: string;
    charStart: number;
    charEnd: number;
    chunkHash: string;
  }>;
};
```

원칙:

- provider는 Storage 경로와 chunk 메타만 본다.
- provider는 Firestore 전체 상태를 직접 알지 않는다.
- extractorVersion이 바뀌면 새 논리 job으로 취급한다.

---

## 5. Extraction output contract

```ts
type ExtractionOutput = {
  documentSummary?: string;
  nodes: Array<{
    tempId: string;
    title: string;
    kind: "domain" | "capability" | "element" | "document";
    parentTempId?: string;
    projectIds: string[];
    summary?: string;
    evidence: EvidenceRef[];
    confidence: number;
    warnings?: string[];
  }>;
  edges: Array<{
    tempId: string;
    fromTempId: string;
    toTempId: string;
    type: "contains" | "belongs_to" | "depends_on" | "implements" | "uses" | "describes" | "related_to";
    projectIds: string[];
    evidence: EvidenceRef[];
    confidence: number;
    warnings?: string[];
  }>;
  warnings: string[];
};
```

```ts
type EvidenceRef = {
  documentVersionId: string;
  versionHash: string;
  chunkId: string;
  chunkHash: string;
  charStart: number;
  charEnd: number;
  excerpt: string;
  locatorVersion: "v1";
  extractorVersion: string;
};
```

원칙:

- provider는 canonical node ID를 직접 만들지 않는다.
- provider는 후보와 evidence만 반환한다.
- merge와 canonical ID 부여는 review/approved graph 단계에서 처리한다.

---

## 6. Evidence contract

evidence는 immutable reference다.

필수 보장:

1. `knowledgeDocumentVersions`는 append-only
2. `versionHash`는 version 원문 해시
3. `chunkHash`는 chunk 내용 해시
4. `charStart`, `charEnd`는 version 원문 기준 위치
5. `locatorVersion`은 locator 계산 방식 버전

approved node/edge는 excerpt를 source of truth로 들고 있지 않고, evidence reference를 참조한다.

persisted storage는 `knowledgeEvidence/{evidenceId}`로 분리한다.

---

## 7. Review seed contract

backend는 extraction output을 바탕으로 review seed를 만든다.

최소 타입:

- `document-batch`
- `merge`
- `low-confidence`

생성 규칙:

- 고신뢰 + 충돌 없음 = `document-batch`
- 기존 canonical 후보와 충돌 = `merge`
- 낮은 confidence 또는 hierarchy/type ambiguity = `low-confidence`

Phase 2A에서는 review seed 생성 계약까지만 닫고, 완성형 review UI 실행은 다음 단계로 넘긴다.

---

## 8. Approved graph write ownership

### 클라이언트가 하지 않는 것

- `knowledgeApprovedNodes`
- `knowledgeApprovedEdges`
- `knowledgePublicNodes`
- `knowledgePublicEdges`

위 4개 컬렉션에 브라우저는 직접 쓰지 않는다.

### backend가 하는 것

1. review 승인 결과를 canonical approved graph에 반영
2. publish 시 approved graph를 읽어 public projection 생성
3. publish 단위의 시간과 실행 주체 기록

즉:

- canonical truth = `knowledgeApproved*`
- public read model = `knowledgePublic*`

approval 감사 추적은 `knowledgeApprovalEvents/*`에 append-only로 남긴다.

---

## 9. Publish / Audit contract

publish는 실행 단위 엔티티를 가진다.

권장 persisted entity:

- `knowledgePublishes/{publishId}`

최소 필드:

- `status`
- `initiatedBy`
- `startedAt`
- `completedAt`
- `sourceApprovedRevision`
- `nodeCount`
- `edgeCount`
- `projectionVersion`
- `errorCode`
- `errorMessage`
- `rollbackOfPublishId`

public projection 문서는 아래 lineage를 가진다.

- `publishId`
- `projectionVersion`
- `publishedAt`

현재 공개 snapshot은 `knowledgePublicMeta/current.currentPublishId` 포인터로 고정한다.

원칙:

- publish 실패는 approved graph를 롤백하지 않는다.
- rollback은 새 publish 실행으로 처리한다.
- projection 문서는 어느 publish 결과물인지 역추적 가능해야 한다.
- publish는 새 snapshot을 전량 작성한 뒤 `currentPublishId`를 원자적으로 전환한다.

---

## 10. 실패 처리

### 실패 종류

- provider 호출 실패
- chunk 생성 실패
- schema validation 실패
- lease timeout
- publish 실패

### 기록 필드

- `errorCode`
- `errorMessage`
- `attemptCount`
- `leaseOwner`
- `leaseExpiresAt`
- `updatedAt`

### 운영 규칙

- `failed`는 재시도 가능 여부를 별도 판단한다.
- 반복 실패 시 새 job으로 `superseded` 처리할 수 있다.
- publish 실패는 approved graph를 롤백하지 않는다. projection만 재생성한다.

## 10.1 Observability

구조화 로그 필드는 최소 아래를 포함한다.

- `functionName`
- `documentId`
- `documentVersionId`
- `jobId`
- `idempotencyKey`
- `publishId`
- `attempt`
- `durationMs`
- `providerStatus`

운영 지표 최소값:

- `stuck_jobs`
- `retrying_jobs`
- `last_successful_publish_at`
- `publish_lag_seconds`

## 10.2 로컬/스테이징 검증 계약

기본 로컬 셋업은 아래 emulator 조합을 기준으로 한다.

- Auth
- Firestore
- Storage
- Functions

기본 provider는 외부 LLM 대신 stub adapter를 사용할 수 있어야 한다.

최소 검증 시나리오:

1. `enqueue -> success`
2. `enqueue -> provider fail -> retry`
3. `lease expiry -> reclaim`
4. `approved graph -> publish snapshot swap`

---

## 11. Operator action contract

문서 상세 UI는 최소한 아래 액션 규칙을 따른다.

| Job 상태 | 허용 액션 | 금지 액션 |
| --- | --- | --- |
| `queued` | 상태 보기 | 재시도, 새 enqueue |
| `leased` | 상태 보기 | 재시도, 수동 종료 |
| `processing` | 상태 보기 | 재시도, 새 enqueue |
| `failed` | 새 job으로 재시도 | 원 job 재활성화 |
| `succeeded` | 결과 보기, 다음 단계 진행 | 동일 key 중복 enqueue |
| `superseded` | 대체 job으로 이동 | 재시도 |

stale lease는 UI가 직접 회수하지 않고 backend reclaim 결과를 기다리거나 새 job 재요청만 허용한다.

---

## 12. 구현 체크포인트

Phase 2A에서 이 문서를 근거로 최소한 아래를 만든다.

1. extraction input/output 타입
2. job 상태 enum과 상태 전이 규칙
3. idempotency key helper
4. stale lease 판정 helper
5. evidence 타입
6. publish log 타입
7. public pointer 타입
8. emulator smoke test 시나리오

worker 구현, Gemini adapter, publish executor는 다음 단계에서 이 계약을 사용해 붙인다.

---

## 13. 변경 이력

- 2026-04-17: 초기 작성
- 2026-04-17: evidence persistence, publish lineage, operator action contract 추가
