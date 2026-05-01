---
title: Data Model
tags: [data-model, firestore, schema]
---

# Data Model

> 이 문서는 현재 공개 제품과 설계 승인된 `knowledge subsystem v2`의 저장 계약을 함께 다룬다. 컬렉션 스키마 변경 시 반드시 이 문서를 먼저 갱신한다. 변경 프로세스는 [`rules/firestore-schema.md`](rules/firestore-schema.md)를 따른다.
>
> **single-user 모드 (현재):** 1 명의 로그인 사용자가 자기 워크스페이스의 owner. account / membership 개념 없음. 모든 컬렉션은 root path. v2 협업 단계에서 multi-account 가 필요해지면 별도 ADR 로 도입.

## 1. 원칙

1. 현재 공개 제품의 canonical 데이터는 여전히 `projects`다.
2. knowledge subsystem은 공개 제품과 분리된 인증-필수 subsystem으로 도입한다.
3. knowledge의 canonical graph는 private store에 저장하고, 공개 화면은 projection만 읽는다.
4. raw markdown는 Firestore가 아니라 Firebase Storage에 저장한다.
5. backend-owned 컬렉션은 브라우저 클라이언트가 직접 쓰지 않는다.
6. PostgreSQL/Prisma 전환 대비용 관계형 계약은 `database/ddl/postgres/`에 함께 유지한다.

## 2. Firestore 컬렉션

```text
firestore/
├── projects/                        public canonical
│   └── {slug}/
├── categories/                      public config
│   └── {id}/
├── statuses/                        public config
│   └── {id}/
├── meta/
│   └── site/
├── apiKeys/                         외부 HTTP API 인증 토큰
│   └── {keyId}/
├── workspaceProjects/               워크스페이스 컨테이너
│   └── {projectId}/
│       ├── hubs/                    허브 노드 (sub-collection)
│       │   └── {hubId}/
│       └── nodes/                   비-허브 노드 (sub-collection)
│           └── {nodeId}/
├── projectActivity/                 프로젝트 활동 로그 (append-only)
│   └── {eventId}/
├── clientErrors/                    클라이언트 런타임 에러 (append-only)
│   └── {errorId}/
├── knowledgeDocuments/              private 문서 헤더
│   └── {documentId}/
├── knowledgeDocumentVersions/       private 원문 버전
│   └── {versionId}/
├── knowledgeDocumentChunks/         backend-owned, authed readable
│   └── {chunkId}/
├── knowledgeEvidence/               backend-owned, authed readable
│   └── {evidenceId}/
├── knowledgeExtractionJobs/         enqueue via backend, execute by backend
│   └── {jobId}/
├── knowledgeExtractionOutputs/      backend-owned, authed readable
│   └── {outputId}/
├── knowledgeReviews/                authed read/write
│   └── {reviewId}/
├── knowledgeReviewEvents/           backend-owned, authed readable
│   └── {eventId}/
├── knowledgeApprovalEvents/         backend-owned, authed readable
│   └── {eventId}/
├── knowledgeApprovedNodes/          private canonical graph
│   └── {nodeId}/
├── knowledgeApprovedEdges/          private canonical graph
│   └── {edgeId}/
├── knowledgePublishes/              backend-owned, authed readable
│   └── {publishId}/
├── knowledgePublicMeta/             public projection pointer
│   └── current/
├── knowledgePublicNodes/            public projection
│   └── {nodeId}/
├── knowledgePublicEdges/            public projection
│   └── {edgeId}/
├── ontologyClasses/                 ontology TBox — 노드 클래스 정의 (authed write, public read)
│   └── {classId}/
├── ontologyRelations/               ontology TBox — 관계 타입 정의 (authed write, public read)
│   └── {relationId}/
├── ontologyTBoxVersions/            ontology TBox snapshot (immutable, append-only)
│   └── {versionId}/
└── ontologyTBoxState/               활성 TBox version 포인터
    └── current/                     versionId + activatedAt + activatedBy
```

## 3. 공개 제품 컬렉션

### `projects/{slug}`

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `slug` | string | ✅ | URL용 kebab-case, 문서 ID와 동일 |
| `name` | string | ✅ | 한글 이름 |
| `nameEn` | string |  | 영문 이름 |
| `category` | string | ✅ | `categories/{id}` 참조 |
| `status` | string | ✅ | `statuses/{id}` 참조 |
| `description` | string | ✅ | 1~2줄 요약 |
| `detail` | string (markdown) |  | 상세 본문 |
| `tags` | string[] |  | 태그 배열 |
| `stack` | string[] |  | 기술 스택 |
| `links` | `Array<{ label: string; url: string }>` |  | 외부 링크 |
| `dependencies` | string[] |  | 의존 프로젝트 slug 배열 |
| `owner` | string |  | 담당자 |
| `icon` | string |  | 이모지 또는 URL |
| `screenshots` | string[] |  | Storage URL 배열 |
| `timeline.startedAt` | Timestamp |  | 시작일 |
| `timeline.launchedAt` | Timestamp |  | 출시일 |
| `progress` | number (0-100) |  | 진행도 |
| `isHub` | boolean | ✅ | 허브 노드 여부 |
| `position.x` | number | ✅ | 토폴로지 레이아웃 좌표 X |
| `position.y` | number | ✅ | 토폴로지 레이아웃 좌표 Y |
| `createdAt` | Timestamp | ✅ | 생성일 |
| `updatedAt` | Timestamp | ✅ | 수정일 |

### `workspaceProjects/{projectId}`

> 한 워크스페이스 안의 **컨테이너 프로젝트** — 그 아래에 허브/노드가 4-layer 로 쌓인다. 기존 flat `projects` 와 병존하다가 마이그레이션 완료 후 flat 은 제거 예정.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `accountId` | string |  | (legacy) 발급 시점 사용자 uid — 새 데이터에는 선택 |
| `name` | string | ✅ | 컨테이너 이름 (예: "General") |
| `description` | string |  | 짧은 설명 |
| `isPublic` | boolean |  | 공개 여부 (추후 공개 화면 라우팅용) |
| `order` | number |  | 셀렉터 정렬 순서 |
| `metadata` | object |  | 확장용 키-값 (`icon`, `color` 등) |
| `createdAt` | Timestamp | ✅ | 생성일 |
| `updatedAt` | Timestamp | ✅ | 수정일 |

### `workspaceProjects/{projectId}/hubs/{hubId}`

> 컨테이너 안 허브 노드 sub-collection. 기존 `projects` 의 `isHub=true` row 가 이관될 자리. 필드는 `projects/{slug}` 와 호환 유지 (slug→hubId 동일).

### `workspaceProjects/{projectId}/nodes/{nodeId}`

> 컨테이너 안 비-허브 노드 sub-collection — **hubs 와 sibling** (parent-child 중첩 아님). 한 node 가 여러 hub 에 속할 수 있게 하기 위한 배열 참조 모델.
>
> 이관 규칙: 기존 `projects` 의 `isHub=false` row 가 복사되고, 해당 row 의 `dependencies[]` 중 isHub=true 인 slug 만 추려서 `hubIds[]` 로 설정. 아무 hub 도 참조 없으면 `hubIds: []` (orphan 허용 — 허브에 붙지 않은 독립 서비스도 자연).

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `hubIds` | string[] | ✅ | 속한 hub slug 배열. 0~N 개. `array-contains` 쿼리로 허브별 필터. |

> 그 외 필드는 `projects/{slug}` 와 호환 유지 (`name`, `description`, `tags`, `stack`, `links`, `status`, `category`, `position`, `screenshots`, `owner`, `progress`, `timeline`, `createdAt`, `updatedAt`).

### `apiKeys/{keyId}`

> 외부 클라이언트 (CLI · CI · MCP server) 가 `POST /api/v1/docs` 같은 HTTP 엔드포인트로 워크스페이스에 push 할 때 사용하는 인증 토큰. 평문 키는 발급 직후 한 번만 UI 노출, hash 만 저장.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `name` | string | ✅ | 사용자 식별용 라벨 (예: "CI bot") |
| `keyHash` | string | ✅ | SHA-256(plaintext) 16진수 |
| `keyPrefix` | string | ✅ | 평문 키 처음 8자 — UI 표시용 |
| `scope` | `"account-rw"` | ✅ | v1 단일 scope. 미래 per-container/action 분리 예약 |
| `createdAt` | Timestamp | ✅ | 생성 시각 |
| `createdBy` | string | ✅ | 발급한 사용자 이메일 |
| `lastUsedAt` | Timestamp |  | 마지막 호출 시각 (Cloud Function 이 갱신) |
| `usageCount` | number |  | 누적 호출 수 |
| `revokedAt` | Timestamp |  | revoke 됐으면 set, soft-delete 용 |

### `categories/{id}`

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | ✅ | 문서 ID와 동일 |
| `label` | string | ✅ | 한글 라벨 |
| `labelEn` | string |  | 영문 라벨 |
| `order` | number | ✅ | 정렬 순서 |
| `position.x` | number | ✅ | 클러스터 중심 X |
| `position.y` | number | ✅ | 클러스터 중심 Y |
| `size.width` | number | ✅ | 클러스터 폭 |
| `size.height` | number | ✅ | 클러스터 높이 |
| `radius` | number | ✅ | 네비게이션 zoom 계산용 반경 |
| `borderStyle` | `"underline" \| "dashed" \| "sideLabel" \| "solid"` | ✅ | 카테고리 보더 표현 |
| `sideLabelText` | string |  | `sideLabel`일 때 좌측 라벨 |
| `createdAt` | Timestamp | ✅ | 생성일 |
| `updatedAt` | Timestamp | ✅ | 수정일 |

### `statuses/{id}`

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | ✅ | 문서 ID와 동일 |
| `label` | string | ✅ | 한글 라벨 |
| `labelEn` | string |  | 영문 라벨 |
| `order` | number | ✅ | 정렬 순서 |
| `dotColor` | `"success" \| "warning" \| "paused" \| "neutral"` | ✅ | 상태 점 색상 preset |
| `createdAt` | Timestamp | ✅ | 생성일 |
| `updatedAt` | Timestamp | ✅ | 수정일 |

### `meta/site`

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `title` | string | 사이트 타이틀 |
| `description` | string | 사이트 설명 |
| `lastUpdated` | Timestamp | 마지막 변경 시점 |
| `viewCount` | number | 방문 카운트 (선택) |

### `projectActivity/{eventId}`

프로젝트 단위 활동 로그 — append-only.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `action` | string | ✅ | `project.created` · `project.updated` · `project.deleted` 등 |
| `projectSlug` | string | ✅ | 대상 프로젝트 slug |
| `projectName` | string | ✅ | 표시용 이름 |
| `actorEmail` | string |  | 실행자 이메일 |
| `actorName` | string |  | 실행자 이름 |
| `summary` | string |  | 변경 요약 |
| `createdAt` | Timestamp | ✅ | 발생 시각 |

### `clientErrors/{errorId}`

클라이언트 런타임 에러 — global-error / error.tsx 가 hydration·render 실패 시 append. append-only.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `message` | string | ✅ | 에러 메시지 (≤ 500 chars) |
| `stack` | string |  | 스택 트레이스 (≤ 2000 chars) |
| `url` | string | ✅ | 발생 URL |
| `userAgent` | string | ✅ | UA 문자열 |
| `uid` | string |  | 로그인 사용자 uid |
| `kind` | string | ✅ | 분류 (e.g. `render`, `hydration`) |
| `createdAt` | Timestamp | ✅ | 발생 시각 |

## 4. Knowledge subsystem 컬렉션

### `knowledgeDocuments/{documentId}`

문서 헤더와 현재 상태를 담는 admin private 엔트리.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | ✅ | 문서 ID |
| `title` | string | ✅ | 현재 canonical 제목 |
| `kind` | string | ✅ | 현재 canonical 문서 kind |
| `projectIds` | string[] | ✅ | 연결된 프로젝트 slug 목록 |
| `sourceType` | `"upload" \| "manual" \| "import"` | ✅ | 생성 경로 |
| `currentVersionId` | string | ✅ | 현재 기준 version ID |
| `formatScore` | number |  | 규격 적합도 |
| `status` | `"draft" \| "ready" \| "processing" \| "reviewing" \| "published" \| "error"` | ✅ | 문서 운영 상태 |
| `latestJobStatus` | string |  | 최근 추출 job 상태 요약 |
| `createdAt` | Timestamp | ✅ | 생성일 |
| `updatedAt` | Timestamp | ✅ | 수정일 |
| `createdBy` | string | ✅ | 생성 admin 이메일 |

`knowledgeDocuments`는 `currentVersionId`의 파생 헤더를 담는다. `title`, `kind`, `projectIds`는 version canonical metadata를 반영한다.

### `knowledgeDocumentVersions/{versionId}`

원문 버전 메타. append-only로 취급한다.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | ✅ | version ID |
| `documentId` | string | ✅ | 상위 문서 ID |
| `title` | string | ✅ | version metadata 제목 |
| `kind` | string | ✅ | version metadata kind |
| `projectIds` | string[] | ✅ | version metadata project 연결 |
| `frontmatter` | map |  | 파싱된 frontmatter |
| `storagePath` | string | ✅ | Storage 원문 경로 |
| `mimeType` | string | ✅ | `text/markdown` 또는 허용 MIME |
| `sizeBytes` | number | ✅ | 원문 크기 |
| `hash` | string | ✅ | version 해시 |
| `createdAt` | Timestamp | ✅ | 생성일 |
| `createdBy` | string | ✅ | 생성 admin 이메일 |

### `knowledgeDocumentChunks/{chunkId}`

trusted backend가 생성하는 chunk 인덱스.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | ✅ | chunk ID |
| `documentId` | string | ✅ | 문서 ID |
| `documentVersionId` | string | ✅ | 기준 version ID |
| `headingPath` | string[] |  | heading 경로 |
| `markdown` | string | ✅ | chunk markdown |
| `charStart` | number | ✅ | 원문 시작 오프셋 |
| `charEnd` | number | ✅ | 원문 끝 오프셋 |
| `chunkHash` | string | ✅ | chunk 내용 해시 |
| `createdAt` | Timestamp | ✅ | 생성일 |

### `knowledgeExtractionJobs/{jobId}`

job queue 엔트리. admin UI는 enqueue를 요청하고, 실제 job 문서는 trusted backend가 생성/처리한다.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | ✅ | job ID |
| `documentId` | string | ✅ | 대상 문서 ID |
| `documentVersionId` | string | ✅ | 대상 version ID |
| `extractorVersion` | string | ✅ | 추출기 버전 |
| `idempotencyKey` | string | ✅ | 멱등 키. `(documentVersionId, extractorVersion)` 기반 |
| `status` | `"queued" \| "leased" \| "processing" \| "succeeded" \| "failed" \| "superseded"` | ✅ | 상태 |
| `attemptCount` | number | ✅ | 시도 횟수 |
| `maxAttempts` | number | ✅ | 허용 최대 시도 횟수 |
| `retryable` | boolean | ✅ | 재시도 가능 여부 |
| `nextAttemptAt` | Timestamp |  | 다음 재시도 가능 시각 |
| `leaseOwner` | string |  | 처리중인 worker 식별자 |
| `leaseExpiresAt` | Timestamp |  | lease 만료 시점 |
| `generation` | number | ✅ | lease 세대. stale 완료 방지용 |
| `errorCode` | string |  | 마지막 에러 코드 |
| `errorMessage` | string |  | 마지막 에러 메시지 |
| `supersededByJobId` | string |  | 대체 job ID |
| `createdAt` | Timestamp | ✅ | 생성일 |
| `updatedAt` | Timestamp | ✅ | 수정일 |
| `requestedBy` | string | ✅ | enqueue한 admin 이메일 |

`jobId`는 가능하면 `idempotencyKey` 기반 deterministic ID를 사용한다. 브라우저는 중복 job을 직접 생성하지 않고 backend enqueue 경계로 요청한다.

### `knowledgeExtractionOutputs/{outputId}`

trusted backend가 저장하는 raw extraction 결과.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | ✅ | output ID |
| `jobId` | string | ✅ | 생성한 job ID |
| `documentId` | string | ✅ | 문서 ID |
| `documentVersionId` | string | ✅ | 문서 version ID |
| `extractorVersion` | string | ✅ | 추출기 버전 |
| `provider` | string | ✅ | 예: `gemini` |
| `summary` | string |  | 문서 요약 |
| `nodes` | `OutputNode[]` | ✅ | node 후보 목록 (아래 sub-schema) |
| `edges` | `OutputEdge[]` | ✅ | edge 후보 목록 (아래 sub-schema) |
| `warnings` | string[] |  | 경고 목록 |
| `createdAt` | Timestamp | ✅ | 생성일 |

`OutputNode` sub-schema:

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `tempId` | string | ✅ | output 내부 임시 ID. approval 시 canonical node ID 로 매핑됨 |
| `title` | string | ✅ | 노드 제목 |
| `kind` | string | ✅ | `ontologyClasses` 의 합법 값 (project / domain / capability / element / document) |
| `projectIds` | string[] | ✅ | 연결 프로젝트 |
| `summary` | string |  | 내부 요약 |
| `confidence` | number | ✅ | LLM 신뢰도 0~1. 보류 스펙 §6.3 정책: `≥ 0.85` 자동 승인 후보 / `0.60~0.84` 검수 / `< 0.60` 자동 반영 금지 |
| `warnings` | string[] |  | 후보별 경고 |

`OutputEdge` sub-schema:

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `tempId` | string | ✅ | output 내부 임시 ID |
| `fromTempId` | string | ✅ | source 노드의 tempId |
| `toTempId` | string | ✅ | target 노드의 tempId |
| `type` | `KnowledgeEdgeType` | ✅ | 7 종 enum (T-2). `ontologyRelations` 컬렉션과 정합 |
| `label` | string |  | UI 표시용 라벨 |
| `confidence` | number | ✅ | LLM 신뢰도 0~1. node 와 동일 정책 |

> **신뢰도 정책 (보류 스펙 §6.3 채택)**:
> - `≥ 0.85` — high. 규격 문서 + 명시적 관계. 자동 승인 후보.
> - `0.60 ~ 0.84` — medium. 문맥상 유력. 검수 큐로.
> - `< 0.60` — low. 자동 반영 금지. 사용자 명시 승인 필요.

### `knowledgeEvidence/{evidenceId}`

immutable evidence reference store.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | ✅ | evidence ID |
| `documentId` | string | ✅ | 문서 ID |
| `documentVersionId` | string | ✅ | version ID |
| `versionHash` | string | ✅ | version 해시 |
| `chunkId` | string | ✅ | chunk ID |
| `chunkHash` | string | ✅ | chunk 해시 |
| `charStart` | number | ✅ | 원문 시작 위치 |
| `charEnd` | number | ✅ | 원문 끝 위치 |
| `excerpt` | string | ✅ | 표시용 인용 텍스트 |
| `locatorVersion` | string | ✅ | locator 계산 버전 |
| `extractorVersion` | string | ✅ | 추출기 버전 |
| `sourceOutputId` | string | ✅ | 생성한 extraction output ID |
| `createdAt` | Timestamp | ✅ | 생성일 |

### `knowledgeReviews/{reviewId}`

운영자가 검수하는 리뷰 엔트리.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | ✅ | review ID |
| `documentId` | string | ✅ | 관련 문서 ID |
| `documentVersionId` | string | ✅ | 관련 version ID |
| `jobId` | string |  | 관련 job ID |
| `type` | `"document-batch" \| "merge" \| "low-confidence"` | ✅ | 리뷰 버킷 |
| `status` | `"open" \| "approved" \| "rejected" \| "snoozed" \| "superseded"` | ✅ | 상태 |
| `payload` | map | ✅ | 리뷰 대상 데이터 |
| `assignedTo` | string |  | 담당 admin 이메일 |
| `createdAt` | Timestamp | ✅ | 생성일 |
| `updatedAt` | Timestamp | ✅ | 수정일 |

### `knowledgeReviewEvents/{eventId}`

review 감사 추적용 append-only 이벤트.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | ✅ | event ID |
| `reviewId` | string | ✅ | 대상 review ID |
| `documentId` | string | ✅ | 관련 문서 ID |
| `action` | string | ✅ | 예: `approve`, `reject`, `snooze`, `comment` |
| `actor` | string | ✅ | 수행자 이메일 |
| `fromStatus` | string |  | 이전 상태 |
| `toStatus` | string | ✅ | 변경 후 상태 |
| `decisionPayload` | map |  | 결정 세부 내용 |
| `comment` | string |  | 운영 메모 |
| `createdAt` | Timestamp | ✅ | 생성일 |

### `knowledgeApprovalEvents/{eventId}`

approved graph 변경 이력.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | ✅ | event ID |
| `entityType` | `"node" \| "edge"` | ✅ | 대상 유형 |
| `entityId` | string | ✅ | 대상 canonical ID |
| `reviewId` | string |  | 근거 review ID |
| `before` | map |  | 변경 전 스냅샷 |
| `after` | map | ✅ | 변경 후 스냅샷 |
| `approvedBy` | string | ✅ | 승인자 이메일 |
| `approvedAt` | Timestamp | ✅ | 승인 시각 |
| `revertsEventId` | string |  | 롤백 대상 event ID |

### `knowledgeApprovedNodes/{nodeId}`

knowledge canonical node store. admin-private이며 publish의 입력이다.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | ✅ | node ID. ontology 추출의 경우 `<kind>:<frontmatterId>` 형식 (id-resolution.md §1) |
| `title` | string | ✅ | canonical 제목 |
| `kind` | string | ✅ | node kind. `ontologyClasses` 의 합법 값. `unknown` = stub placeholder |
| `projectIds` | string[] | ✅ | 연결 프로젝트. stub 은 빈 배열 |
| `parentId` | string |  | canonical hierarchy parent |
| `summary` | string |  | 내부 요약 |
| `evidenceIds` | string[] | ✅ | 승인 근거 식별자 목록 |
| `currentRevisionId` | string |  | 최근 approval event ID |
| `lastApprovedAt` | Timestamp | ✅ | 최근 승인 시점 |
| `lastApprovedBy` | string | ✅ | 최근 승인 admin 이메일 |
| `isStub` | boolean |  | true 면 placeholder. 검수 큐가 별도 섹션에 노출 (id-resolution.md §2) |
| `pendingType` | string |  | stub 일 때 frontmatter 가 명시한 edge type. promote 시 edge 복원에 사용 |
| `pendingFromId` | string |  | stub 일 때 promote 시 복원할 source canonical ID |
| `source` | `"manual" \| "extraction"` |  | 출처. legacy 데이터는 `undefined` (UI 가 `extraction` 으로 처리). manual editor v0 (B 라인) 부터 사용자 직접 작성 = `"manual"` |
| `manualAuthor` | string |  | `source === "manual"` 시 작성자 uid. Firestore rules 가 author 본인만 update/delete 허용 |
| `manualNote` | string |  | `source === "manual"` 시 작성자 자유 메모 (옵션) |
| `tboxVersionId` | string |  | (P1 Phase 1) 이 노드 생성·검수 시점의 활성 TBox version ID (`ontologyTBoxVersions/{versionId}`). legacy = undefined → loader 가 `legacy-v0` 으로 처리 |

### `knowledgeApprovedEdges/{edgeId}`

knowledge canonical edge store. admin-private이며 publish의 입력이다.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | ✅ | edge ID |
| `from` | string | ✅ | source node ID |
| `to` | string | ✅ | target node ID |
| `type` | `"contains" \| "belongs_to" \| "depends_on" \| "implements" \| "uses" \| "describes" \| "related_to"` | ✅ | 관계 타입. ontology TBox `ontologyRelations` 7 종과 일치. 카테고리: `contains`/`belongs_to`=structure, `depends_on`/`implements`/`uses`=behavior, `describes`=evidence, `related_to`=weak. 합법 값은 `ontologyRelations` 컬렉션에서 진리값. |
| `projectIds` | string[] | ✅ | 연결 프로젝트 |
| `evidenceIds` | string[] | ✅ | 승인 근거 식별자 목록 |
| `currentRevisionId` | string |  | 최근 approval event ID |
| `lastApprovedAt` | Timestamp | ✅ | 최근 승인 시점 |
| `lastApprovedBy` | string | ✅ | 최근 승인 admin 이메일 |
| `source` | `"manual" \| "extraction"` |  | node 와 동일 의미 (manual editor v0) |
| `manualAuthor` | string |  | `source === "manual"` 시 작성자 uid |
| `manualNote` | string |  | `source === "manual"` 시 작성자 자유 메모 |
| `tboxVersionId` | string |  | (P1 Phase 1) 이 엣지 생성·검수 시점의 활성 TBox version ID. legacy = undefined |

### `knowledgePublishes/{publishId}`

public projection publish 실행 이력.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | ✅ | publish ID |
| `status` | `"running" \| "succeeded" \| "failed" \| "rolled-back"` | ✅ | publish 상태 |
| `initiatedBy` | string | ✅ | 실행 요청자 |
| `startedAt` | Timestamp | ✅ | 시작 시각 |
| `completedAt` | Timestamp |  | 완료 시각 |
| `sourceApprovedRevision` | string | ✅ | 기준 canonical revision 또는 snapshot ID |
| `nodeCount` | number |  | 반영 node 수 |
| `edgeCount` | number |  | 반영 edge 수 |
| `projectionVersion` | string | ✅ | projection schema 버전 |
| `errorCode` | string |  | 실패 코드 |
| `errorMessage` | string |  | 실패 메시지 |
| `rollbackOfPublishId` | string |  | 롤백 대상 publish ID |

### `knowledgePublicNodes/{nodeId}`

공개용 projection node.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | ✅ | node ID |
| `title` | string | ✅ | 공개 제목 |
| `kind` | string | ✅ | 공개 kind |
| `projectIds` | string[] | ✅ | 연결 프로젝트 |
| `parentId` | string |  | 공개용 계층 parent |
| `summary` | string |  | 공개 요약 |
| `evidenceCount` | number | ✅ | 공개 근거 수 |
| `publishId` | string | ✅ | 생성한 publish ID |
| `projectionVersion` | string | ✅ | projection schema 버전 |
| `publishedAt` | Timestamp | ✅ | publish 반영 시각 |
| `lastApprovedAt` | Timestamp | ✅ | 승인 반영 시점 |

### `knowledgePublicEdges/{edgeId}`

공개용 projection edge.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | ✅ | edge ID |
| `from` | string | ✅ | source node ID |
| `to` | string | ✅ | target node ID |
| `type` | string | ✅ | 공개 관계 타입 |
| `projectIds` | string[] | ✅ | 연결 프로젝트 |
| `publishId` | string | ✅ | 생성한 publish ID |
| `projectionVersion` | string | ✅ | projection schema 버전 |
| `publishedAt` | Timestamp | ✅ | publish 반영 시각 |
| `lastApprovedAt` | Timestamp | ✅ | 승인 반영 시점 |

### `knowledgePublicMeta/current`

현재 공개 projection pointer 문서.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `currentPublishId` | string | ✅ | 현재 공개 snapshot publish ID |
| `publishedAt` | Timestamp | ✅ | pointer 전환 시각 |
| `projectionVersion` | string | ✅ | projection schema 버전 |

### `ontologyClasses/{classId}`

ontology TBox — 노드 클래스 정의. `knowledgeApprovedNodes.kind` 의 합법 값 + 의미 메타. admin write, public read (공개 surface 가 클래스 라벨을 표시하기 위함).

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | ✅ | class ID. kebab-case (예: `project`, `domain`, `capability`, `element`, `document`) |
| `name` | string | ✅ | display name (한글 OK) |
| `description` | string |  | 클래스가 무엇을 표현하는지 |
| `parentClassId` | string |  | 상위 클래스 ID. 클래스 계층을 표현 (예: `element` < `capability`). 없으면 root |
| `elementType` | string |  | `id` 가 `element` 인 경우 세부 분류 (`service` / `api` / `agent` / `workflow` / `schema` / `data-store` / `ui` / `prompt` / `integration`). 다른 클래스에는 사용 안 함 |
| `version` | number | ✅ | TBox 버전 — schema 변경 추적용 |
| `createdAt` | Timestamp | ✅ | 생성 시각 |
| `createdBy` | string | ✅ | 생성자 이메일 또는 `system` |
| `updatedAt` | Timestamp |  | 마지막 수정 시각 |

C-1 시드 (T-1):

| `id` | `name` | `parentClassId` | 비고 |
| --- | --- | --- | --- |
| `project` | 프로젝트 | (root) | 외부에 드러나는 제품/시스템/이니셔티브 |
| `domain` | 도메인 | (root) | 프로젝트 안의 큰 문제 영역 |
| `capability` | 역량 | (root) | 도메인이 제공하는 기능적 능력 |
| `element` | 요소 | (root) | 실제 구현체·자산·인터페이스·데이터 구조 (`elementType` 으로 세분화) |
| `document` | 문서 | (root) | 근거 노드. 계층 트리에 매달지 않고 `describes` 관계로 연결 |
| `unknown` | 미지 | (root) | stub placeholder — frontmatter `relates.target` 미존재 시 자동 생성. 검수 큐에서 promote/dismiss (id-resolution.md §2) |

### `ontologyRelations/{relationId}`

ontology TBox — 관계 타입 정의. `knowledgeApprovedEdges.type` 의 합법 값 + 제약. admin write, public read.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | ✅ | relation ID (예: `depends_on`) |
| `name` | string | ✅ | display name (한글 OK) |
| `inverseName` | string |  | 역방향 표시명 (예: `depended-on-by`) |
| `description` | string |  | 관계의 의미 |
| `sourceClassIds` | string[] | ✅ | source 로 허용되는 class ID 목록 (TBox 제약). 빈 배열 = 모든 클래스 허용 |
| `targetClassIds` | string[] | ✅ | target 으로 허용되는 class ID 목록 |
| `category` | `"structure" \| "behavior" \| "evidence" \| "weak"` | ✅ | 관계 카테고리. `structure` = 구조 관계 (`contains`, `belongs_to`), `behavior` = 동작 관계 (`depends_on`, `implements`, `uses`), `evidence` = 근거 관계 (`describes`), `weak` = 약 연관 (`related_to`) |
| `symmetric` | boolean | ✅ | A→B 가 B→A 와 동치인가 (예: `related_to` 는 true, `depends_on` 은 false) |
| `transitive` | boolean | ✅ | A→B + B→C ⇒ A→C 가 성립하는가 (예: `contains` 는 true, `uses` 는 false) |
| `version` | number | ✅ | TBox 버전 |
| `createdAt` | Timestamp | ✅ | 생성 시각 |
| `createdBy` | string | ✅ | 생성자 이메일 또는 `system` |
| `updatedAt` | Timestamp |  | 마지막 수정 시각 |

C-1 시드 (T-1, 7 종):

| `id` | `name` | `category` | `sourceClassIds` | `targetClassIds` | `symmetric` | `transitive` |
| --- | --- | --- | --- | --- | --- | --- |
| `contains` | 포함 | structure | `project`, `domain`, `capability` | `domain`, `capability`, `element` | false | true |
| `belongs_to` | 소속 | structure | `domain`, `capability`, `element` | `project`, `domain`, `capability` | false | true |
| `depends_on` | 의존 | behavior | `project`, `capability`, `element` | `project`, `capability`, `element` | false | false |
| `implements` | 구현 | behavior | `element` | `capability` | false | false |
| `uses` | 사용 | behavior | `element`, `capability` | `element` | false | false |
| `describes` | 설명 | evidence | `document` | `project`, `domain`, `capability`, `element` | false | false |
| `related_to` | 연관 | weak | `[]` (모든 클래스) | `[]` | true | false |

> 주의: `knowledgeApprovedEdges.type` enum 은 T-2 에서 5 → 7 종으로 확장된다. T-1 시드만으로는 데이터 정합성을 강제할 수 없으니 T-2 와 함께 적용해야 의미 있다.

### `ontologyTBoxVersions/{versionId}`

(P1 Phase 1) 한 시점의 TBox snapshot. `ontologyClasses` / `ontologyRelations` (활성, mutable) 가 변경될 때마다 immutable copy 를 박는다. fact node/edge 가 어느 시점 schema 로 만들어졌는지 추적해 audit trail + 추출 결과 재현 보존.

read = 인증 사용자, create = 인증 사용자 (createdBy 가 자기 uid 일치), update/delete 차단.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `versionId` | string | ✅ | doc ID. `v1` / `v2` / ... 또는 ISO timestamp. 형식 자유 — 정렬은 `createdAt` 기준 |
| `classes` | object[] | ✅ | snapshot 시점 클래스 정의 배열. 각 항목은 `ontologyClasses` doc 와 동일 schema |
| `relations` | object[] | ✅ | snapshot 시점 관계 정의 배열. 각 항목은 `ontologyRelations` doc 와 동일 schema |
| `changeNote` | string |  | 사람이 읽는 변경 요약 (예: "concept 클래스 추가") |
| `createdAt` | Timestamp | ✅ | snapshot 시각 |
| `createdBy` | string | ✅ | 생성자 uid |

### `ontologyTBoxState/current`

(P1 Phase 1) 활성 TBox version 포인터. single-user 모드에선 `current` 단일 doc. 새 version 활성화는 `setDoc` 으로 swap — `ontologyTBoxVersions/{versionId}` 가 존재해야 의미 있음.

read = 인증 사용자, create/update = 인증 사용자 (activatedBy 가 자기 uid 일치), delete 차단.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `versionId` | string | ✅ | 현재 활성 version. `ontologyTBoxVersions/{versionId}` 에 존재해야 함 |
| `activatedAt` | Timestamp | ✅ | 활성화 시각 |
| `activatedBy` | string | ✅ | 활성화한 uid |

> Phase 1 = 데이터 모델 + rules 토대만. UI (`/settings/ontology`) 는 Phase 2 에서. fact node 의 `tboxVersionId` writer 도 Phase 2 (UI 가 활성 versionId 구독해서 manual create 시 박는 흐름).

## 5. Storage 구조

```text
storage/
├── screenshots/
│   └── {projectSlug}/
│       ├── cover.webp
│       └── {timestamp}-{safeName}
└── knowledge-documents/
    └── {documentId}/
        └── {versionId}.md
```

`knowledge-documents/*`는 append-only 원문 저장 경로로 사용한다 (`storage.rules` 참조).

## 6. Trusted backend 계약

knowledge subsystem에서 아래 데이터는 trusted backend가 소유한다.

- `knowledgeDocumentChunks`
- `knowledgeEvidence`
- `knowledgeExtractionOutputs`
- `knowledgeReviewEvents`
- `knowledgeApprovalEvents`
- `knowledgeApprovedNodes`
- `knowledgeApprovedEdges`
- `knowledgePublishes`
- `knowledgePublicNodes`
- `knowledgePublicEdges`

실행 경계는 **Cloud Functions for Firebase (2nd gen)** 또는 동급의 Firebase Admin SDK 기반 executor로 둔다.

브라우저 클라이언트는 이 컬렉션들에 직접 쓰지 않는다.

## 7. Security 요약

- `projects`, `categories`, `statuses`, `meta`, `knowledgePublicMeta`, `knowledgePublicNodes`, `knowledgePublicEdges`:
  - 공개 읽기
- `admins`:
  - 본인 문서만 읽기, 쓰기 금지
- `knowledgeDocuments`, `knowledgeDocumentVersions`, `knowledgeReviews`:
  - admin 읽기/쓰기
- `knowledgeExtractionJobs`:
  - admin 읽기, 브라우저 직접 쓰기 금지
- `knowledgeDocumentChunks`, `knowledgeEvidence`, `knowledgeExtractionOutputs`, `knowledgeReviewEvents`, `knowledgeApprovalEvents`, `knowledgeApprovedNodes`, `knowledgeApprovedEdges`, `knowledgePublishes`:
  - admin 읽기, 클라이언트 쓰기 금지
- `knowledge-documents/*` Storage:
  - admin 읽기/쓰기

## 8. Retention / Backup 원칙

- `knowledgeDocumentVersions`, `knowledgeEvidence`, `knowledgeApprovalEvents`, `knowledgePublishes`:
  - 기본 영구 보존
- `knowledgeDocumentChunks`, `knowledgeExtractionOutputs`, `knowledgeExtractionJobs`, `knowledgeReviewEvents`:
  - archive/export 정책을 둔 뒤 정리 가능
- publish rollback은 logical rollback이고, 재해 복구는 Firestore/Storage 백업 복구로 분리한다.

## 9. 변경 이력

`oh-my-ontology` 로 코드베이스가 새로 출발한 시점부터의 변경만 기록한다. 본격적인 changelog 는 첫 release 후 별도 운영.
