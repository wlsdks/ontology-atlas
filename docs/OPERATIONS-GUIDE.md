---
title: Operations Guide
tags: [operations, overview]
---

# Operations Guide

> owner / editor / global admin 기준 운영 가이드. 이 서비스는 공개 화면에서 읽고, 필요할 때만 인라인 편집 또는 기능별 운영 라우트(`/settings`, `/review`, `/diagnostics`, `/knowledge`)로 들어가는 구조를 기준으로 설명한다.
>
> "admin" 네임스페이스(`/admin/*`)는 더 이상 존재하지 않는다. 이전 라우트는 모두 새 위치로 이동했거나 공개 surface의 인라인 액션으로 흡수되었다 (이행 계획: [`superpowers/plans/2026-04-25-admin-namespace-removal.md`](./superpowers/plans/2026-04-25-admin-namespace-removal.md)).

## 1. 현재 구현 상태

### 이미 운영 중

- `/login`, `/signup`, `/account`
- `/projects` — 권한 시 "새 프로젝트" 인라인 액션
- `/project/[slug]/` — 권한 시 인라인 편집/삭제/공개 토글
- `/project/view/?slug=...` (legacy redirect)
- `/knowledge/documents`, `/knowledge/documents/new`, `/knowledge/documents/[id]`
- `/review`, `/review/knowledge`
- `/settings/categories`, `/settings/statuses`, `/settings/api-keys`, `/settings/import`
- `/diagnostics/migrate`, `/diagnostics/insights`

### 계획 단계

- `/review/knowledge/graph` (graph inspector)

knowledge subsystem은 foundation을 넘어 최소 `등록 → 추출 → 연결 검토 → 공개 반영`까지 들어온 상태다. 다만 graph inspector route와 ontology-first public graph 고도화는 아직 다음 단계다.

## 2. 역할과 접근

본 제품은 Notion / Obsidian 모델을 따른다 — 자기 계정의 주인이 곧 자기 계정의 모든 작업을 직접 한다. 별도 "운영자 / 관리자" 역할은 없다.

- **게스트**: 공개 화면 읽기만 가능
- **로그인 사용자**: 본인 계정의 프로젝트/문서/시스템 설정 모두 직접 가능. 같은 화면에서 인라인 편집.
- **다른 계정의 멤버 (owner / editor)**: 그 계정에서 본인 계정과 동일한 권한
- **다른 계정의 viewer**: 그 계정 안에서 읽기 전용
- **global admin (`admins/{email}`)**: 시스템 차원의 전역 데이터 (전역 카테고리/상태) 와 진단 도구만 추가로 접근. 자기 계정 안에서는 모든 사용자가 어차피 풀 컨트롤이라 일상에서는 의미 거의 없음.

## 3. 로그인

로그인은 `/login` 하나로 통합되어 있다. 별도의 관리자 로그인 라우트는 없다.

1. `/login` 또는 `/signup` 접속
2. 이메일/비밀번호 또는 Google로 로그인
3. 본인 계정 또는 멤버십이 있는 계정의 모든 화면에서 바로 인라인 편집 가능
4. 전역 화이트리스트(`admins/{email}`)이면 추가로 `/diagnostics/*` 등 전역 도구 접근 가능

개발 빌드 한정으로 `/dev/login` 우회 로그인이 제공된다 (production 빌드에서는 노출되지 않음).

## 4. 글로벌 화이트리스트 관리

Firebase Console → Firestore → `admins` 컬렉션 → 새 문서 생성

- `Document ID`: 허용할 Gmail 주소
- 필드:
  - `addedAt`
  - `note`

코드로는 admin 추가가 불가능하다. Security Rules가 쓰기를 완전 차단한다.

`admins` 컬렉션은 기본 공개 데이터와 전역 운영 도구를 다루는 용도다. 일반 작업 공간 협업 권한은 `accountMemberships`로 관리한다.

## 5. 현재 프로젝트 CRUD 운영

별도 운영 대시보드는 없다. 프로젝트 작업은 모두 공개 surface(`/projects`, `/project/[slug]`)에서 권한 기반 인라인 액션으로 처리한다.

### 새 프로젝트 (`/projects` 인라인)

- 권한 있는 사용자에게 "새 프로젝트" 버튼이 노출된다.
- 클릭 시 모달 또는 `/projects/new` 로컬 라우트에서 폼 + 미리보기.
- 저장 후 계속 보거나 공개 화면으로 돌아갈 수 있음.
- owner 기준 기본 흐름은 `프로젝트 생성 → 첫 문서 추가`.

### 편집 (`/project/[slug]?edit=1` 또는 인라인 토글)

- 기존 프로젝트 수정.
- 공개 화면 자체에서 권한 시 "수정" 액션으로 진입한다 (별도 admin 라우트 없음).
- 상단 고정 액션 바에서 `저장 / 취소 / 삭제`.

### 카테고리/배치 편집 (`/settings/categories`)

- 카테고리 박스의 위치, 크기, 라벨을 조정
- 카테고리 기준으로 프로젝트 기본 배치 보정

## 6. 공개 화면에서 바로 하는 일

owner/editor는 `/`와 canonical 프로젝트 상세(`/project/[slug]/`)에서 아래를 바로 시작할 수 있다. `/project/view/?slug=...`는 기존 링크 호환을 위한 redirect 경로다.

- 프로젝트 정보 수정 (인라인)
- 관련 문서 추가 (`/knowledge/documents/new`로 컨텍스트 전달하여 진입)
- 문서 검토/공개 반영 (`/review/knowledge`)

즉 운영 흐름은 `공개 surface → 권한 따라 인라인 액션 → 필요할 때만 기능별 라우트`가 기본이다.

## 7. 이미지 업로드

- 업로드 위치: `/project/[slug]?edit=1` (또는 인라인 편집 모드)
- Storage 경로: `screenshots/{projectSlug}/`
- 허용 타입: png, jpeg, webp
- 최대 용량: 5MB

## 8. 문서 기반 온톨로지 운영 원칙

1. 공개 홈은 계속 `projects` 기반 토폴로지를 사용한다.
2. raw markdown, extraction output, review 상태는 공개하지 않는다.
3. knowledge의 canonical store는 `knowledgeApprovedNodes`, `knowledgeApprovedEdges`다.
4. 공개 연동은 `knowledgePublicNodes`, `knowledgePublicEdges` projection만 사용한다.
5. raw markdown는 Firestore가 아니라 Storage `knowledge-documents/`에 저장한다.
6. backend-owned 컬렉션은 브라우저가 직접 수정하지 않는다.
7. 테스트 계정/샌드박스 검증은 `?account={accountId}` 쿼리로 전역 데이터와 분리한다.

## 9. 문서 운영 플로우

현재는 아래 흐름을 실제로 운영할 수 있다.

### 1. 문서 등록

진입점:

- `/knowledge/documents`
- `/knowledge/documents/new`
- `/project/[slug]`의 "관련 문서 추가" 인라인 액션 (project 컨텍스트 자동 주입)

사용자는 새 문서를 등록하고 최소 metadata를 입력한다.

- 필수: `title`, `kind`, `projectIds`
- frontmatter가 있으면 frontmatter가 우선한다.
- 등록 완료 후 상세 페이지 `/knowledge/documents/[id]`로 이동한다.
- 새 프로젝트를 만든 직후엔 이 화면이 프로젝트 문맥과 함께 바로 열린다.

등록 화면은 최소한 아래 비교를 보여줘야 한다.

- `UI 입력값`
- `frontmatter 값`
- `최종 canonical 값`

충돌 필드는 강조 표시하고, 등록 전 canonical 결과를 확인할 수 있어야 한다.

### 2. 버전 생성

문서 상세에서 새 Markdown 파일을 업로드해 새 version을 만든다.

- 원문은 Storage `knowledge-documents/{documentId}/{versionId}.md`에 저장
- account scope에서는 Storage `accounts/{accountId}/knowledge-documents/{documentId}/{versionId}.md`에 저장
- 버전 메타는 Firestore `knowledgeDocumentVersions/{versionId}`에 기록
- account scope에서는 `accounts/{accountId}/knowledgeDocumentVersions/{versionId}`에 기록
- 현재 승인 기준 version과 새 version의 차이를 비교할 수 있어야 한다

### 3. 추출 요청

문서 상세에서 extraction job을 enqueue한다.

- job 생성은 사용자 클라이언트가 `enqueueExtractionJob` callable을 호출해 요청
- 실제 chunking/extraction/output 저장은 trusted backend가 처리
- 문서 상세에서 `queued / processing / failed / succeeded / superseded` 상태를 확인
- 첫 문서 등록 뒤에는 자동으로 첫 추출을 한 번 바로 시작한다.

### 4. 실패/재시도 확인

사용자는 실패 상태를 문서 상세에서 직접 확인한다.

표시해야 하는 최소 정보:

- 마지막 시도 시각
- `errorCode`
- `errorMessage`
- lease 만료 또는 stuck 상태
- 안전한 재시도 가능 여부

상태별 최소 허용 액션:

- `queued / leased / processing`: 읽기 전용
- `failed`: `새 job으로 재시도`
- `superseded`: 대체 job 링크만 제공
- `succeeded`: 결과 확인

### 5. 연결 검토

현재는 `연결 검토함`과 문서 상세의 승인 액션으로 최신 추출 결과를 canonical graph에 반영한다.

- 문서 상세에서 후보 노드/연결과 근거를 확인
- `이 결과 승인`으로 `knowledgeApproved*`에 반영
- 검토 화면에서는 현재 단계와 다음 행동을 먼저 보여준다.

### 6. 공개 반영

- 승인 결과는 private canonical graph에 반영
- 문서 상세의 `공개 토폴로지 반영` 액션이 `knowledgePublic*` projection을 생성
- 공개 프로젝트 상세는 projection 기반 문서 연결 정보를 읽음
- 공개 페이지는 projection만 읽음

## 10. 운영 체크리스트

- `/review`에서 검토 큐와 `/knowledge/documents`로의 운영 진입점 설계
- `/review` 카드 정의 (검토 대기 / 실패한 추출 / 최근 업로드 / 새 문서 등록)
- `/knowledge/documents` 필터/딥링크 query 계약 정의
- 문서 등록 화면의 metadata conflict preview 반영
- 문서 상세의 version compare / job action matrix 반영

### 검토 허브(`/review`) 카드 권장안

- `검토 대기`
- `새 문서 등록`
- `최근 업로드`
- `실패한 추출`
- `추출 대기 중 버전`

### 문서 목록 query 계약 예시

```text
/knowledge/documents?project=reactor&kind=spec&docStatus=active&jobStatus=failed&q=auth
```

## 11. 데이터 백업

### Firestore

Firebase Console → Firestore → Import/Export

백업 대상:

- `projects`
- `categories`
- `statuses`
- `meta`
- `knowledgeDocuments`
- `knowledgeDocumentVersions`
- `knowledgeDocumentChunks`
- `knowledgeExtractionJobs`
- `knowledgeExtractionOutputs`
- `knowledgeReviews`
- `knowledgeApprovedNodes`
- `knowledgeApprovedEdges`
- `knowledgePublicNodes`
- `knowledgePublicEdges`
- `accounts/{accountId}/developerActivityEvents`
- `accounts/{accountId}/developerActivityDeliveries`

`developerActivityDeliveries` 는 GitHub webhook payload 를 포함하므로
`pruneDeveloperActivityDeliveries` scheduler 가 30일 이후 삭제한다. 장기 감사가
필요하면 삭제 전 별도 export 를 운영 정책으로 둔다.

### Storage

백업 대상:

- `screenshots/`
- `knowledge-documents/`

## 12. 변경 이력

- 2026-04-12: 초기 작성
- 2026-04-14: 모바일 대시보드/편집기 운영 UX 반영
- 2026-04-17: knowledge subsystem v2 구현 상태 구분, 예정 운영 플로우, Storage 기반 원문 계약, private/public graph 원칙 추가
- 2026-04-18: 작업 공간, owner/editor 권한, 공개 화면에서 바로 수정하는 운영 흐름을 현재 구현 기준으로 반영
- 2026-04-25: Docs Vault Developer Activity Ingest 의 GitHub webhook 수신/표시, redelivery, payload retention 흐름 추가
- 2026-04-25: `/admin/*` 네임스페이스 폐기 결정 반영. 모든 운영 흐름을 새 URL 공간(`/projects` 인라인, `/knowledge`, `/review`, `/settings`, `/diagnostics`) 기준으로 재서술. 파일명 ADMIN-GUIDE → OPERATIONS-GUIDE
