# UI Patrol Findings

> Playwright 기반 자동 UI 순회에서 발견한 개선점을 누적 기록합니다.
>
> **컨텍스트:** admin 네임스페이스 폐기 직후 (2026-04-25). Notion/Obsidian 모델 — 자기 계정 주인이 별도 admin 화면 없이 같은 공개 surface 에서 인라인 편집을 하는 구조여야 함. 14개 view 가 도메인별 (settings, knowledge, review, diagnostics) 로 새로 재배치됨.

---

## 우선 검증 항목

1. **인라인 편집 플로우의 "관리자 화면 따로 가는 느낌" 잔재 없는지**
2. **새 URL 공간 (/knowledge, /review, /settings/*, /diagnostics/*) 의 디자인 일관성**
3. **잔여 "관리자 / Admin" 단어 (예: "Admin Insights", "관리 도구 펼치기")**
4. **로그인 직후 자연스럽게 /projects 로 떨어지는지** (별도 어드민 보드 재등장 금지)

## 진행 중인 큰 plan (참조 only — 패트롤은 직접 구현 안 함)

- [`docs/superpowers/plans/2026-04-26-local-folder-mode.md`](../docs/superpowers/plans/2026-04-26-local-folder-mode.md) — 비로그인 사용자가 자기 로컬 폴더로 바로 시작하는 Obsidian 식 모드.
  - 패트롤은 다음만 추가로 점검:
    1. 비로그인 + 폴더 미선택 상태에서 홈 `/` 가 명확히 "로컬 폴더로 시작" CTA 를 노출하는가? (Phase A.4 완료 전엔 "log only — 미구현")
    2. `/local/*` surface (Phase A.3 완료 후) 가 cloud surface 와 동일한 디자인 시스템 (heading scale, padding, eyebrow 패턴) 을 따르는가?
    3. 로컬 모드에서 cloud 전용 액션 ("AI 추출", "공개 반영") 이 disabled + 회원 가입 CTA 로 안내되는가?
  - **Phase A 본 작업은 메인 세션에서 진행** — 패트롤은 5분 사이클이라 implement 하지 않음.

## 디자인 시스템 기준

- Linear 베이스 유지
- 무채색 + 단일 인디고 (#5e6ad2) — 허브 노드 (IAM/Reactor) 제외
- 금지: 보라→핑크 그라디언트, glassmorphism, glow pulse, 움직이는 그라디언트 배경, scale hover
- 자세한 기준: [`docs/DESIGN-SYSTEM.md`](../docs/DESIGN-SYSTEM.md)

---

## 기록

### [2026-04-26 02:25] /projects/ — "Dev Admin / 플랫폼 관리자" 라벨 잔재
- **Status**: implemented
- **Category**: admin-residue
- **Page**: /projects/ (data-testid="public-account-menu" 우측 상단)
- **Viewport**: Desktop 1440x900
- **Problem**: 진안님이 명시적으로 싫어한 "관리자" 단어가 헤더에 그대로 노출. dev-bypass 사용자 displayName "Dev Admin" + role label "플랫폼 관리자" 가 한 화면에 같이 떠서 "내가 admin 화면에 들어왔다" 는 인상이 강함. Notion/Obsidian 모델에 정면 위배.
- **Fix**: account-access roleLabel "플랫폼 관리자" → "전체 권한", "공간 소유자" → "주인". docs-vault use-capabilities 동기화. dev-bypass displayName "Dev Admin" → "Dev", email "dev-admin@local" → "dev@local". 테스트 이름 동기화.
- **Files**: src/features/account-scope/model/account-access.ts, src/features/docs-vault-access/model/use-capabilities.ts, src/features/permissions/model/dev-bypass.ts, src/features/account-scope/model/account-access.test.ts
- **Reference**: Notion (사용자 = 주인이지 관리자가 아님), Linear (불필요한 시스템적 호칭 제거)
- **Commit**: 74d361e

### [2026-04-26 02:30] /project/[slug]/ — "Dependencies" 영문 eyebrow
- **Status**: implemented
- **Category**: token-consistency
- **Page**: /project/reactor/ (의존하는 프로젝트 카드)
- **Viewport**: Desktop 1440x900
- **Problem**: 다른 카드 eyebrow 는 모두 한국어 ("등록된 문서", "연결된 프로젝트") 인데 한 카드만 "Dependencies" 영문 대문자라 시각적 일관성이 깨짐. 페이지가 한국어 컨텍스트인데 라벨만 영어.
- **Fix**: eyebrow="Dependencies" → eyebrow="의존" (title "의존하는 프로젝트" 와 짝)
- **Files**: src/views/project-detail/ui/ProjectDetailPage.tsx
- **Reference**: Linear (한 화면 안의 라벨 시스템 일관성)

### [2026-04-26 02:30] /project/[slug]/ — "WORKSPACE › PROJECTS" 영문 대문자 breadcrumb
- **Status**: found — needs review
- **Category**: token-consistency
- **Page**: /project/reactor/ 좌측 상단 breadcrumb
- **Viewport**: Desktop 1440x900
- **Problem**: breadcrumb 가 "WORKSPACE › PROJECTS › 토폴로지 보기" 형태. 앞 두 단어만 영문 대문자라 한국어 페이지 안에서 튀어 보임. eyebrow 영문 대문자 패턴은 의도된 디자인 토큰일 수 있어 일괄 변경 위험 — 검토 후 한국어 변환 또는 패턴 표준화 필요.
- **Files**: src/views/project-detail/ui/ProjectDetailPage.tsx (ProjectDetailBreadcrumb 부분)
- **Reference**: Linear (스테이트먼트 라벨 일관성)

### [2026-04-26 03:25] /settings/categories/ — "관리 홈" + "Admin Taxonomy" 잔재
- **Status**: implemented
- **Category**: admin-residue
- **Page**: /settings/categories/ (모바일에서 첫 발견, 데스크톱도 동일)
- **Viewport**: Mobile 390x844
- **Problem**: 좌측 상단 back link 가 "← 관리 홈". 헤더 eyebrow 가 "Admin Taxonomy" 영문 대문자. 진안님이 명시적으로 싫어한 "관리 / Admin" 단어 두 곳에 그대로 노출.
- **Fix**: 백 링크 라벨 "관리 홈" → "프로젝트 목록", eyebrow "Admin Taxonomy" → "설정 · 카테고리". 같은 패턴이 settings-statuses, diagnostics-insights, settings-project-import 에도 있어 동일하게 정리 (한 커밋에 묶음).
- **Files**: src/views/settings-categories/ui/CategoriesPage.tsx, src/views/settings-statuses/ui/StatusesPage.tsx, src/views/diagnostics-insights/ui/InsightsPage.tsx, src/views/settings-project-import/ui/ProjectImportPage.tsx
- **Reference**: Notion (사용자 = 주인, "관리" 호칭 자체 폐기)

### [2026-04-26 10:24] /knowledge/ 태블릿 + /settings/categories/ 데스크톱 회귀 점검
- **Status**: no findings
- **Pages**: /knowledge/ (Tablet), /settings/categories/ (Desktop)
- **Result**:
  - /knowledge/: dev-bypass 사용자 라벨 "dev@local" + "전체 권한" 정상. "프로젝트 목록 ↗" 우측 상단 fix 회귀 없음.
  - /settings/categories/: "← 프로젝트 목록" + eyebrow "설정 · 카테고리" 적용 유지. Visual editor / 새 카테고리 폼 깔끔. 인디고 단일 시스템 위반 없음.
- **Action**: 변경 없음. 누적 fix 9건 모두 안정 단계.

### [2026-04-26 09:24] /diagnostics/migrate/ + /settings/api-keys/ — 점검 결과 깔끔
- **Status**: no findings
- **Pages**: /diagnostics/migrate/ (Desktop), /settings/api-keys/ (Mobile)
- **Result**: 두 페이지 모두 admin 잔재 없음. eyebrow ("진단 · 마이그레이션", "설정 · API 키")
  와 백 링크 ("프로젝트 목록") 가 이전 사이클 fix 그대로 잘 적용. /diagnostics/migrate
  의 코드 리터럴 (`workspaceProjects/general/hubs|nodes`) 는 진단 도구 특성상 적절.
  /settings/api-keys 의 안내 카드 ("URL 에 ?a=<accountId>...") 는 빈 상태 가이던스 명확.
- **Action**: 변경 없음.

### [2026-04-26 08:25] /signup/ + /review/knowledge/ — 점검 결과 깔끔
- **Status**: no findings
- **Pages**: /signup/ (Desktop), /review/knowledge/ (Tablet)
- **Result**: admin 잔재 없음. 디자인 시스템 일관성 OK (Linear 베이스, 단일 인디고).
  signup 의 form 필드 라벨 / 한국어 일관성 좋음. /review/knowledge 의 검토 단계 stepper +
  빈 상태 가이던스 명확. 이전 사이클들의 fix (eyebrow 한국어, 백 링크 정리, ⌘K 모바일
  숨김) 회귀 없음.
- **Action**: 변경 없음. 다음 사이클은 다른 미점검 surface (`/diagnostics/migrate/` 데스크톱,
  `/settings/api-keys/` 모바일, 인증 사용자의 `/projects/` 태블릿) 우선.

### [2026-04-26 07:25] /docs/ — 모바일에서 ⌘K 키보드 단축키 라벨 노출
- **Status**: implemented
- **Category**: responsive (Apple HIG — 환경별 적절한 affordance)
- **Page**: /docs/ 상단 검색 버튼
- **Viewport**: Mobile 390x844
- **Problem**: 모바일은 키보드가 없어서 ⌘K 단축키 표시가 의미 무. 데스크톱에선 유효한 hint 지만 모바일에선 시각적 노이즈.
- **Fix**: `<kbd>` 요소에 `hidden md:inline-flex` Tailwind 추가. 데스크톱부터만 보임. 검색 아이콘은 그대로 유지.
- **Files**: src/views/docs-vault/ui/DocsVaultPage.tsx
- **Reference**: Apple HIG (touch / keyboard 환경 분리), Linear (불필요한 시각 정보 제거)

### [2026-04-26 06:25] /knowledge/documents/ — 사용자 화면 에러에 "admin proxy" 영문 단어 노출
- **Status**: implemented
- **Category**: admin-residue
- **Page**: /knowledge/documents/ (로컬 개발 환경 데이터 fetch 실패 카드)
- **Viewport**: Mobile 390x844
- **Problem**: 로컬에서 dev proxy 안 떠 있을 때 노출되는 에러 카드 본문에 "admin proxy" 영문 단어 그대로 노출. dev-admin-proxy.ts 의 throw 메시지도 동일. 사용자 화면에 "admin" 단어 잔재.
- **Fix**: 사용자 노출 텍스트만 정리:
  - dev-admin-proxy.ts throw 메시지 "개발용 admin proxy에 연결할 수 없습니다" → "개발 데이터 프록시 (`pnpm dev:admin-proxy`) 가 꺼져 있어 연결할 수 없습니다"
  - KnowledgeDocumentsPage 에러 카드 본문 "admin proxy" → "데이터 프록시", 명령어 부분은 `<code>` 로 감쌈
  - 스크립트 이름 자체 (`pnpm dev:admin-proxy`) 는 package.json + scripts 파일까지 건드리는 별도 정리 작업이라 보존. 사용자 입장에선 코드 리터럴로 인지.
- **Files**: src/shared/api/dev-admin-proxy.ts, src/views/knowledge-documents/ui/KnowledgeDocumentsPage.tsx
- **Reference**: Notion (UI 카피에 시스템 내부 호칭 노출 안 함)

### [2026-04-26 05:25] / (홈) — dev-bypass 사용자가 LandingPage 로 떨어지는 버그
- **Status**: implemented
- **Category**: inline-edit (또는 routing)
- **Page**: / 홈
- **Viewport**: Mobile 390x844 에서 첫 발견
- **Problem**: dev-bypass 활성 + sessionStorage 'dev-admin-bypass'='1' 인 상태에서 /
  진입 시 LandingPage (비로그인용 "데모 둘러보기 / 내 공간 만들기" CTA + 우측 상단
  "로그인 →") 가 노출됨. 이미 로그인된 사용자한테 "로그인" 권유. 진안님이 명시적으로
  검증 우선순위 4번에 둔 "로그인 직후 자연스럽게 떨어지는지" 위반.
- **Root cause**: RootEntryPage 가 `useUserAuth()` 만 보고 분기. session-store 의
  recomputeState 가 firebase/demo/iam 세 provider 만 인지 — dev-bypass 는 별도
  provider 가 아니라 useGlobalAdmin 통해서만 보임.
- **Fix**: RootEntryPage 에 `useGlobalAdmin()` 호출 추가. unauthenticated + dev-bypass
  authenticated 면 HomePage 분기. loading 도 둘 중 하나라도 loading 이면 spinner.
- **Files**: src/views/root-entry/ui/RootEntryPage.tsx
- **Reference**: Notion (자기 자산 사용자가 자기 화면에 들어왔는데 다시 로그인 권유받으면 안 됨)

### [2026-04-26 04:24] /project/new/ — 모바일 백 링크 시각적 오인 (실제 정상)
- **Status**: no-op (false positive)
- **Category**: token-consistency
- **Page**: /project/new/
- **Viewport**: Mobile 390x844
- **Problem (의심)**: 좌측 상단 "← 프로젝트 새로만들기" 로 보였으나 snapshot 확인 결과 실제로는 "프로젝트 목록으로" → /projects/ 로 정확히 동작. 모바일 폰트 압축 + eyebrow "새 프로젝트 만들기" 가 바로 아래 위치해 시각적으로 한 줄처럼 보였을 뿐.
- **Action**: 변경 없음. 다음 사이클에서 다른 surface 우선.

### [2026-04-26 04:24] /login/ — Phase A.4 "로컬 폴더로 시작" CTA 누락
- **Status**: found — needs review (Phase A.4 까지 대기, 패트롤이 직접 구현 X)
- **Category**: inline-edit (로컬 모드 entry)
- **Page**: /login/, / (홈)
- **Viewport**: Desktop 1440x900
- **Problem**: 로그인 화면 하단에 "데모 로그인" 만 있고, plan 2026-04-26-local-folder-mode 의 "로컬 폴더로 시작" 진입점이 아직 없음. 비로그인 사용자가 자기 폴더로 바로 사용 가능한 funnel 이 없음.
- **Fix (추후 메인 세션 Phase A.4)**: 홈 `/` 와 `/login/` 하단에 "로컬 폴더로 시작" CTA 추가 (`/local/` 라우트 진입). 현재 Phase A.1 (ProjectStore 추상화) 만 완료된 상태라 라우트 자체가 없음 — Phase A.3, A.4 끝나면 패트롤이 다음 사이클에 표시 정합성 점검.
- **Reference**: Plan §7, §8

### [2026-04-26 03:42] /knowledge/ — "프로젝트 보드" 라벨 잔재
- **Status**: implemented
- **Category**: admin-residue
- **Page**: /knowledge/ (우측 상단 액션)
- **Viewport**: Desktop 1440x900
- **Problem**: /admin/dashboard 의 옛 별명 "프로젝트 보드" 가 우측 상단 링크 라벨에 그대로 남아있음. 진안님이 정면으로 비판한 그 화면 이름.
- **Fix**: "프로젝트 보드 ↗" → "프로젝트 목록 ↗"
- **Files**: src/views/knowledge-dashboard/ui/KnowledgeDashboardPage.tsx
- **Reference**: Notion (사용자 화면에서 "보드/관리" 같은 운영 호칭 자체 폐기)

### [2026-04-26 03:38] /settings/api-keys/, /diagnostics/migrate/, /docs/ — "어드민" 잔재
- **Status**: implemented
- **Category**: admin-residue
- **Page**: /settings/api-keys/ (Tablet 768 발견), /diagnostics/migrate/, /docs/
- **Viewport**: Tablet 768x1024
- **Problem**: 진안님이 가장 싫어한 "어드민" 한국어 단어가 백 링크에 그대로 박혀있음:
  - api-keys: "← 어드민 대시보드" + eyebrow "M2 · API Keys"
  - migrate: "← 어드민 대시보드" + eyebrow "P0-B · Phase 5 scaffold" (개발 마일스톤 코드 노출)
  - docs vault: "← 어드민" 백 링크 + 명령 팔레트 라벨 "어드민 대시보드로 이동"
- **Fix**: 백 링크 일괄 "프로젝트 목록" 또는 "돌아가기" 로 정리. eyebrow:
  api-keys "M2 · API Keys" → "설정 · API 키", migrate "P0-B · Phase 5 scaffold" → "진단 · 마이그레이션".
  docs-vault 명령 팔레트 id "admin-dashboard" → "projects-list", 라벨 동기화.
- **Files**: src/views/settings-api-keys/ui/ApiKeysPage.tsx, src/views/diagnostics-migrate/ui/MigratePage.tsx, src/views/docs-vault/ui/DocsVaultPage.tsx
- **Reference**: Notion (사용자 = 주인), Linear (마일스톤 코드 같은 내부 식별자는 사용자 화면에서 숨김)

