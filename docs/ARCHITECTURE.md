---
title: Architecture
tags: [architecture, infra, overview]
---

# Architecture

> 이 문서는 현재 제품의 도메인 모델과 공개/운영 구조를 설명한다. 이 서비스는 더 이상 단순 공개 포트폴리오가 아니라, 작업 공간 안에서 문서 기반 온톨로지를 키우고 공개 화면에서 읽고 편집하는 구조를 기준으로 한다.

## 1. 현재 제품 구조

```text
┌───────────────────────────────────────────────────────┐
│ Next.js 정적 앱 (output: 'export')                   │
│ ├─ /                     ontology 트리 hub (mission v2)│
│ ├─ /topology             Sigma WebGL 토폴로지         │
│ ├─ /projects             프로젝트 목록 (mode-aware)   │
│ ├─ /project/[slug]       개별 프로젝트 (인라인 편집)  │
│ ├─ /docs                 vault picker / 문서 surface  │
│ ├─ /knowledge/*          cloud 모드 문서 등록 / 목록  │
│ ├─ /ontology/edit        xyflow ERD 빌더              │
│ ├─ /ontology/insights    그래프 인사이트              │
│ ├─ /ontology/relations   관계 분포                    │
│ ├─ /settings/*           카테고리 / 상태 / 가져오기   │
│ ├─ /diagnostics/insights 운영 인사이트                │
│ ├─ /account              사용자 계정 설정            │
│ └─ /login, /signup       Firebase Auth (옵션)         │
└───────────────────────────────────────────────────────┘
                    ↓ Firebase Web SDK
┌───────────────────────────────────────────────────────┐
│ Firebase (옵션 — cloud sync 필요할 때만)              │
│ ├─ Firestore  (global + account scoped data)          │
│ ├─ Storage    (screenshots, knowledge markdown)       │
│ ├─ Auth       (email/password, Google, admin Google)  │
│ └─ Hosting    (정적 사이트 배포)                      │
└───────────────────────────────────────────────────────┘
                    ↑ 별도 trusted boundary
┌───────────────────────────────────────────────────────┐
│ MCP 서버 (mcp/) — AI agent partner                    │
│ ├─ stdin/stdout JSON-RPC                              │
│ └─ vault frontmatter read/write (10 도구)             │
└───────────────────────────────────────────────────────┘
```

> **mission v2 정렬**: Cloud LLM extraction 흐름 (`enqueueExtractionJob` / `processExtractionJob` / `applyReviewAction` 등) 은 제거됨. AI 추출은 user-side AI agent (Claude Code 등) 가 MCP 서버로 직접 vault 갱신. Cloud Functions 폴더 (`functions/`) 도 폐기 — firebase 배포 안 함 정책 + mission v2 가 vault 자기-승인이라 publish/promote/dismiss 서버 사이드 게이트 불필요.

## 2. 도메인 모델

현재 제품은 아래 모델을 기준으로 설명해야 한다.

- **작업 공간(Account / Workspace)**: 데이터와 권한의 최상위 묶음
- **전체 지도**: 작업 공간 안의 모든 프로젝트를 묶어 보여주는 공개 화면
- **프로젝트 목록**: 프로젝트를 고르고 시작하는 허브
- **개별 프로젝트**: 프로젝트 내부 연결과 관련 문서를 읽는 화면
- **프로젝트 내부**: 영역, 노드, 관련 문서가 프로젝트를 설명하는 층위
- **문서 운영**: 문서 등록, 버전 업로드, 추출, 연결 검토, 공개 반영

즉 `프로젝트`가 가장 큰 작업 단위이고, 프로젝트 안에서 다시 문서와 노드가 자라야 한다. 프로젝트 안에서 또 새 프로젝트를 만드는 식의 액션은 잘못된 문맥이다.

## 3. 데이터와 권한 경계

핵심은 다음이다.

- 브라우저는 backend-owned 컬렉션에 직접 쓰지 않는다.
- raw markdown는 Firestore가 아니라 Storage에 저장한다.
- private approved graph와 public projection을 분리한다.
- 전역 공개 데이터와 account-scoped 데이터는 분리한다.
- 공개 화면은 읽기 기본, owner/editor는 같은 공개 화면에서 바로 수정 흐름으로 이어진다.

## 4. 책임 분리

### Next.js 앱

- 전체 지도, 프로젝트 목록, 개별 프로젝트 렌더
- 로그인/회원가입과 작업 공간 선택
- 공개 surface에서 본인/멤버의 인라인 편집(같은 URL에서 권한 따라 액션 노출)
- 프로젝트 상세 (`/project/[slug]`) 가 모든 관련 작업의 허브 — 토폴로지 이동, 연관 문서 보기/편집, 프로젝트 자체 수정이 한 화면에서 가능
- 문서 등록, 버전 업로드, 추출 요청은 `/knowledge/*`, 검토는 `/review`, 시스템 설정은 `/settings/*`, 진단 도구는 `/diagnostics/*`로 기능별 분리
- 공개 화면에서는 `knowledgePublic*` projection을 읽고, 본인 계정 surface에서는 private 문서/추출/검토 상태를 읽는다
- "admin" 네임스페이스는 더 이상 존재하지 않는다. "운영자 / 관리자"라는 별도 역할도 없다. 권한은 Firestore rules + 클라이언트 capability 훅으로 결정한다

### Firestore / Storage

- 공개 제품 canonical 데이터 저장
- account-scoped 프로젝트와 문서 저장
- knowledge 문서/버전 메타 저장
- raw markdown 원문 저장
- evidence / audit / publish log 저장
- canonical approved graph 저장
- public projection 저장

### Cloud Functions

폐기됨. 이유:
- firebase 배포 안 함 정책
- mission v2 의 vault 자기-승인 (publish projection 게이트 불필요)
- stub 흐름은 cloud LLM 추출의 산물 — 그게 사라지며 promote/dismiss 도 dead

이전 cleanup 단계 (PR #5/#6) 에 chunking / extraction / review seed / approval audit 가 제거됐고, 마지막으로 `functions/` 폴더 자체와 `firebase.json` 의 functions 키도 제거됨. 클라이언트 측 `httpsCallable` 코드는 남아있을 수 있으나 deploy 안 된 환경에서 호출 시 fail — 사용자 흐름 영향 0 (cloud 모드 사용 안 함).

### MCP 서버 (mission v2 신설)

- **`mcp/` 패키지** — `@modelcontextprotocol/sdk` 의존, stdin/stdout JSON-RPC
- AI agent (Claude Code 등) 가 직접 vault `.md` read/write
- 10 도구 (read 6 + write 4): list_concepts · get_concept · find_evidence · find_backlinks · find_path · list_kinds · add_concept · add_relation · patch_concept · delete_concept
- 등록: `.mcp.json.example` 또는 `mcp/README.md` 참고

## 5. 데이터 경계

### 공개 read model

아래는 공개 읽기 가능 데이터다.

- `projects`
- `accounts/{accountId}/projects`
- `categories`
- `statuses`
- `meta`
- `knowledgePublicNodes`
- `knowledgePublicEdges`
- `accounts/{accountId}/knowledgeDocuments` **조건부** — 계정
  `isPublic == true` + 문서 `status == 'published'` 일 때만 비인증 read
  허용. 공개 detail 페이지가 "이 프로젝트를 설명하는 문서" 섹션을 그리기
  위한 경로.

### 자기 계정 private model (계정 주인 / 멤버 only)

아래는 본인 계정 또는 본인이 멤버로 있는 계정만 읽을 수 있다.

- `knowledgeDocuments` (전역 canonical)
- `knowledgeDocumentVersions`
- `knowledgeReviews`
- Storage `knowledge-documents/*`
- `accounts/{accountId}/knowledgeDocuments/*` — status 가 `published` 이
  아니거나 계정이 private 이면 본인/멤버 만
- `accounts/{accountId}/knowledgeDocumentVersions/*`

### backend-owned model

아래는 backend가 쓰고 사용자는 읽기만 한다.

- `knowledgeApprovedNodes` — manual editor 또는 publish 결과 canonical
- `knowledgeApprovedEdges` — V1.1 qualifiers + rank 옵셔널 필드 추가
- `knowledgePublishes` — publish event log
- `knowledgePublicNodes` — public projection
- `knowledgePublicEdges` — public projection (V1.1 fields-pass-through)

#### Cold storage (mission v2 cleanup 후 read-only)

아래는 mission v2 cleanup 으로 더 이상 callable 가 없어 read-only:

- `knowledgeExtractionJobs` — extraction enqueue 끊김
- `knowledgeExtractionOutputs` — extraction worker 끊김
- `knowledgeReviewEvents` — review queue 페이지 삭제
- `knowledgeApprovalEvents` — applyReviewAction 제거
- `knowledgeDocumentChunks` — chunking 제거
- `knowledgeEvidence` — extraction worker 끊김

## 6. 권한 모델

본 제품은 Notion / Obsidian 모델을 따른다. 자기 계정의 주인이 곧 자기 계정의 모든 작업을 직접 한다 — 별도 "운영자 / 관리자" 역할은 없다. 협업이 필요할 때만 다른 사용자에게 멤버 권한이 부여된다.

- **게스트**: 링크로 들어와 읽기만 가능
- **로그인 사용자**: 본인 계정의 모든 작업 (프로젝트, 문서, 시스템 설정) 직접 가능
- **다른 계정의 멤버**: 그 계정의 owner/editor membership 을 받은 사용자. 해당 계정 안에서 본인 계정과 동일한 권한
- **다른 계정의 viewer**: 그 계정의 읽기 전용 멤버
- **global admin (`admins/{email}`)**: 시스템 차원의 데이터 (전역 카테고리/상태) 와 진단 도구 접근. 일상 사용에서는 거의 의미가 없음 — 본인 계정 안에서는 모든 사용자가 자기 자산을 풀 컨트롤

권한 모델은 더 이상 URL 네임스페이스(과거 `/admin/*`)에 의존하지 않는다. 같은 공개 surface에서 권한에 따라 인라인 액션이 노출되고, 시스템 설정/검토/진단은 기능별 라우트(`/settings`, `/review`, `/diagnostics`)로 분리한다. 권한의 진짜 게이트는 Firestore Security Rules다.

## 7. FSD 레이어 구성

```text
app/                 ← Next.js 라우팅 전용 (얇은 래퍼)
src/
  app/               ← FSD app 레이어 (providers, 초기화)
  views/             ← 페이지 컴포넌트
  widgets/           ← 복합 UI 블록
  features/          ← 사용자 인터랙션 단위
  entities/          ← 비즈니스 엔티티
  shared/            ← 재사용 기반
```

**Import 방향**: `app → views → widgets → features → entities → shared`

상세 규칙: [`rules/architecture-fsd.md`](rules/architecture-fsd.md)

## 8. 페이지와 운영 경로

| 경로 | 역할 | 접근 |
| --- | --- | --- |
| `/` | ontology 트리 hub (project → domain → capability → element) + 검색 + ego graph (mission v2). vault 활성 시 vault frontmatter 자동 사용 (Q1=(a)) | 전체 공개 |
| `/topology` | Sigma WebGL 토폴로지 (출구 view) | 전체 공개 |
| `/projects` | 프로젝트 목록 (권한 시 "새 프로젝트" 버튼) | 전체 공개 |
| `/project/[slug]` | 개별 프로젝트 canonical route (권한 시 인라인 편집) | 전체 공개 |
| `/project/new` · `/project/[slug]/edit` | 프로젝트 에디터 | editor 이상 |
| `/docs` | vault picker / vault 활성 시 문서 surface | 전체 공개 (vault 는 사용자 디스크) |
| `/login` · `/signup` · `/reset-password` | Firebase Auth surface | 전체 공개 |
| `/account` | 사용자 자기 계정 설정 | 로그인 사용자 |
| `/knowledge` | 문서 대시보드 | viewer 이상 |
| `/knowledge/documents` | 문서 목록 | viewer 이상 |
| `/knowledge/documents/new` | 새 문서 등록 (mode-aware) | editor 이상 |
| `/knowledge/documents/view?id=...` | 문서 상세 (2단계 stepper: 올리기 → 공개) | editor 이상 |
| `/ontology/edit` | xyflow ERD 빌더 + frontmatter md 내보내기 | editor 이상 |
| `/ontology/insights` | 4 패널 통계 — 허브 / 최근 활동 / 30일 타임라인 / 미연결 | viewer 이상 |
| `/ontology/relations` | edge 단위 뷰 — 관계 타입별 필터 + 분포 | viewer 이상 |
| `/settings/categories` · `/settings/statuses` · `/settings/import` | 카테고리/상태/CSV import | editor 이상 |
| `/settings/ontology` · `/settings/ontology/history` | TBox read-only + version 이력 | viewer 이상 |
| `/diagnostics/insights` | 운영 지표 (stale / orphan / promote 후보) | editor 이상 |

> mission v2 cleanup 후 폐기: `/review` / `/review/knowledge` / `/settings/api-keys` / `/diagnostics/migrate` / `/admin/*` / `/project/topology` / `/project/view` 등 모두 제거됨.
| `/dev/login` | 개발 빌드 한정 우회 로그인 | dev only |

> 권한 모델은 URL 네임스페이스가 아닌 Firestore Security Rules 와 capability 훅으로 갈린다. 같은 공개 surface 안에서 권한에 따라 인라인 액션이 노출된다.

## 9. 현재 구현됨 vs 계획됨

### 이미 구현된 것

- 전체 지도 / 프로젝트 목록 / 개별 프로젝트
- 공개 로그인 / 회원가입
- account-scoped workspace와 membership(role: owner/editor/viewer)
- 공개 화면에서 owner/editor의 빠른 수정 흐름
- 프로젝트 CRUD (mode-aware: local vault / cloud Firestore)
- 문서 등록 / 버전 업로드 / 공개 반영 (cloud 모드)
- vault frontmatter → ontology stub fast-path (mission v2)
- ontology v0: TBox 시드 (5 클래스 + 7 관계), `/` 트리 + ego graph, `/ontology/edit` 빌더, `/ontology/insights` + `/ontology/relations`, manual editor 직접 쓰기
- V1.1 — Wikidata statement qualifiers + rank (옵셔널 필드, additive)
- AI agent partner (MCP 서버) — 7 도구로 vault read/write
- dogfood vault (`docs/ontology/`) — 자기 자신 mental model
- global admin whitelist

### 아직 계획 단계인 것

- V1.2 — literal properties (`knowledgeApprovedLiterals`)
- V1.3 — rich references (retrievedAt / extractionModelId / confidence)
- V1.4 — ActionType (Palantir 영감, DEFERRED)
- V1.5 — relation cardinality
- V2 — 통합 KnowledgeStatement (RDF-star 호환)
- multi-vault — 여러 vault 동시 활성
- Phase 4 비개발자 surface (kind 별 아이콘, 한국어 매핑 layer 등)

자세히: `docs/BACKLOG.md` (T19-T38).

문서에 경로가 있어도, 해당 경로가 실제 코드에 없으면 아직 계획 단계로 본다.

## 10. 연관 문서

- [`PRODUCT-DIRECTION.md`](./PRODUCT-DIRECTION.md) — mission v2 방향
- [`FEATURES.md`](./FEATURES.md) — 사용자가 *지금* 사용 가능한 기능 전수
- [`BACKLOG.md`](./BACKLOG.md) — next-work 통합 (T28-T38)
- [`MODE-AWARE-CRUD.md`](./MODE-AWARE-CRUD.md) — local/cloud/static 분기 가이드
- [`ONTOLOGY-MODEL-V2-DRAFT.md`](./ONTOLOGY-MODEL-V2-DRAFT.md) — V1.x → V2 spec
- [`MISSION-CLEANUP-CANDIDATES.md`](./MISSION-CLEANUP-CANDIDATES.md) — 4 stage cleanup 진행 (모두 ✅)
- [`DATA-MODEL.md`](./DATA-MODEL.md) — Firestore 컬렉션 + Storage 경로 + Security Rules
- [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) — 디자인 토큰 / 모션 / 금지 규칙
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — Firebase 배포 / 롤백 / 도메인
- [`CHANGELOG.md`](./CHANGELOG.md) — 시간순 사용자 가시 변화
- [`../mcp/README.md`](../mcp/README.md) — MCP 서버 7 도구 + 등록
- [`../AGENTS.md`](../AGENTS.md) / [`../CLAUDE.md`](../CLAUDE.md) — 에이전트 / 컨트리뷰터 가이드
- [`../.claude/rules/`](../.claude/rules/) — 세부 작업 규율

## 11. 확장성 트리거

- 컨테이너 수 증가 시 단일 캔버스 → 탭 분리 재검토
- vault 문서 수 증가 시 fingerprint diff + worker 분리 검토
- 이미지 / 문서 업로드 증가 시 Storage lifecycle 및 리전 재검토
