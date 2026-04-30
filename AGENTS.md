# AGENTS.md — oh-my-ontology

> Canonical contributor guide for AI agents (Claude Code, Cursor, Copilot, Codex, Aider, …) and humans alike. Read once before touching the codebase.

## Project overview

`oh-my-ontology` 는 markdown 문서에서 지식 그래프를 자동으로 키우는 오픈소스 온톨로지 워크벤치다. 사용자가 글을 쓰면 시스템이 개념·관계·근거를 추출해 검수·승인하면 토폴로지·트리·ERD 세 가지 view 로 자라난다.

자세한 소개와 모티베이션: `README.md`.

핵심 원칙 한 줄:

> **토폴로지는 출구 중 하나, 진짜 척추는 md 문서 → 온톨로지.**

## Quick start

```bash
pnpm install
cp .env.example .env.local        # Firebase 사용 시 값 채움 (optional)
pnpm dev                          # http://localhost:3000

pnpm test:run                     # vitest 137 files / 958 tests
pnpm exec tsc --noEmit
pnpm lint
pnpm build                        # 정적 export → out/
```

## Tech stack

- **Framework** Next.js 16 · App Router · `output: 'export'`
- **Language** TypeScript 5
- **Style** Tailwind CSS 4 (`@theme` CSS-based tokens)
- **Visualization** Sigma.js (WebGL) · Graphology · ForceAtlas2 · d3-force · xyflow · Framer Motion
- **Backend** Firebase (Firestore · Storage · Auth · Hosting · Functions 2nd gen) — 옵션. 로컬 폴더 모드만 써도 동작
- **State** Firestore `onSnapshot` 실시간 구독 + React local state · URL state
- **Architecture** Feature-Sliced Design (ESLint boundaries 로 import 방향 강제)
- **Test** Vitest + Testing Library + jsdom · Playwright (E2E)
- **Lint** ESLint 9 flat config
- **Package** pnpm

## Folder map

```
app/                       Next.js 라우팅 (얇은 래퍼)
src/                       FSD 레이어
  ├── app/                 providers · 초기화
  ├── views/               페이지 컴포넌트
  ├── widgets/             복합 UI
  ├── features/            인터랙션 단위
  ├── entities/            비즈니스 엔티티
  └── shared/              UI · lib · config · api 재사용 기반
docs/                      장기 문서 (architecture / data-model / design / deployment)
functions/                 Cloud Functions (2nd gen)
tests/                     Vitest 단위 + Playwright E2E
scripts/                   시드 / 배포 / 검증 보조
.claude/rules/             세부 작업 규율 (자동 로드)
```

**Import 방향**: `app → views → widgets → features → entities → shared`. 역방향 import 는 ESLint 가 막는다.

## Routes

```
/                          토폴로지 view (전체 그래프)
/projects                  프로젝트 목록
/project/[slug]            프로젝트 상세 (권한 시 인라인 편집)
/knowledge · /knowledge/*  문서 등록 / 분석 / 목록
/review/knowledge          검수 큐
/ontology                  승인된 트리 view
/ontology/edit             ERD 캔버스 편집기
/ontology/insights         그래프 인사이트
/ontology/relations        관계 분포
/settings/*                카테고리 / 상태 / API 키 / 임포트
/diagnostics/*             운영 인사이트
/login · /signup · /reset-password · /account   인증 surface (옵션)
```

## Working principles

세부 룰은 `.claude/rules/*.md` 에 분리해두었고 Claude Code 는 자동으로 로드한다. 다른 도구는 아래를 참조해 같은 룰을 인용한다.

- **Architecture · FSD 경계** — `@.claude/rules/architecture.md`
- **Design system** — 무채색 + 단일 인디고, 금지 패턴 — `@.claude/rules/design.md` · `@docs/DESIGN-SYSTEM.md`
- **Git workflow** — conventional prefix + 한국어 본문 — `@.claude/rules/git.md`
- **Testing & verification** — TDD-first, 단위 → e2e — `@.claude/rules/testing.md`
- **Local-first / offline-first** — Notion 처럼 폴더만 선택해도 사용 가능 — `@.claude/rules/local-first.md`
- **Authentication** — Firebase Auth (email/password + Google) 만 — `@.claude/rules/auth.md`
- **금지 패턴 / Do-Not list** — `@.claude/rules/forbidden.md`

## Source-of-truth files

문서와 코드가 충돌하면 코드가 먼저다. 프레임워크·빌드·라우팅 사실 관계는 다음 3 개로:

- `package.json`
- `next.config.ts`
- `app/layout.tsx`

장기 문서:

- `@docs/ARCHITECTURE.md`
- `@docs/DATA-MODEL.md`
- `@docs/DESIGN-SYSTEM.md`
- `@docs/DEPLOYMENT.md`

## CLAUDE.md / AGENTS.md 동기화

- **AGENTS.md** (이 파일) 가 canonical. 모든 AI 코딩 도구가 읽는 cross-tool 표준.
- **CLAUDE.md** 는 AGENTS.md 를 import 하고 Claude Code 전용 추가만 명시 (skills, hooks).
- 한쪽을 바꾸면 다른 쪽 동기화 — 또는 CLAUDE.md 의 `@AGENTS.md` import 만 유지하면 자동 일관.
