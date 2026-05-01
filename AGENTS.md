# AGENTS.md — oh-my-ontology

> Canonical contributor guide for AI agents (Claude Code, Cursor, Copilot, Codex, Aider, …) and humans alike. Read once before touching the codebase.

## Project overview

`oh-my-ontology` 는 **사람과 AI agent 가 같이 저작하는 codebase ontology workbench** 다 (mission v2 — 2026-05-01). vault 의 `.md` frontmatter 가 *그대로* 노드와 관계 — frontmatter 자체가 자기-승인이라 별도 검수 단계 없음. 사람은 빌더 캔버스 또는 직접 `.md` 편집으로, AI agent (Claude Code 등) 는 `mcp/` MCP 서버로 같은 graph 를 read/write.

자세한 방향: `docs/PRODUCT-DIRECTION.md`. 사용자 가시 기능 전수: `docs/FEATURES.md`.

핵심 원칙 한 줄:

> **md frontmatter 가 곧 그래프. 사람도 AI agent 도 같은 vault 에 쓴다.**

## Quick start

```bash
pnpm install
pnpm dev                          # http://localhost:3000 — 로그인 0, vault 폴더 선택만으로 즉시 동작

# Firebase 사용 시 (옵션 — cloud sync 필요할 때만)
cp .env.example .env.local

# 검증
pnpm test:run                     # vitest 117 files / 843 tests
pnpm exec tsc --noEmit
pnpm lint
pnpm build                        # 정적 export → out/

# AI agent (Claude Code) 등록 — .mcp.json.example 복사 + 가이드: mcp/README.md
```

## Tech stack

- **Framework** Next.js 16 · App Router · `output: 'export'`
- **Language** TypeScript 5
- **Style** Tailwind CSS 4 (`@theme` CSS-based tokens)
- **Visualization** Sigma.js (WebGL) · Graphology · ForceAtlas2 · xyflow
- **Local-first** File System Access API + IndexedDB (vault handle 영속)
- **AI agent** `@modelcontextprotocol/sdk` (stdin/stdout JSON-RPC server, `mcp/` 패키지)
- **Backend** Firebase (Firestore · Storage · Auth · Hosting) — **옵션**. local-first 가 default
- **State** Firestore `onSnapshot` (cloud) 또는 in-memory + IndexedDB (local) · React local state · URL state
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
mcp/                       MCP 서버 (AI agent partner surface)
docs/                      장기 문서 (architecture / data-model / design / deployment)
docs/ontology/             이 프로젝트 자기 ontology vault (dogfood, 23 노드)
tests/                     Vitest 단위 + Playwright E2E
scripts/                   시드 / 배포 / 검증 보조
.claude/rules/             세부 작업 규율 (자동 로드)
```

**Import 방향**: `app → views → widgets → features → entities → shared`. 역방향 import 는 ESLint 가 막는다.

## Routes

```
/                          ontology 트리 hub (vault 활성 시 자동 vault 데이터)
/topology                  토폴로지 view (Sigma WebGL)
/projects                  프로젝트 목록 (mode-aware)
/project/[slug]            프로젝트 상세 (권한 시 인라인 편집)
/docs                      vault picker / vault 활성 시 문서 surface
/knowledge · /knowledge/*  cloud 모드 문서 등록 / 목록
/ontology/edit             ERD 캔버스 빌더 (xyflow + .md 내보내기)
/ontology/insights         그래프 인사이트
/ontology/relations        관계 분포
/settings/*                카테고리 / 상태 / 가져오기
/diagnostics/insights      운영 인사이트
/login · /signup · /reset-password · /account   Firebase Auth surface (옵션)
```

> mission v2 정렬: `/review/knowledge` 검수 큐 라우트 + `/admin/*` 네임스페이스는 폐기됨 (vault frontmatter 가 자기-승인). cloud LLM 추출 흐름 (`enqueueExtractionJob` 등) 도 entity layer 에서 제거됐고, `functions/` 폴더 자체도 폐기됨 (firebase 배포 안 함) — 자세히 `docs/MISSION-CLEANUP-CANDIDATES.md`.

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

장기 문서 (mission v2 우선):

- `@docs/PRODUCT-DIRECTION.md` — mission v2 방향
- `@docs/FEATURES.md` — 사용자가 *지금* 사용 가능한 기능 전수
- `@docs/MISSION-CLEANUP-CANDIDATES.md` — mission 정렬 cleanup 진행 (4 stage 완료)
- `@docs/ONTOLOGY-MODEL-V2-DRAFT.md` — V1.x → V2 ontology 모델 진화 spec
- `@docs/MODE-AWARE-CRUD.md` — local/cloud/static 분기 contributor 가이드
- `@docs/ARCHITECTURE.md` · `@docs/DATA-MODEL.md` · `@docs/DESIGN-SYSTEM.md` · `@docs/DEPLOYMENT.md`
- `@docs/CHANGELOG.md` — 사용자 가시 변화 시간순
- `@mcp/README.md` — AI agent partner (MCP 7 도구) 등록 + 사용

## 이 프로젝트의 ontology

이 프로젝트 자신의 mental model 은 `docs/ontology/` 에 frontmatter md 로 표현되어 있다 (dogfooding — 우리 데이터 형식으로 우리 자신을 기술).

- 진입점: `docs/ontology/README.md` · `docs/ontology/project.md`
- 도메인 8 + capability 5 + element 4 + project 1 = 약 19 노드
- AI agent 는 `mcp/` MCP 서버로 query 가능 — 등록 가이드 `mcp/README.md` · 예시 `.mcp.json.example`
- 새 도메인/capability/element 가 생기면 같은 디렉토리에 추가 (`add_concept` 도구로 또는 직접 작성)

## CLAUDE.md / AGENTS.md 동기화

- **AGENTS.md** (이 파일) 가 canonical. 모든 AI 코딩 도구가 읽는 cross-tool 표준.
- **CLAUDE.md** 는 AGENTS.md 를 import 하고 Claude Code 전용 추가만 명시 (skills, hooks).
- 한쪽을 바꾸면 다른 쪽 동기화 — 또는 CLAUDE.md 의 `@AGENTS.md` import 만 유지하면 자동 일관.
