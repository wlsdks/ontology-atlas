# Changelog

> 주요 변경 이력. 구조 변경·마이그레이션·기능 릴리즈를 날짜별로 기록.

## [Unreleased]

### Fixed — 공개 지식 소비 경로 숨은 갭 3건 메움 (Phase 1–4, 2026-04-22)

iter 32-34 가 "공개 detail 에 linked docs" 인프라까지 열었지만, admin 이 실제
publish 를 눌렀을 때 제품이 제 역할을 하는지 E2E 로 훑어보니 세 개의 dead
path 가 드러났다. 각각 한 줄씩 회복.

**Phase 1 — publish Cloud Function 이 문서 status 를 전환하지 않던 갭**
- `functions/index.js`: `publishKnowledgeProjectionCore` 가 approvedNodes/Edges
  → publicNodes/Edges 복제만 하고 `knowledgeDocuments.status` 는 건드리지
  않았다. admin UI 의 4단계 stepper 가 `status === 'published'` 로 분기했지만
  실제로 published 로 전환하는 코드가 어디에도 없었다 — iter 32 rule 이
  "이론만 열린" 상태였던 이유.
- 수정: publish 에 포함된 approvedNodes/Edges 의 `sourceDocumentIds` 를
  수집해서 batch 로 `status='published' + lastPublishedAt + lastPublishId`
  기록. account-scoped · 전역 경로 모두 지원.

**Phase 3 — knowledgePublic* subscribe 가 게스트를 막고 있던 가드**
- `views/project-detail`: subscribe 직전에 `scopedAccess.kind === 'guest'`
  return 으로 공개 독자를 차단하고 있었다. 주석엔 "게스트는 읽기 권한이
  없다" 였지만 현재 firestore.rules 의 `knowledgePublicNodes/Edges/Meta` 는
  모두 `allow read: if true`. 인프라는 열려 있었지만 UI 가 일부러 끊고
  있던 상태.
- 수정: 해당 가드 제거. 공개 게스트가 ProjectKnowledgeTopology · "프로젝트
  설명 문서" · 개념/연결 섹션을 처음으로 본다.

**Phase 4 — Gemini extractor timeout 이 no-op 이던 버그**
- `functions/extract-gemini.js`: `AbortController` 를 만들고 setTimeout 으로
  abort() 호출하지만 `model.generateContent()` 에 signal 을 전달하지 않아
  timeout 이 전혀 동작 안 함. Gemini 가 행 걸리면 Cloud Function 기본 540s
  까지 대기 → 비용 낭비.
- 수정: `Promise.race` 로 대체. 20s 초과시 명시적 reject → 기존 stub
  fallback 경로로 자동 이동. dead AbortController 제거.

### Chore
- `functions/package.json` 에 `@google-cloud/functions-framework` 명시 — pnpm
  lockfile 사용 시 Cloud Build 가 이걸 요구해 함수 배포가 실패했음.

### Added — 공개 detail 에 knowledge docs 경로 개통 (iter 32–34, 2026-04-22)

지금까지 knowledge subsystem v2 스펙·rules·admin 등록 UI·Cloud Functions 는
있었지만 공개 독자가 `/project/[slug]/` 에서 "이 프로젝트를 설명하는 문서"
를 볼 경로가 없었다. CLAUDE.md 가 "설계 방향만 있고 런타임 현실 아님" 이라
명시했던 간극. 최소 슬라이스로 닫음.

- `firestore.rules`: `accounts/{id}/knowledgeDocuments` read 를
  `isAccountPublic() + status == 'published'` 까지 확장. draft/reviewing/
  processing/error 상태는 여전히 member/admin 전용.
- `firestore.indexes`: `status ASC + projectIds array-contains + updatedAt DESC`
  복합 인덱스 추가 — public 쿼리 실행 조건.
- `entities/knowledge-document`: `getPublicDocumentsForProject(slug, accountId)`
  — 1-shot `getDocs`, published 문서만 반환, rule/인덱스 실패 시 빈 배열
  fallback. 데모 세션 · dev-admin bypass 분기 포함.
- `widgets/project-documents-list`: `publicOnly` prop 듀얼패스. 게스트는
  1-shot fetch, 멤버·admin 은 기존 realtime subscribe.
- `views/project-detail`: `scopedAccess.kind === 'guest'` 를 기준으로
  `publicOnly` 자동 전달.

결과: 공개 계정(isPublic=true)의 프로젝트에 published 상태 문서가 연결되면
비로그인 방문자에게도 상세 페이지 "등록된 문서" 섹션에 타이틀·kind·날짜가
노출. 추출/리뷰/승인까지는 다음 슬라이스에서 다룬다.

### Added (auto-loop iter 8–29, 2026-04-22)

#### 제품 안전망

- `app/global-error.tsx` — 루트 layout 크래시 시 브라우저 기본 에러 대신
  Narnia 톤 에러 UI + 재시도·홈 링크 (iter 10)
- `ProjectDetailPage` — 공개 `/project/[slug]/` 가 하이드레이션 직후
  "찾을 수 없음" 으로 붕괴하던 회귀 fix + `resolveSubscribeUpdate` 헬퍼로
  추출 및 5건 유닛 테스트 (iter 16, 25)

#### SEO / 구조화 데이터

- sitemap/robots 정합화, `/projects` 색인 대상 추가 (iter 12, 20)
- 공개 3대 경로 (`/`, `/projects`, `/project/[slug]`) canonical URL 명시 (iter 20)
- `<script type="application/ld+json">` — WebSite + Organization (layout),
  CreativeWork + BreadcrumbList (project detail) (iter 13, 14)
- 페이지별 metadata.title + robots: auth/admin noindex, 공개 페이지 색인 허용,
  admin layout title template `%s · Admin · Narnia` cascade (iter 11, 21)
- `/admin/project/[slug]` 동적 metadata — "IAM 편집 · Admin · Narnia" (iter 23)
- `useDocumentTitle` 과 metadata 충돌 정리 — 정적 12 admin 페이지에서 제거,
  동적 5 페이지만 유지 (iter 22)

#### 보안

- Firebase Hosting 전역 5개 보안 헤더 — X-Content-Type-Options nosniff ·
  Referrer-Policy · Permissions-Policy · HSTS · X-Frame-Options (iter 14)
- `/accounts/*/apiKeys/*` update 를 `affectedKeys().hasOnly(['revokedAt'])`
  로 필드 단위 제한 — member 가 keyHash/scopes 변조 못 하게 (iter 24)
- storage.rules 감사 (변경 없음, 기존 설정이 이미 단단)

#### 성능 / PWA

- preconnect/dns-prefetch — Firestore·Auth·Installations·Storage 도메인
  (iter 18)
- Firebase Hosting Cache-Control — HTML 300s + stale-while-revalidate 86400s,
  JS/CSS/이미지 1y immutable (iter 28)
- Web App Manifest — name/short_name/theme/bg/ko-KR/standalone (iter 15),
  PWA id·scope 추가로 정체성 안정화 (iter 29)

#### a11y

- 6개 dialog aria-label/aria-modal 누락 보완 (iter 12)
- sr-only h1 보완 — 홈, 계정 설정, admin 10 페이지 (iter 15, 26)

#### DX / 인프라

- Firebase `hosting.predeploy: ["pnpm build"]` — stale `out/` 업로드 방지
  (iter 17)
- `/map` 레거시를 client JS redirect 에서 Firebase Hosting 301 로 이관,
  쿼리 자동 보존 (iter 19)
- GitHub Actions CI workflow — PR/main push 시 lint·typecheck·unit·build
  자동 실행 (iter 27) · 단, GitHub 빌링 이슈로 첫 실행 블록됨

### Removed (auto-loop)

- `@xyflow/react` (React Flow) 의존성 제거 + `widgets/canvas-controls` 전체 ·
  `widgets/topology-canvas/lib/use-force-simulation.ts` 등 Sigma 전환 이후
  죽은 경로 정리. `compute-initial-layout` 을 `features/topology-layout/model`
  로 이동해 FSD 준수 (iter 8)
- `startLiveLayout` · `restoreIamSession` 등 ts-prune 확인된 dead export 제거
  (iter 9)

### Added

- document knowledge subsystem v2 설계 문서 추가
  - `docs/superpowers/specs/2026-04-17-document-knowledge-subsystem-v2.md`
  - 공개 제품을 유지한 채 `/admin/knowledge/*` 기반의 분리형 knowledge subsystem으로 재설계
  - public/private data boundary, immutable evidence, approved projection, worker 경계를 명시
- knowledge backend contract 문서 추가
  - `docs/superpowers/specs/2026-04-17-knowledge-backend-contract-v1.md`
  - extraction input/output, job 상태 머신, idempotency, lease reclaim, evidence reference, approved/public graph write ownership을 정의
- knowledge subsystem foundation v2 구현 계획 문서 추가
  - `docs/superpowers/plans/2026-04-17-phase-2a-knowledge-subsystem-foundation-v2.md`
  - 스키마, admin UI, worker contract, publish projection 순서로 작업 트랙을 재구성

- 문서 기반 온톨로지 확장 초안 스펙 추가
  - `docs/superpowers/specs/2026-04-17-ontology-driven-project-map.md`
  - 토폴로지 맵을 `Project -> Domain -> Capability -> Element` 구조의 온톨로지로 확장하는 방향을 정리
  - Markdown 문서 계약, 인제스트 파이프라인, 리뷰 큐, 관계 타입, 화면 구조, Gemini 워커 계약, 단계별 롤아웃을 정의
- 온톨로지 foundation 구현 계획 문서 추가
  - `docs/superpowers/plans/2026-04-17-phase-2-ontology-foundation.md`
  - 데이터/문서 등록/추출 워커/리뷰 큐/공개 화면 최소 통합 순서로 구현 단계를 분리
- README에 온톨로지 확장 스펙 진입점 추가
  - `README.md`

### Changed

- 공개 진입 구조를 `서비스 첫 화면 + 로그인 후 사용` 모델로 전환
  - `app/page.tsx`
  - `src/views/landing/*`
  - `src/views/root-entry/*`
  - `src/views/project-selector/ui/ProjectSelectorPage.tsx`
  - `src/views/project-detail/ui/ProjectDetailPage.tsx`
  - `src/widgets/account-menu/ui/PublicAccountMenu.tsx`
  - 비로그인 사용자는 `/`에서 서비스 첫 화면을 보고, 로그인·회원가입·데모 로그인을 시작하도록 구조를 재정렬
  - `/projects`, `/project/view`는 로그인 전 직접 접근 시 서비스 첫 화면으로 되돌리고, 원래 보던 경로는 `next`로 보존
  - 로그아웃 후에도 서비스 첫 화면으로 복귀하도록 공개 계정 메뉴 흐름을 정리
  - 데모 로그인과 owner/public E2E를 새 인증 게이트 기준으로 재검증

- 제품 정의 문서를 현재 구현 기준으로 재정렬
  - `README.md`
  - `docs/ARCHITECTURE.md`
  - `docs/ADMIN-GUIDE.md`
  - `docs/superpowers/specs/2026-04-12-aslan-project-map-design.md`
  - 초기 `공개 포트폴리오 + 1인 어드민` 전제를 걷고, `작업 공간 / 전체 지도 / 프로젝트 목록 / 개별 프로젝트 / 문서 기반 온톨로지 / owner-editor-viewer 권한` 모델을 현재 구현 기준으로 반영
- `AGENTS.md`, `CLAUDE.md`를 현재 Next.js 16/App Router 현실과 knowledge subsystem v2 방향에 맞게 재정비
  - `AGENTS.md`
  - `CLAUDE.md`
  - 이미 Next.js 전환이 끝난 프로젝트라는 점, v2는 아직 설계 상태라는 점, URL 계약 부채와 knowledge 착수 조건을 명시
- knowledge subsystem v2 foundation 문서를 실제 개발 가능 기준으로 재정리
  - `docs/superpowers/specs/2026-04-17-document-knowledge-subsystem-v2.md`
  - `docs/superpowers/plans/2026-04-17-phase-2a-knowledge-subsystem-foundation-v2.md`
  - private approved graph canonical store, Storage 기반 raw markdown, Cloud Functions 2nd gen trusted backend, `/admin/knowledge/documents/new`, 문서 상세 최소 운영 흐름, 축소된 Phase 2A 범위, 2A/2B 게이트와 화면 계약을 반영
- 운영/스키마 문서를 knowledge subsystem v2 foundation 기준으로 정렬
  - `docs/DATA-MODEL.md`
  - `docs/ADMIN-GUIDE.md`
  - `docs/ARCHITECTURE.md`
  - `firestore.rules`
  - `storage.rules`
  - `firestore.indexes.json`
  - public/private boundary, backend-owned 컬렉션, `knowledge-documents/` Storage 경로, trusted backend 경계, evidence/publish/audit 컬렉션, append-only 원칙, jobs/reviews/public projection 인덱스를 추가
- knowledge subsystem Phase 2A 첫 코드 슬라이스를 추가
  - `app/admin/knowledge/*`
  - `src/entities/knowledge-document/*`
  - `src/entities/knowledge-version/*`
  - `src/entities/knowledge-job/*`
  - `functions/index.js`
  - 문서 등록, 버전 업로드, query 기반 상세, extraction enqueue callable 스캐폴드를 구현
- knowledge graph 승인/공개 반영 최소 루프를 추가
  - `src/entities/knowledge-graph/*`
  - `functions/index.js`
  - `scripts/dev-admin-proxy.mjs`
  - `src/views/admin-knowledge-document-detail/ui/AdminKnowledgeDocumentDetailPage.tsx`
  - `src/views/project-detail/ui/ProjectDetailPage.tsx`
  - 관리자 문서 상세에서 `이 결과 승인`과 `공개 토폴로지 반영`을 실행 가능하게 하고, 공개 프로젝트 상세 우측 레일에 `문서 기반 인사이트` 카드를 추가
  - 샌드박스 seed는 `추출 -> 승인 -> publish`까지 자동으로 반영하도록 올려 공개 화면에서도 문서 기반 연결을 바로 검증 가능하게 정리
- sandbox 계정 기반 분리 검증 흐름을 추가
  - `accounts/{accountId}/projects/*`
  - `accounts/{accountId}/knowledgeDocuments/*`
  - `accounts/{accountId}/knowledgeDocumentVersions/*`
  - `accounts/{accountId}/knowledge-documents/*`
  - `?account=sandbox-lab` 쿼리로 admin/public에서 기존 전역 데이터와 분리된 테스트 흐름을 검증 가능하게 정리
- README의 knowledge subsystem 링크를 planned 상태로 명시
  - `README.md`
- 어드민 대시보드와 편집기의 운영 UX를 정리
  - `src/views/admin-dashboard/ui/AdminDashboardPage.tsx`
  - `src/views/admin-project-editor/ui/AdminProjectEditorPage.tsx`
  - `src/features/project-edit/ui/ProjectForm.tsx`
  - `src/views/admin-login/ui/AdminLoginPage.tsx`
  - `src/views/admin-dev-login/ui/AdminDevLoginPage.tsx`
  - 대시보드 통계/행 액션/선택 상태 문구를 한국어 운영 톤으로 통일하고, 편집 화면 상단에 즉시 저장 가능한 액션 바를 추가
  - 대시보드 상단에 빠른 운영 카드 4종을 추가하고, 편집 화면에는 섹션 이동 네비게이션과 그룹형 입력 카드를 적용
  - 모바일에서는 빠른 운영 카드를 가로 레일로 압축하고, 편집 화면은 미리보기보다 입력 폼을 먼저 보이게 정리
  - 모바일 프로젝트 행은 메타 칩과 하단 액션 줄로 재구성해 읽기와 조작이 서로 겹치지 않게 정리
  - 모바일 대시보드의 필터·일괄 작업은 접힘 패널과 요약 라인으로 정리해 첫 화면 길이를 줄임
  - 어드민 대시보드의 일괄 작업은 기본 접힘 상태로 시작하고, 선택이 생기면 자동으로 열리게 바꿔 리스트 집중도를 높임
  - 어드민 첫 화면의 통계·빠른 운영은 `운영 개요` 패널로 묶어 모바일에서는 기본 접힘, 데스크톱에서는 기본 열림으로 정리
  - 모바일 편집기의 미리보기·완성도 패널은 접힘 요약 카드로 바꿔 입력 흐름을 먼저 보이게 정리
  - 모바일 편집기 상단 액션 바는 저장 중심의 2단 구조로 재배치해 취소·삭제보다 저장이 먼저 읽히게 조정
- 공개 화면의 버튼과 액션 라벨을 한국어 중심으로 통일
  - `src/widgets/search-palette/ui/SearchPalette.tsx`
  - `src/views/project-detail/ui/ProjectDetailPage.tsx`
  - `src/widgets/project-drawer/ui/ProjectDrawer.tsx`
  - `src/widgets/portfolio-showcase/ui/PortfolioShowcase.tsx`
  - `src/widgets/region-navigator/ui/RegionNavigator.tsx`
  - `src/widgets/featured-paths/model/presets.ts`
  - 검색 패널의 결과 메타, 상세 페이지와 드로어의 하단 상태 문구, 포트폴리오 모드의 주요 버튼과 캡션을 한국어로 정리
  - 우측 영역 레일과 추천 경로 라벨도 `영역 보기 / 허브 중심 / 전체 / 인증 / 에이전트 / 제품`처럼 한국어 톤으로 통일
- 모바일 노드 카드의 텍스트 밀도를 더 줄여 맵 인상을 정리
  - `src/entities/project/ui/ProjectCard.tsx`
  - 모바일에서는 노드 설명을 1줄로 눌러 카드가 과하게 읽히지 않게 하고, 태그도 첫 항목만 기본 노출되도록 조정
  - 카드 자체 높이와 너비도 소폭 줄여 첫 화면에서 같은 영역 안에 더 많은 토폴로지가 보이게 개선
- 모바일 상단 툴바와 추천 경로 헤더를 더 얇게 조정
  - `src/widgets/search-hint/ui/SearchHint.tsx`
  - `src/widgets/featured-paths/ui/FeaturedPaths.tsx`
  - `src/views/home/ui/HomePage.tsx`
  - 모바일 상단 툴바 버튼 높이와 좌우 패딩을 줄여 첫 화면 여백을 더 확보하고, 검색 버튼 중심 위계는 유지
  - 추천 경로 헤더와 접힌 상태 요약 바도 한 단계 더 줄여서 맵이 더 먼저 보이도록 미세 조정
- 모바일 하단 보조 버튼의 존재감을 더 줄여 맵을 우선 노출
  - `src/widgets/project-tour/ui/ProjectTour.tsx`
  - `src/widgets/legend/ui/Legend.tsx`
  - 모바일 `가이드` 버튼은 더 얇은 보조 pill로 줄이고, `범례` 버튼은 아이콘에 가까운 축약 표현으로 정리해 첫 화면에서 덜 튀게 조정
  - 데스크톱 톤은 유지하고 모바일만 더 절제된 무게를 갖도록 분리
- 모바일 홈 첫 화면의 맵 가시성을 높이도록 카드와 패널 밀도를 조정
  - `src/entities/project/ui/ProjectCard.tsx`
  - `src/widgets/featured-paths/ui/FeaturedPaths.tsx`
  - `src/views/home/ui/HomePage.tsx`
  - 모바일 토폴로지 노드는 카드 크기, 타이포, 태그 풋라인을 한 단계 압축해 같은 화면에 더 많은 맵이 보이게 조정
  - `Featured paths`는 모바일에서 헤더, 요약, 카드 내부 간격을 줄이고 상단 위치도 조금 올려 첫 화면에서 맵이 더 먼저 읽히도록 개선
  - 접힌 상태 요약은 두 줄 카드 대신 한 줄에 가까운 캡션 바로 다듬어 첫 화면에서 차지하는 높이를 더 축소
  - 데스크톱 크기와 리듬은 유지해 모바일만 더 시원하게 보이도록 반응형 밀도를 분리
- 모바일 상단 툴바와 보조 홈 카피의 위계를 더 단순하게 조정
  - `src/widgets/search-hint/ui/SearchHint.tsx`
  - `src/views/home/ui/HomePage.tsx`
  - `src/widgets/canvas-controls/ui/CanvasControls.tsx`
  - 모바일 툴바에서는 검색 버튼을 기본 행동처럼 더 또렷하게 보이게 하고, 포트폴리오/프레젠테이션 아이콘은 한 단계 덜 강조해 상단 위계를 정리
  - 모바일 브랜드 보조 카피 `Products, identity, agents.`와 발표 모드 종료 `Exit`도 한국어 중심으로 맞춰 홈 첫 화면 톤을 통일
  - 확대/축소/화면 맞춤 버튼의 접근성 라벨도 한국어로 정리해 보조 UI까지 같은 톤으로 맞춤
- 투어 오버레이와 범례 버튼 카피를 한국어 중심으로 정리
  - `src/widgets/project-tour/model/steps.ts`
  - `src/widgets/project-tour/ui/ProjectTour.tsx`
  - `src/widgets/legend/ui/Legend.tsx`
  - 모바일 하단 `Guide`, `Map`, `Guided tour`처럼 첫 화면에서 튀던 영어 보조 UI를 `가이드`, `범례`, `가이드 투어`로 통일
  - 투어 단계 제목과 eyebrow도 한국어 중심으로 바꿔, 홈 첫 화면의 공개 포트폴리오 톤과 안내 오버레이 톤이 분리되지 않게 조정
  - `Prev / Skip / Next / Finish`도 `이전 / 건너뛰기 / 다음 / 마침`으로 정리해 모바일 사용 흐름이 더 자연스럽게 읽히도록 개선
- 홈 히어로와 featured paths의 마이크로카피를 한국어 중심으로 정리
  - `src/widgets/hero-header/ui/HeroHeader.tsx`
  - `src/widgets/featured-paths/ui/FeaturedPaths.tsx`
  - `src/widgets/featured-paths/model/panel-state.ts`
  - 홈 상단의 `Public System Portfolio`, `Portfolio mode`, `Search projects` 같은 영문 마이크로카피를 한국어 중심의 공개 포트폴리오 톤으로 통일
  - 히어로 통계, 하단 캡션, 모바일 featured paths 요약도 `추천 관점`, `최근 변화`, `뷰 복사`, `현재 경로`처럼 더 빠르게 읽히는 문구로 정리
  - featured paths의 pulse/summary 보조 문구와 접근성용 live 메시지까지 같은 톤으로 맞춰 첫 화면 인상을 더 일관되게 조정
- 프로젝트 드로어와 상세 페이지의 섹션 카피를 한글 중심으로 정리
  - `src/widgets/project-drawer/ui/ProjectDrawer.tsx`
  - `src/views/project-detail/ui/ProjectDetailPage.tsx`
  - `src/widgets/portfolio-showcase/ui/PortfolioShowcase.tsx`
  - `src/entities/project/model/insights.ts`
  - `Overview`, `System signals`, `Footprint`, `Portfolio frame`, `Integrity Warning` 등 공개 화면에 남아 있던 영문 라벨을 포트폴리오 톤의 한글 섹션명으로 통일
  - 상태/메타 카드 라벨도 `Status`, `Owner`, `Reading lens` 대신 `상태`, `담당`, `읽는 시점`처럼 더 빠르게 읽히는 표현으로 조정
  - 드로어의 액션과 영향도 토글도 `상세 페이지`, `기본 / 의존 / 영향 / 네트워크`로 정리해 관리 패널보다 공개 포트폴리오 화면처럼 읽히게 개선
  - `Updated this week`, `shared internal system` 같은 공용 파생 문구도 `이번 주 업데이트`, `공용 내부 시스템`으로 맞춰 전체 톤을 통일
- 노드 카드와 검색 팔레트의 미세 정보 밀도를 더 절제된 톤으로 정리
  - `src/entities/project/ui/ProjectCard.tsx`
  - `src/widgets/search-palette/ui/SearchPalette.tsx`
  - 일반 노드 상단의 불필요한 `Project node` 레이블은 제거하고, 허브/공유 노드만 짧은 eyebrow를 유지해 카드가 덜 설명적으로 보이게 조정
  - 노드 설명은 2줄로 정리하고 태그가 없는 경우에는 추상 문구 대신 실제 slug를 표시해 정보 밀도를 더 실용적으로 정리
  - 검색 팔레트는 `Recent entries / Matching entries` 톤으로 맞추고, 우측 보조 정보에 순번과 slug를 함께 보여 스캔 속도를 개선
- 홈 히어로와 featured paths의 타이포 리듬을 더 전시형으로 정리
  - `src/widgets/hero-header/ui/HeroHeader.tsx`
  - `src/widgets/featured-paths/ui/FeaturedPaths.tsx`
  - 히어로 우측 lens 설명은 인셋 카드로 바꾸고 본문 카피를 더 짧고 직접적으로 다듬어 첫인상을 정리
  - 하단 캡션과 보조 라벨 문구를 정리해 소개 카드가 설명 패널보다 큐레이션 패널처럼 읽히도록 조정
  - `Featured paths` compact 데스크톱 행은 설명을 숨기고 더 얇은 리스트 리듬으로 정리해 도구 패널 느낌을 줄임
  - pulse 섹션 라벨도 단순화해 하단 보조 정보가 덜 무겁게 보이도록 조정
- 포트폴리오 모드 장면 정보의 중복을 줄이고 해설 패널 위계를 정리
  - `src/widgets/portfolio-showcase/ui/PortfolioShowcase.tsx`
  - 스크린샷이 있는 장면은 상단 캡션 오버레이를 추가해 비주얼과 제목·요약이 더 즉시 연결되게 조정
  - 스테이지 하단 요약은 2칸 반복 구조 대신 단일 설명 행으로 단순화해 장면이 덜 조각나 보이게 정리
  - 우측 패널 `Narrative` 가시성을 높이고 메타 요약은 공용 그리드 리듬에 맞춰 발표용 장면 읽기 흐름을 정돈
  - 장면 상세 CTA 톤을 다시 맞춰 `Next scene`과 `Open detail page`가 같은 화면 안에서 더 균형 있게 읽히도록 조정
- 프로젝트 드로어와 상세 페이지의 시각 언어를 더 가깝게 정리
  - `src/entities/project/ui/ProjectMetaGrid.tsx`
  - `src/widgets/project-drawer/ui/ProjectDrawer.tsx`
  - `src/views/project-detail/ui/ProjectDetailPage.tsx`
  - 드로어와 상세 페이지가 같은 메타 요약 리듬을 쓰도록 공용 `ProjectMetaGrid`를 추가
  - 상세 페이지 히어로는 좌측 포인트 라인과 `items-start` 레이아웃으로 정리해 하단 빈 공간이 생기지 않게 조정
  - 상세 페이지의 `Topology로 보기` CTA는 드로어와 같은 인디고 주 CTA 톤으로 맞춰 두 화면의 연결감을 강화
- 홈 토폴로지의 첫인상과 노드 가독성을 개선
  - `src/entities/project/ui/ProjectCard.tsx`
  - `src/widgets/topology-canvas/ui/ClusterBackgroundNode.tsx`
  - `src/widgets/topology-canvas/ui/FloatingEdge.tsx`
  - `src/widgets/topology-canvas/ui/TopologyCanvas.tsx`
  - 프로젝트 카드는 상단 메타, 더 정돈된 설명 영역, 하단 태그 풋라인을 가진 편집형 카드로 정리하고 과하지 않은 깊이감을 추가
  - 클러스터 배경은 내부 보더와 큐레이션 라벨, 서브 영역 캡슐 라벨을 넣어 영역감이 더 또렷하게 읽히도록 조정
  - 초기 뷰포트는 데스크톱 오버레이 폭을 감안해 맵 중심을 살짝 우측으로 이동시켜 첫 화면에서 핵심 노드가 더 잘 보이게 조정
  - 엣지는 둥근 끝선을 적용해 선 연결이 더 정돈돼 보이도록 마감
- 홈 첫 화면의 시각적 무게를 다시 줄여 포트폴리오 소개와 맵이 더 자연스럽게 공존하도록 조정
  - `src/widgets/search-hint/ui/SearchHint.tsx`
  - `src/widgets/hero-header/ui/HeroHeader.tsx`
  - `src/widgets/featured-paths/ui/FeaturedPaths.tsx`
  - 모바일 상단 툴바를 우측 정렬로 옮겨 브랜드 라벨과 충돌하지 않게 하고, 버튼 폭도 한 단계 눌러 첫 화면 인상을 정리
  - 데스크톱 히어로 통계 영역은 4열로 압축해 좌측 레일 높이를 줄이고, `Featured paths`는 설명을 걷어 더 얇은 큐레이션 리스트처럼 읽히게 조정
  - 모바일에서 경로를 고르면 `Featured paths`를 다시 접어 맵을 바로 볼 수 있도록 흐름 개선
- 포트폴리오 모드와 상세 페이지의 중복 정보를 줄여 읽는 흐름을 정리
  - `src/widgets/portfolio-showcase/ui/PortfolioShowcase.tsx`
  - `src/views/project-detail/ui/ProjectDetailPage.tsx`
  - 포트폴리오 모드 데스크톱 씬 레일이 현재 장면만 남는 문제를 수정해 전체 장면을 항상 볼 수 있게 조정
  - 상세 페이지 우측 보조 카드는 히어로 설명 반복 대신 `Slug / Visuals / Links / Lens` 요약으로 바꿔 정보 밀도를 정리
- 모바일 포트폴리오/상세 페이지의 첫 화면 밀도를 추가로 압축
  - `src/widgets/portfolio-showcase/ui/PortfolioShowcase.tsx`
  - `src/views/project-detail/ui/ProjectDetailPage.tsx`
  - 모바일 포트폴리오 모드는 헤더, 씬 카드, 스테이지 패딩과 최소 높이를 줄여 실제 장면이 더 빨리 보이도록 조정
  - 모바일 상세는 제목, 설명, 보조 메타 카드 높이를 눌러 `Story` 영역이 더 빨리 이어지게 정리
- 드로어와 검색 팔레트의 정보 위계를 더 전시형으로 정리
  - `src/widgets/project-drawer/ui/ProjectDrawer.tsx`
  - `src/widgets/search-palette/ui/SearchPalette.tsx`
  - 드로어 히어로에 `Updated / Reading lens` 요약을 추가하고, `System signals` 구역 안에 맵 포커스 토글을 묶어 읽는 순서를 단순화
  - 검색 팔레트는 결과 행을 `이름 + 설명 + 배지` 구조로 재정리하고 상단에 `Recent / shown count` 메타를 올려 리스트 밀도와 가독성을 개선
- 범례·지역 필터·줌 컨트롤을 한 단계 더 얇게 정리해 주변 UI 무게를 축소
  - `src/widgets/legend/ui/Legend.tsx`
  - `src/widgets/region-navigator/ui/RegionNavigator.tsx`
  - `src/widgets/canvas-controls/ui/CanvasControls.tsx`
  - `Legend` 버튼과 패널 폭을 줄이고, `Regions` 레일도 폭·패딩·타이포를 조여 캔버스보다 덜 튀게 조정
  - 데스크톱 줌 컨트롤도 한 단계 더 작게 줄여 보조 도구처럼 읽히게 정리
- 홈 공개 화면의 큐레이션 레일 위계를 재정리
  - `src/views/home/ui/HomePage.tsx`
  - `src/widgets/hero-header/ui/HeroHeader.tsx`
  - `src/widgets/featured-paths/ui/FeaturedPaths.tsx`
  - `src/widgets/region-navigator/ui/RegionNavigator.tsx`
  - `src/widgets/search-hint/ui/SearchHint.tsx`
  - 좌측 히어로를 더 짧고 전시형으로 압축하고, `Featured paths`를 보조 대시보드가 아니라 큐레이션 레일처럼 읽히도록 재구성
  - 우측 `Regions`와 상단 툴바도 간격과 밀도를 다시 맞춰 맵이 더 주인공처럼 보이도록 조정
- 드로어와 포트폴리오 해설 패널의 읽기 순서를 전시형 구조로 재정리
  - `src/widgets/project-drawer/ui/ProjectDrawer.tsx`
  - `src/widgets/portfolio-showcase/ui/PortfolioShowcase.tsx`
  - 드로어는 `Overview → Signals → Map focus` 흐름으로 재배치하고 상태 카드들을 하나의 신호 그리드로 묶어 스캔 속도를 개선
  - 포트폴리오 모드는 스테이지 하단 메타 중복을 줄이고, 우측 패널을 `Scene note + 2x2 signal grid`로 정리해 발표용 화면처럼 읽히도록 조정
- 상세 페이지 히어로를 문서형 포트폴리오 톤으로 재구성
  - `src/views/project-detail/ui/ProjectDetailPage.tsx`
  - 내용이 적은 프로젝트도 비어 보이지 않도록 히어로 내부에 `System role`, `Updated`, `Reading lens`를 배치
  - 우측 메타는 `Signals`와 `Context`로 재정리하고, `Story` 카드에도 편집 문서 대신 전시형 캡션 위계를 추가
- 모바일 상세/포트폴리오 화면 밀도 재조정
  - `src/views/project-detail/ui/ProjectDetailPage.tsx`
  - `src/widgets/portfolio-showcase/ui/PortfolioShowcase.tsx`
  - 모바일 상세 페이지에서 중복되던 우측 레일 카드를 숨겨 히어로와 스토리에 더 빠르게 집중되도록 조정
  - 모바일 포트폴리오 모드에서는 씬 리스트를 기본 접힘 상태로 바꿔 실제 장면과 해설 패널이 먼저 보이도록 정리
- 모바일 홈 하단 보조 UI 위계 정리
  - `src/widgets/legend/ui/Legend.tsx`
  - `src/widgets/project-tour/ui/ProjectTour.tsx`
  - `src/widgets/canvas-controls/ui/CanvasControls.tsx`
  - `Legend`를 모바일에서 더 가벼운 `Map` 버튼으로 줄이고, `Guide`는 좌하단 보조 액션처럼 재배치
  - 줌 컨트롤도 모바일에서 한 단계 더 얇게 조정해 하단 UI가 덜 두꺼워 보이도록 정리
- 공개 화면에서 Firestore 지연·실패 시 fallback portfolio 데이터로 즉시 전환하도록 복원력 강화
  - `src/entities/project/model/fallback.ts`
  - `src/widgets/topology-canvas/ui/TopologyCanvas.tsx`
  - `src/views/project-detail/ui/ProjectDetailPage.tsx`
  - 홈/상세가 `Loading topology` 상태에 갇히지 않고 시드 기반 프로젝트 맵을 계속 렌더
- 드로어 오픈 시 뒤쪽 오버레이 컨트롤이 보이지만 눌리지 않던 충돌 정리
  - `src/views/home/ui/HomePage.tsx`
  - `src/widgets/legend/ui/Legend.tsx`
  - `src/widgets/canvas-controls/ui/CanvasControls.tsx`
  - `src/widgets/project-tour/ui/ProjectTour.tsx`
  - 모바일에서는 `Legend / Zoom / Guide`, 데스크톱에서는 우측 `Regions`를 드로어 열림 동안 숨겨 dead control 제거
- 모바일 guided tour 카드가 드로어보다 아래에 깔려 닫기 버튼이 막히던 z-index 충돌 수정
  - `src/widgets/project-tour/ui/ProjectTour.tsx`
  - tour 패널을 드로어보다 위 레이어로 올려 `가이드 닫기 / Next`가 정상 동작
- 홈/포트폴리오/드로어 브레이크포인트를 재조정해 중간 폭 반응형 개선
  - `src/views/home/ui/HomePage.tsx`
  - `src/widgets/hero-header/ui/HeroHeader.tsx`
  - `src/widgets/featured-paths/ui/FeaturedPaths.tsx`
  - `src/widgets/search-hint/ui/SearchHint.tsx`
  - `src/widgets/project-drawer/ui/ProjectDrawer.tsx`
  - `src/widgets/portfolio-showcase/ui/PortfolioShowcase.tsx`
  - `1024px` 포트폴리오는 세로 스택, `820px` 드로어는 바텀 시트로 유지되도록 조정
- 공개 시드 및 REST 시드에서 컨설팅 프로젝트 4개 제거
  - `src/entities/project/model/seed-data.ts`
  - `scripts/seed-fixtures.mjs`
  - `scripts/seed-via-rest.mjs`
  - `docs/SEED-DATA.md`
- 기본 taxonomy에서 컨설팅 카테고리 제거
  - `src/entities/category/model/defaults.ts`
  - `scripts/seed-fixtures.mjs`
  - `scripts/seed-via-rest.mjs`
  - `docs/DESIGN-SYSTEM.md`
  - `docs/DATA-MODEL.md`

### Added

- 홈 온보딩용 `Guided tour` 추가
  - `widgets/project-tour` — 핵심 프로젝트를 순서대로 안내하는 플로팅 가이드
  - 첫 방문 시 자동 노출, 이후에는 `Guide` 버튼으로 수동 재실행 가능
  - 기존 선택/드로어 상태를 재사용해 `IAM → Reactor → Aslan Maps → Aslan Verse` 흐름 제공
- 홈 탐색용 `Featured paths` 추가
  - `widgets/featured-paths` — `Identity / Agent / Products` 관점으로 바로 진입하는 프리셋
  - 클릭 시 허브 포커스, 카테고리 필터, 선택 프로젝트를 한 번에 적용
- `Featured paths`에 active narrative 강화
  - 활성 path의 `summary`, `step` 칩, 포함 노드 수를 상단 패널에서 노출
  - path에 포함되지 않는 노드/엣지는 캔버스에서 dim 처리하고, 해당 경로 엣지는 인디고로 강조
  - 상단 step 클릭으로 path 내부 프로젝트를 바로 순회 가능
- dependency 기반 `relationship semantics` 추가
  - `IAM` 의존은 `Auth`, `Reactor` 의존은 `Agent`, 나머지는 `Dependency`로 해석
  - 캔버스 엣지에 dash 패턴을 적용하고, 범례 `Connections` 섹션에서 선 의미를 안내
  - 드로어 `Connections` 버튼에 관계 타입 배지를 함께 노출
- 홈 뷰를 URL과 동기화하는 `shareable view` 확장
  - `project`, `category`, `hub`, `featured path`, `impact mode`, `pulse`가 모두 URL에 반영
  - 좌측 `Featured paths` 레일에서 현재 view URL 복사 가능
- `impact mode` 추가
  - 드로어 `Map focus`에서 `Depends / Impact / Network`를 전환해 관련 노드만 강조
  - 선택 프로젝트의 upstream/downstream/connected closure를 기반으로 캔버스 dim 처리
- `change pulse` 추가
  - 좌측 레일에서 `7d / 30d / All activity`를 전환해 최근 수정 프로젝트만 강조
  - 드로어와 어드민 편집 폼에서 freshness signal을 함께 노출
- `completeness score`와 admin prompt 추가
  - 드로어에 completeness와 story gap 프롬프트를 노출
  - 프로젝트 편집 폼 우측에 readiness 점수와 다음 입력 권장사항을 표시
- 홈 히어로를 포트폴리오형 인트로로 재구성
  - `Aslan Maps`를 공개 포트폴리오로 읽히도록 가치 제안, 핵심 신호, 현재 렌즈를 상단에 노출
  - `Guided tour`, `Search projects` CTA를 히어로에 통합해 첫 방문자의 진입 동선을 명확히 정리
  - 좌측 `Featured paths` 레일을 히어로 높이에 맞춰 재배치해 캔버스 중심 가독성 유지
- 전체 화면 `Portfolio mode` 추가
  - `Open portfolio mode` CTA로 프로젝트를 장면 단위로 넘기는 스토리 오버레이 제공
  - 장면 전환 시 배경 토폴로지가 함께 맞춰 강조되어 발표형 포트폴리오처럼 탐색 가능
  - 각 장면에서 상세 페이지로 이동할 수 있어 맵과 문서형 소개를 자연스럽게 연결
- 홈 오버레이 레이아웃을 스택 구조로 재배치
  - 데스크톱에서는 `Hero`와 `Featured paths`를 하나의 좌측 컬럼으로 정렬해 패널 간 겹침 제거
  - 모바일만 기존 플로팅 방식으로 유지해 작은 화면에서 탐색 흐름을 보존

- **Phase 0 완료**: Next.js 16 프로젝트 초기화
  - 런타임 의존성 (Firebase, React Flow, Framer Motion, zod 등 13종)
  - 개발 의존성 (Vitest, eslint-plugin-boundaries, Prettier 등)
  - 정적 export 설정 (`output: 'export'`)
  - Firebase 환경변수 템플릿 (`.env.example`)
  - Vitest 테스트 환경 (jsdom + testing-library)
  - 문서: `CLAUDE.md`, `README.md`, `docs/` 7개 스켈레톤, `docs/rules/` 6개 규율 문서

- **Phase 1 완료**: FSD 골격 + shared 레이어
  - FSD 6개 레이어 디렉토리 (`src/app`, `views`, `widgets`, `features`, `entities`, `shared`)
  - tsconfig 경로 별칭 (`@/views/*`, `@/widgets/*` 등)
  - ESLint `eslint-plugin-boundaries` 기반 FSD import 방향 자동 검증
  - `shared/lib` 유틸리티 3종 (cn, slugify, format-date) + 16개 테스트
  - Tailwind 4 `@theme`에 Linear 디자인 토큰 (색·타이포·letter-spacing)
  - Inter Variable + JetBrains Mono 폰트 (`next/font`)
  - `shared/config/env` — zod 기반 환경변수 로더
  - `shared/api/firebase` — lazy getter 패턴 Firebase 초기화
  - `shared/ui` — Button / Card / Badge (cva 기반, Linear 토큰 사용)
  - `src/app/providers/FirebaseProvider` — 클라이언트 초기화 트리거
  - `src/views/home` — Linear 베이스 히어로 페이지
  - `app/layout.tsx` + `app/page.tsx` 배선

- **Phase 2 완료**: Entities + 어드민 인증 + Security Rules
  - `entities/project/model` — 도메인 타입, Firestore 매퍼 (7개 테스트)
  - `entities/project/api` — listProjects, getProject, upsertProject, deleteProject, subscribeProjects
  - `entities/admin/api` — `isAdmin(email)` 화이트리스트 체크
  - `features/admin-auth/model` — signInWithGoogle, signOut, useAdminAuth 훅 (loading/unauthenticated/not-allowed/authenticated 4 상태)
  - `features/admin-auth/ui` — AdminGuard 가드 컴포넌트, GoogleLoginButton
  - `views/admin-login` + `/admin` 라우트 — 로그인 상태 분기 UI
  - `firestore.rules` — projects/meta 공개 읽기·admin 쓰기, admins 화이트리스트 보호
  - `storage.rules` — screenshots/{slug}/ 공개 읽기·admin 쓰기 + 5MB 제한 + 이미지 타입 검증
  - `firebase.json`, `.firebaserc` — 프로젝트 설정 (aslan-project-map)
  - Firebase Hosting 설정 (out/ 디렉토리, cleanUrls, trailingSlash)
  - firebase-tools 개발 의존성 추가
  - **Rules 배포 완료**: `firebase deploy --only firestore:rules,storage` 성공

- **Phase 4 완료**: `/project/[slug]` 독립 상세 페이지
  - `entities/project/api/build-time-fetch.ts` — Firestore REST API 빌드 시점 fetch (인증 불필요)
  - `app/project/[slug]/page.tsx` — `generateStaticParams` + `generateMetadata` (per-project SEO)
  - `views/project-detail` — 히어로 / 태그·스택 / 스크린샷 갤러리 / 마크다운 / 링크 / Depends on·Referenced by / Timeline
  - `react-markdown` + `remark-gfm` 통합, Linear 스타일 prose
  - 드로어 하단에 "상세 페이지로 이동" 링크 추가
  - 20개 프로젝트 정적 페이지 빌드 시 자동 생성
  - **라이브 배포**: https://aslan-project-map.web.app/project/reactor/ 등

- **Phase 8 Polish 완료**: 디테일 마감
  - `widgets/legend` — 좌하단 접힘/펼침 범례 카드 (Categories, Status 섹션)
  - `widgets/topology-canvas` — Firestore 초기 구독 로딩 스피너 (loading 상태)
  - `app/layout.tsx` — SEO 메타 확장 (metadataBase, Open Graph, Twitter card, title template, theme-color `#08090a`, keywords, robots, icons)
  - `app/globals.css` — `prefers-reduced-motion` 미디어쿼리 + `::selection` 인디고 하이라이트
  - **라이브 재배포 완료**: https://aslan-project-map.web.app

- **Phase 7 완료**: Firebase Hosting 배포
  - `firebase.json` SPA rewrite 제거 (Next.js 정적 파일 라우팅과 충돌했음)
  - 정적 에셋 캐시 헤더 (JS/CSS/폰트/이미지 immutable)
  - **Live URL**: https://aslan-project-map.web.app

- **Phase 3 완료**: 공개 토폴로지 뷰 + 드로어
  - `entities/project/model/seed-data.ts` — 실제 프로젝트 16개 시드 (허브 2, 작업중 10, 예정 4)
  - `features/project-seed` — 어드민 UI에서 원클릭 주입 (멱등)
  - `features/project-node-render/ProjectNode` — Linear 스타일 커스텀 노드
    - 카테고리별 보더 (인디고 언더라인 / dashed / 좌측 라벨)
    - 허브 강조 (인디고 배경·텍스트·HUB 뱃지)
    - 상태 점, 태그 미니 표시
    - Framer Motion 진입 애니메이션 (stagger 0.035s)
    - 호버 시 인디고 보더 은은히 (scale·glow 금지 준수)
  - `widgets/topology-canvas` — React Flow 래핑, Firestore 실시간 구독, Dots 배경
  - `widgets/hero-header` — 좌상단 오버레이, 드로어 오픈 시 모바일 페이드
  - `widgets/category-filter` — 상단 pill 필터
  - `widgets/project-drawer` — 우측 슬라이드 패널
    - ESC·외부 클릭으로 닫기
    - 카테고리·상태·설명·태그·스택·링크·의존·타임라인 표시
    - 의존 프로젝트와 역방향 참조 프로젝트 네비게이션
    - 모바일 풀width, 데스크톱 max-w-md
    - URL 쿼리 `?p=slug` 동기화 (공유 가능, 뒤로가기 대응)
  - `views/home` 업데이트: 토폴로지 + 드로어 통합

## 2026-04-12

### Added

- 초기 설계 문서 ([`docs/superpowers/specs/2026-04-12-aslan-project-map-design.md`](superpowers/specs/2026-04-12-aslan-project-map-design.md))
- Phase 0+1 구현 계획 ([`docs/superpowers/plans/2026-04-12-phase-0-1-scaffold-and-fsd.md`](superpowers/plans/2026-04-12-phase-0-1-scaffold-and-fsd.md))
- Linear 디자인 시스템 레퍼런스 ([`docs/design-references/DESIGN-linear.md`](design-references/DESIGN-linear.md), VoltAgent/awesome-design-md MIT)
# Changelog

## 2026-04-17

- `knowledge subsystem v2` foundation 문서와 rules를 기준으로 첫 코드 슬라이스를 추가했다.
- `admin knowledge` 대시보드, 문서 목록, 문서 등록, query 기반 상세 라우트(`/admin/knowledge/documents/view/?id=...`)를 구현했다.
- `knowledge document/version/job` 엔티티 모델, mapper, 테스트를 추가했다.
# 2026-04-17 (later)

## 샌드박스 지식 fixture와 운영 화면 정리

- `scripts/fixtures/knowledge/sandbox/*.md`와 `pnpm seed:sandbox:knowledge`를 추가해 `sandbox-lab` 전용 문서/추출 fixture를 반복 시드할 수 있게 했다.
- `sandbox-lab` 토폴로지를 더 풍부하게 보기 위해 샌드박스 프로젝트 세트를 7개로 확장했다.
- knowledge 문서 목록에 요약 카드와 접이식 필터를 추가해 첫 화면 정보 밀도를 낮췄다.
- knowledge 문서 상세를 `개요와 버전 / 변경 비교 / 추출 결과` 3개 작업 패널로 분리해 비개발자 운영자가 한 번에 봐야 하는 양을 줄였다.
