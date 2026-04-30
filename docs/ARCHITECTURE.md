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
│ ├─ /                     전체 지도                    │
│ ├─ /projects             프로젝트 목록               │
│ ├─ /project/[slug]       개별 프로젝트 (인라인 편집)  │
│ ├─ /knowledge/*          지식 문서                   │
│ ├─ /ontology/*           승인된 ontology 트리·통계   │
│ ├─ /review               검토 큐                     │
│ ├─ /settings/*           시스템 설정                 │
│ ├─ /diagnostics/*        운영 도구                   │
│ ├─ /account              사용자 계정 설정            │
│ └─ /login, /signup       단일 사용자 인증            │
└───────────────────────────────────────────────────────┘
                    ↓ Firebase Web SDK
┌───────────────────────────────────────────────────────┐
│ Firebase                                              │
│ ├─ Firestore  (global + account scoped data)          │
│ ├─ Storage    (screenshots, knowledge markdown)       │
│ ├─ Auth       (email/password, Google, admin Google)  │
│ └─ Hosting    (정적 사이트 배포)                      │
└───────────────────────────────────────────────────────┘
                    ↓ trusted execution boundary
┌───────────────────────────────────────────────────────┐
│ Cloud Functions for Firebase (knowledge jobs)         │
│ ├─ chunk 생성                                         │
│ ├─ extraction provider 호출                           │
│ ├─ output 저장                                        │
│ ├─ approved graph 반영                                │
│ └─ public projection publish                          │
└───────────────────────────────────────────────────────┘
```

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

### Cloud Functions 2nd gen

- document version 로드
- chunking
- extraction provider 호출
- extraction output 저장
- evidence write
- review/approval audit write
- review seed 생성
- approved graph write
- publish log write
- public projection publish
- stale lease reclaim과 retry 처리

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

- `knowledgeDocumentChunks`
- `knowledgeExtractionOutputs`
- `knowledgeEvidence`
- `knowledgeReviewEvents`
- `knowledgeApprovalEvents`
- `knowledgeApprovedNodes`
- `knowledgeApprovedEdges`
- `knowledgePublishes`
- `knowledgePublicNodes`
- `knowledgePublicEdges`

`knowledgeExtractionJobs`는 브라우저가 직접 쓰지 않고, 사용자 요청을 받은 backend가 생성/갱신한다.

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
| `/` | 전체 지도 | 전체 공개 |
| `/projects` | 프로젝트 목록 (권한 시 "새 프로젝트" 버튼) | 전체 공개 |
| `/project/[slug]` | 개별 프로젝트 canonical route (권한 시 인라인 편집) | 전체 공개 |
| `/project/view?slug=...` | legacy redirect 호환 경로 | 전체 공개 |
| `/login` | 단일 로그인 | 전체 공개 |
| `/signup` | 회원가입 | 전체 공개 |
| `/account` | 사용자 자기 계정 설정 | 로그인 사용자 |
| `/knowledge/documents` | 문서 목록 | viewer 이상 (rules) |
| `/knowledge/documents/new` | 새 문서 등록 | editor 이상 |
| `/knowledge/documents/[id]` | 문서 상세 (등록/버전/추출/공개 반영) | editor 이상 |
| `/ontology` | 승인된 ontology 트리 (project → domain → capability → element) + 검색 + ego graph | viewer 이상 (`knowledgePublicNodes` read) |
| `/ontology/insights` | 4 패널 통계 — 허브 노드 / 최근 활동 / 30일 활동 타임라인 / 미연결 노드 | viewer 이상 |
| `/ontology/relations` | edge 단위 뷰 — 관계 타입별 필터 + 분포 | viewer 이상 |
| `/review` | 검토 큐 허브 | editor 이상 |
| `/review/knowledge` | 지식 연결 검토 워크스페이스 (추출 → 검수 → 승인 → publish) | editor 이상 |
| `/settings/categories` | 카테고리/배치 편집 | editor 이상 |
| `/settings/statuses` | 상태 편집 | editor 이상 |
| `/settings/api-keys` | API 키 관리 | owner / global admin |
| `/settings/import` | 프로젝트 임포트 | editor 이상 |
| `/diagnostics/migrate` | 데이터 마이그레이션 | global admin |
| `/diagnostics/insights` | 운영 지표 | editor 이상 |
| `/dev/login` | 개발 빌드 한정 우회 로그인 | dev only |

> 권한 모델은 URL 네임스페이스가 아닌 Firestore Security Rules 와 capability 훅으로 갈린다. 같은 공개 surface 안에서 권한에 따라 인라인 액션이 노출된다.

## 9. 현재 구현됨 vs 계획됨

### 이미 구현된 것

- 전체 지도 / 프로젝트 목록 / 개별 프로젝트
- 공개 로그인 / 회원가입
- account-scoped workspace와 membership(role: owner/editor/viewer)
- 공개 화면에서 owner/editor의 빠른 수정 흐름
- 프로젝트 CRUD
- 문서 등록 / 버전 업로드 / 추출 요청 / 연결 검토 / 공개 반영 최소 루프
- ontology v0 (C-1 phase): TBox 시드 (5 클래스 + unknown / 7 관계), Anthropic 추출 워커, frontmatter 등급 A/B/C 계약, canonical ID + stub 처리, `/ontology` 트리 + ego graph + insights + relations 4 surface, manual editor (검수 우회 직접 쓰기)
- global admin whitelist

### 아직 계획 단계인 것

- graph inspector
- 고도화된 ontology-first public graph experience
- 노드/영역 직접 편집용 project-internal editor
- 고도화된 extraction worker / merge quality 향상
- ontology v1: 모든 surface 에서 클래스 가시 (홈 토폴로지 색상 분기 / frontmatter 추천 / 통합 검색 / 2-hop ego 탐색) — 진행 중
- T-11 측정 (정확도 ≥ 80% / 단가 ≤ \$0.05/page / 검수 cycle ≤ 24h / 실패율 < 5%) → C-1 → C-2 cutover

현재는 `문서 기반 온톨로지 foundation`이 구현된 상태다. 다만 공개 메인 경험은 아직 `프로젝트 중심 뷰 + 문서 인사이트`에 가깝고, 향후에는 public projection 중심의 ontology-first 경험으로 더 옮겨갈 계획이다.

문서에 경로가 있어도, 해당 경로가 실제 코드에 없으면 아직 계획 단계로 본다.

## 10. 연관 문서

- [`DATA-MODEL.md`](./DATA-MODEL.md) — Firestore 컬렉션 + Storage 경로 + Security Rules
- [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) — 디자인 토큰 / 모션 / 금지 규칙
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — Firebase 배포 / 롤백 / 도메인
- [`../AGENTS.md`](../AGENTS.md) / [`../CLAUDE.md`](../CLAUDE.md) — 에이전트 / 컨트리뷰터 가이드
- [`../.claude/rules/`](../.claude/rules/) — 세부 작업 규율 (architecture / design / git / testing / local-first / auth / firestore-schema / documentation / forbidden)

## 11. 확장성 트리거

- 컨테이너 수 증가 시 단일 캔버스 → 탭 분리 재검토
- knowledge 문서 수 증가 시 review queue 와 publish 를 별도 단계로 분리 검토
- extraction volume 증가 시 Functions → Cloud Run 분리 검토
- 이미지 / 문서 업로드 증가 시 Storage lifecycle 및 리전 재검토
