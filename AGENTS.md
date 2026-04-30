# AGENTS.md — Aslan Project Map 작업 가이드

> 이 파일은 Codex, Claude, 기타 AI 에이전트가 이 프로젝트에서 작업할 때 읽어야 하는 공통 지침서다. 작업 시작 전 반드시 훑어볼 것.

## 1. 현재 상태

**Aslan Project Map**은 이미 **Next.js 16 + App Router + 정적 export** 기반으로 운영 중인 공개 프로젝트 포트폴리오다.

즉:

- 이 프로젝트는 **이미 Next.js 전환이 끝난 상태**다.
- 앞으로의 기준은 "Next.js로 옮긴다"가 아니라
- **현재 Next.js 아키텍처를 기준으로 유지·확장한다**이다.

### 코드 기준의 사실 관계

아래 3개가 프레임워크 현실의 1차 진실원이다.

- [`package.json`](package.json)
- [`next.config.ts`](next.config.ts)
- [`app/layout.tsx`](app/layout.tsx)

문서와 코드가 충돌하면, 먼저 코드를 확인하고 그 다음 문서를 고친다.

## 2. 현재 제품의 중심

- 공개 홈 `/` — 프로젝트 토폴로지
- 공개 목록 `/projects` — 프로젝트 목록 (권한 시 "새 프로젝트" 인라인 액션)
- 공개 상세 `/project/[slug]` — 프로젝트 상세 (권한 시 인라인 편집)
- 운영 라우트 — 기능별로 분리: `/knowledge/*` (문서), `/review` (검토 큐), `/ontology` (승인된 ontology 트리, T-6), `/settings/*` (시스템 설정), `/diagnostics/*` (운영 도구)

> **`/admin/*` 네임스페이스 폐기 — 코드 이행 완료 (2026-04-30).** `app/admin/` 디렉토리는 더 이상 존재하지 않고, 모든 URL 은 `/settings/*` · `/review/*` · `/diagnostics/*` · `/knowledge/*` · `/login` 으로 이전됐다. 권한 훅도 `useAdminAuth → usePermissions` 로 리네임 완료. 새 라우트는 절대 `/admin/*` 패턴으로 추가하지 말 것. 이행 계획 (Phase 10 문서 정합 잔존): [`docs/superpowers/plans/2026-04-25-admin-namespace-removal.md`](docs/superpowers/plans/2026-04-25-admin-namespace-removal.md).

### 현재 설계 검토 중인 추가 축

- `knowledge subsystem v2`
- 경로: `/knowledge/*` (운영 surface), `/review/knowledge` (검토 큐)
- 목적: 문서 기반 지식 추출/검수/승인
- 원칙: 공개 surface와 데이터 경계는 분리하되, URL 네임스페이스는 더 이상 admin/non-admin로 가르지 않는다. 권한은 Firestore rules가 1차 게이트.

## 3. 우선 문서

### 현재 공개 제품 기준

- [`docs/superpowers/specs/2026-04-12-aslan-project-map-design.md`](docs/superpowers/specs/2026-04-12-aslan-project-map-design.md)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md)
- [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md)
- [`docs/OPERATIONS-GUIDE.md`](docs/OPERATIONS-GUIDE.md)
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- [`docs/superpowers/plans/2026-04-25-admin-namespace-removal.md`](docs/superpowers/plans/2026-04-25-admin-namespace-removal.md) (진행 중인 라우트 이행)

### 현재 knowledge 방향 기준

- [`docs/superpowers/specs/2026-04-17-document-knowledge-subsystem-v2.md`](docs/superpowers/specs/2026-04-17-document-knowledge-subsystem-v2.md)
- [`docs/superpowers/specs/2026-04-17-knowledge-backend-contract-v1.md`](docs/superpowers/specs/2026-04-17-knowledge-backend-contract-v1.md)
- [`docs/superpowers/plans/2026-04-17-phase-2a-knowledge-subsystem-foundation-v2.md`](docs/superpowers/plans/2026-04-17-phase-2a-knowledge-subsystem-foundation-v2.md)

### 온톨로지 v0 (`feature/ontology-design` 브랜치, C-1 phase)

- [`docs/superpowers/specs/2026-04-27-ontology-design-loop.md`](docs/superpowers/specs/2026-04-27-ontology-design-loop.md)
  - 자율 기획-구현 루프의 살아 있는 설계 문서. options→decision→tasks→dev 모두 종결.
  - 옵션 C (단계적 흡수) 채택. C-1 phase deliverable T-1~T-10 + T-12·T-13 모두 ✅.
- [`docs/superpowers/specs/2026-04-27-ontology-frontmatter-contract.md`](docs/superpowers/specs/2026-04-27-ontology-frontmatter-contract.md)
  - md frontmatter v1 계약 — 처리 등급 A/B/C + JSON Schema.
- [`docs/superpowers/specs/2026-04-27-ontology-id-resolution.md`](docs/superpowers/specs/2026-04-27-ontology-id-resolution.md)
  - canonical node ID + stub placeholder + 다국어 정책.
- [`docs/superpowers/notes/2026-04-27-ontology-c1-runbook.md`](docs/superpowers/notes/2026-04-27-ontology-c1-runbook.md)
  - 측정 절차서 (Anthropic secret 등록부터 정확도/단가/검수시간 집계까지).
- 다음 단계: 진안의 한국어 spec 10 개로 T-11 측정 → §3.3 cutover 임계값 평가.

### 보류 / 흡수된 문서

- [`docs/superpowers/specs/2026-04-17-ontology-driven-project-map.md`](docs/superpowers/specs/2026-04-17-ontology-driven-project-map.md)
  - 1008 줄 보류 초안. 데이터 substrate (knowledgeApprovedNodes/Edges 등) 는 v2 foundation 으로 흡수 됐고, 본 ontology 루프 (2026-04-27) 가 받아갈/버릴/수정할 11 항목을 결정해 v0 구현 완성.

## 4. 문서 상태 주의

현재 문서 집합은 아래 수준까지 맞춰져 있다.

- `README.md`는 현재 제품의 넓은 공개 기능 범위를 설명한다.
- `DATA-MODEL.md`, `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `OPERATIONS-GUIDE.md`는 knowledge subsystem v2 foundation 기준까지 반영됐다.
- `ARCHITECTURE.md`는 새 URL 공간(`/settings`, `/review`, `/diagnostics`, `/knowledge`) 기준으로 갱신됨. 다만 코드는 아직 `/admin/*`에 머물러 있는 라우트가 다수.
- `knowledge subsystem v2`는 **설계 방향**이지, 아직 구현된 현실이 아니다.
- `/admin/*` 폐기는 **계획 확정**이지만, **코드 이행은 단계적으로 진행 중**이다. 새 코드는 새 URL로, 구 라우트는 redirect 또는 삭제 단계.

따라서 에이전트는 아래를 혼동하면 안 된다.

- v2 문서가 있다고 해서 knowledge 컬렉션/라우트가 이미 존재한다고 가정하면 안 된다.
- `DATA-MODEL.md`와 rules에 없는 컬렉션을 코드에서 먼저 쓰면 안 된다.
- 설계 문서만 보고 현재 런타임이 이미 바뀌었다고 생각하면 안 된다.

## 5. 기술 기준

- **Framework**: Next.js 16
- **Router**: App Router
- **Config**: `next.config.ts`
- **Build mode**: `output: 'export'`
- **Language**: TypeScript 5
- **Style**: Tailwind CSS 4
- **Visualization**: Sigma.js(WebGL) + Graphology + ForceAtlas2 + d3-force + Framer Motion
- **Backend**: Firebase (Firestore / Storage / Auth / Hosting)
- **State**: Firestore `onSnapshot` + React local state / URL state
- **Test**: Vitest + Testing Library + Playwright
- **Lint**: ESLint 9 flat config + `eslint-plugin-boundaries`
- **Package Manager**: pnpm

## 6. Next.js 작업 원칙

### 1. 이미 Next.js다

- "Next.js로 전환" 요청이 와도 새 migration으로 이해하지 말 것.
- 먼저 현재 Next.js 구조를 유지하면서 해결 가능한지 본다.

### 2. App Router를 유지한다

- `pages/` 라우터 도입 금지
- 라우트는 `app/` 아래에만 둔다
- 라우팅 계약 변경 시 `README`, `ARCHITECTURE`, 관련 스펙 문서를 같이 갱신한다

### 3. 정적 export 제약을 존중한다

- 서버 런타임 전제를 깔지 않는다
- build-time / client-side / Firebase direct-read 구조를 우선 고려한다
- 별도 worker나 운영 서브시스템이 필요하면 **메인 공개 앱과 분리된 boundary**로 설계한다

### 4. 공개 surface와 운영 surface는 데이터 경계로 가른다 (URL 네임스페이스가 아니라)

- 공개 홈 `/`의 프로젝트 토폴로지를 쉽게 무겁게 만들지 않는다
- knowledge 기능은 `/knowledge/*`(본인/멤버)와 `knowledgePublic*`(공개)으로 데이터 경계가 갈린다. URL 네임스페이스가 분리 수단이 아니다 — 같은 URL에서 권한 따라 인라인 액션이 노출되는 게 기본이다.
- "운영자 / 관리자"라는 별도 역할은 없다 (Notion / Obsidian 모델). 자기 계정의 주인이 자기 자산을 직접 다룬다.
- 공개 페이지는 raw 문서, review 상태, extraction 후보를 읽지 않는다 (Firestore rules로 강제)
- `/admin/*` 패턴으로 새 라우트를 만들지 않는다

## 7. 현재 알려진 구조 부채

아래는 이미 존재하는 구조 부채다. 새 작업에서 더 악화시키지 말 것.

### URL 계약 부채

현재 공개 링크 계약은 하나로 정리되지 않았다.

- `/?p=slug`
- `/project/view/?slug=...`
- `/project/[slug]`

새로운 detail route나 knowledge public route를 만들기 전에 먼저 이 계약이 늘어나는지 확인해야 한다. `/admin/*` 폐기 작업 (Phase 2~9)이 이 부채의 일부를 동시에 해소한다 — 새 라우트는 늘리되 동등한 구 라우트가 모두 redirect 후 삭제되는지 확인할 것.

### 공개/비공개 데이터 경계

knowledge subsystem의 경계는 문서상 확정됐다.

- `knowledgeApprovedNodes`, `knowledgeApprovedEdges`: private canonical graph
- `knowledgePublicNodes`, `knowledgePublicEdges`: public projection
- raw markdown: Storage `knowledge-documents/`

다만 이건 foundation 계약이지, 런타임 기능이 이미 존재한다는 뜻은 아니다.

### 설계와 구현의 시차

v2 설계는 foundation 문서까지는 반영됐지만, 실제 라우트/엔티티/worker는 아직 구현되지 않았다. 문서 정합성과 런타임 현실을 혼동하면 안 된다.

## 8. Knowledge subsystem 착수 조건

아래가 닫히기 전에는 knowledge 구현을 본격 진행하지 않는다.

1. public/private collection 경계 유지
2. private approved graph canonical store 유지
3. trusted worker/publish backend는 Cloud Functions for Firebase (2nd gen) 기준 유지
4. raw markdown는 Storage `knowledge-documents/` 계약 유지
5. document metadata canonical rule 유지

### 최소 슬라이스 원칙

knowledge는 처음부터 풀 플랫폼으로 가지 않는다.

가장 작은 유효 슬라이스는 아래다.

- 문서 등록
- version 저장
- extraction job 생성
- job 상태 확인
- approved graph 저장

review queue, graph inspector, publish executor, 공개 연동은 초기 범위에서 제외한다.

## 9. FSD + 실제 구조

```text
app/                 ← Next.js 라우팅 전용
src/
  app/               ← providers, app bootstrap
  views/             ← 페이지 컴포넌트
  widgets/           ← 복합 UI
  features/          ← 사용자 인터랙션
  entities/          ← 도메인 모델
  shared/            ← 재사용 기반
```

**Import 방향:** `app → views → widgets → features → entities → shared`

### 실제 진입점 Quick Map

- 홈 공개 화면: `src/views/home/`
- 토폴로지 지도: `src/widgets/topology-map-sigma/`
- 카테고리 reflow 유틸: `src/features/topology-layout/`
- 프로젝트 엔티티: `src/entities/project/`
- 프로젝트 상세: `src/views/project-detail/` (인라인 편집 흡수 진행 중)
- 프로젝트 편집기: `src/views/project-editor/` (admin-project-editor 에서 리네임 완료)
- 앱 providers: `src/app/providers/`
- Firebase 초기화: `src/shared/api/firebase.ts`
- 환경변수 로더: `src/shared/config/env.ts`
- 권한 훅: `src/features/permissions/` (admin-auth 에서 리네임 완료)

## 10. 작업 원칙

1. **문서가 생명선**
   - 구조, 라우트, 스키마, 운영 모델이 바뀌면 문서부터 갱신
2. **기존 제품의 중심을 함부로 바꾸지 말 것**
   - 공개 제품을 내부 운영 툴로 바꾸는 방향은 경계
3. **source of truth는 하나만 둔다**
   - 동일 개념을 두 컬렉션/두 화면/두 입력 경로에서 동시에 진실원으로 두지 않는다
4. **공개/비공개 경계를 먼저 정한다**
   - Firestore에 컬렉션을 추가하기 전 읽기 권한 모델부터 문서화
5. **Next.js 계약을 깨는 변경은 명시적으로 다룬다**
   - URL, metadata, static params, build behavior 변화는 설계 문서에 기록
6. **작업 단위마다 커밋**
7. **커밋 메시지 — 영문 conventional prefix + 한글 본문**
   - 형식: `feat:` / `fix:` / `docs:` / `refactor:` / `chore:` / `test:` / `style:` 중 하나 + 한글 설명
   - 예: `feat: 프로젝트 노드 hover 상태 추가`, `docs: 온톨로지 정의 §1.1 채움`, `refactor: 검색 팔레트 모바일 시트로 분리`
   - **한글 prefix (`정리`, `구조`, `루프` 등) 금지** — 1차로 한글 설명에 의도가 충분히 들어가야 함
8. **TDD 우선**
   - `shared/lib`, `entities/*/model` 순수 로직부터 테스트
9. **문서가 구현보다 앞선다**
   - 특히 스키마/라우트/운영 모델 변경은 docs-first

## 11. 핵심 결정

- 디자인은 Linear 베이스 유지
- 금지:
  - 보라→핑크 그라디언트
  - glassmorphism
  - glow pulse
  - 움직이는 그라디언트 배경
  - scale hover
  - 둘 이상의 채색 시스템
- 색은 무채색 + 단일 인디고(`#5e6ad2`)
- 허브 노드(IAM/Reactor)만 유일한 채색
- 신호 톤(예외, 사용 최소화):
  - 경고 — amber `rgba(255,179,71,*)` (stub / dedup / 미해결 reference). 단일 진실원: `src/shared/lib/ontology-tree/tones.ts` `UNKNOWN_TONE`
  - 에러 — red `rgba(229,72,77,*)` (실패한 액션 / 데이터 손상)
  - 인디고 정책과 별개. UI 신호로만 쓰고 장식엔 금지
- 배포는 Firebase Hosting 정적 export

## 12. 커맨드

```bash
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm test:run
pnpm exec tsc --noEmit
```

## 13. AGENTS / CLAUDE 동기화 규칙

- `AGENTS.md`와 `CLAUDE.md`는 같은 작업 기준을 공유한다.
- 둘 중 하나를 바꾸면 다른 파일도 같은 내용으로 맞춘다.
