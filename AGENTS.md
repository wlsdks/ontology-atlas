# AGENTS.md — oh-my-ontology

> Canonical contributor guide for AI agents (Claude Code, Cursor, Copilot, Codex, Aider, …) and humans alike. Read once before touching the codebase.
>
> 한국어 안내는 아래 [한국어 가이드](#한국어-가이드) 섹션 참조.

## Project overview

`oh-my-ontology` is **a codebase ontology workbench that humans and AI agents author together** (mission v2 — 2026-05-01). The `.md` frontmatter inside the vault *is* the nodes and edges — frontmatter is self-approving, so there is no separate review step. Humans edit through the builder canvas or directly in `.md` files; AI agents (Claude Code, …) read/write the same graph through the `mcp/` MCP server.

For direction, see `docs/PRODUCT-DIRECTION.md`. For a full list of user-visible features, see `docs/FEATURES.md`.

The single guiding principle:

> **Markdown frontmatter is the graph. Humans and AI agents write to the same vault.**

## Quick start

```bash
pnpm install
pnpm dev                          # http://localhost:3000 — no login required; pick a vault folder and you're in

# Firebase (optional — only when you want cloud sync)
cp .env.example .env.local

# Verify
pnpm test:run                     # vitest 100 files / 721 tests
pnpm exec tsc --noEmit
pnpm lint
pnpm build                        # static export → out/

# Register an AI agent (Claude Code) — copy .mcp.json.example, follow mcp/README.md
```

## Tech stack

- **Framework** Next.js 16 · App Router · `output: 'export'`
- **Language** TypeScript 5
- **Style** Tailwind CSS 4 (`@theme` CSS-based tokens)
- **Visualization** Sigma.js (WebGL) · Graphology · ForceAtlas2 · xyflow
- **Local-first** File System Access API + IndexedDB (vault handle persistence)
- **AI agent** `@modelcontextprotocol/sdk` (stdin/stdout JSON-RPC server, `mcp/` package)
- **Backend** Firebase (Firestore · Storage · Auth · Hosting) — **optional**. Local-first is the default.
- **State** Firestore `onSnapshot` (cloud) or in-memory + IndexedDB (local) · React local state · URL state
- **Architecture** Feature-Sliced Design (ESLint boundaries enforce the import direction)
- **Test** Vitest + Testing Library + jsdom · Playwright (E2E)
- **Lint** ESLint 9 flat config
- **Package** pnpm

## Folder map

```
app/                       Next.js routes (thin wrappers)
src/                       FSD layers
  ├── app/                 providers · initialization
  ├── views/               page-level components
  ├── widgets/             composite UI
  ├── features/            interaction units
  ├── entities/            business entities
  └── shared/              UI · lib · config · api primitives
mcp/                       MCP server (the AI agent's surface)
docs/                      long-form docs (architecture / data-model / design / deployment)
docs/ontology/             this project's own ontology vault (dogfood, ~23 nodes)
tests/                     Vitest unit + Playwright E2E
scripts/                   seed / deploy / verification helpers
.claude/rules/             granular working rules (auto-loaded)
```

**Import direction**: `app → views → widgets → features → entities → shared`. ESLint blocks the reverse.

## Routes

```
/                          ontology tree hub (auto-uses vault data when active)
/topology                  topology view (Sigma WebGL)
/projects                  project list (mode-aware)
/project/[slug]            project detail (inline edit when permitted)
/docs                      vault picker / document surface when vault is active
/ontology/edit             ERD canvas builder (xyflow + .md export)
/ontology/insights         graph insights
/ontology/relations        relation distribution
/settings/*                categories / status / import
/diagnostics/insights      operations insights
/login · /signup · /reset-password · /account   Firebase Auth surface (optional)
```

> mission v2 alignment: the `/review/knowledge` review queue, the entire `/knowledge/*` document subsystem (page + entities `KnowledgeDocument`/`KnowledgeDocumentVersion`), the `/admin/*` namespace, the `/diagnostics/*` namespace, and the TBox surfaces (`/settings/ontology[/history]`) have all been removed (vault frontmatter is self-approving). The cloud LLM extraction flow (`enqueueExtractionJob`, …) was removed from the entity layer, and the `functions/` folder itself was removed (we no longer deploy Firebase Functions). Details: `docs/MISSION-CLEANUP-CANDIDATES.md`.

## Working principles

The detailed rules live in `.claude/rules/*.md` and Claude Code auto-loads them. Other tools should reference the same rules from there.

- **Architecture · FSD boundaries** — `@.claude/rules/architecture.md`
- **Design system** — neutrals + a single indigo, forbidden patterns — `@.claude/rules/design.md` · `@docs/DESIGN-SYSTEM.md`
- **Git workflow** — conventional prefix + Korean (or English) body — `@.claude/rules/git.md`
- **Testing & verification** — TDD-first, unit → e2e — `@.claude/rules/testing.md`
- **Local-first / offline-first** — Notion-style: pick a folder and use it — `@.claude/rules/local-first.md`
- **Authentication** — Firebase Auth (email/password + Google) only — `@.claude/rules/auth.md`
- **Forbidden patterns / Do-Not list** — `@.claude/rules/forbidden.md`

## 🚫 npm publish guard

`npm publish` / `pnpm publish` / `yarn publish` is **never** run automatically. A PreToolUse hook in `.claude/settings.json` blocks it; the rules in `CLAUDE.md` and `.claude/rules/forbidden.md` document why. Only execute publish commands when the user explicitly asks ("publish it", "ship it to npm"). Even then, run `npm pack --dry-run` first to audit the tarball.

## Source-of-truth files

When docs and code disagree, the code wins. For framework / build / routing facts, trust these three:

- `package.json`
- `next.config.ts`
- `app/layout.tsx`

Long-form docs (mission v2 priority):

- `@docs/PRODUCT-DIRECTION.md` — mission v2 direction
- `@docs/FEATURES.md` — features users can use *right now*
- `@docs/MISSION-CLEANUP-CANDIDATES.md` — mission alignment cleanup progress (4 stages complete)
- `@docs/ONTOLOGY-MODEL-V2-DRAFT.md` — V1.x → V2 ontology model evolution spec
- `@docs/MODE-AWARE-CRUD.md` — local/cloud/static contributor guide
- `@docs/ARCHITECTURE.md` · `@docs/DATA-MODEL.md` · `@docs/DESIGN-SYSTEM.md` · `@docs/DEPLOYMENT.md`
- `@docs/CHANGELOG.md` — chronological user-visible changes
- `@mcp/README.md` — AI agent partner (MCP 12 tools — read 8 + write 4) registration + usage
- `@docs/archive/README.md` — archived analysis docs (no longer the source of truth for current rules)

## This project's own ontology

This project describes its own mental model in `docs/ontology/` as frontmatter markdown (dogfooding — we describe ourselves in our own data format).

- Entry points: `docs/ontology/README.md` · `docs/ontology/project.md`
- 8 domains + 9 capabilities + 4 elements + 1 project + 1 vault-readme ≈ 23 nodes
- AI agents query it via the `mcp/` MCP server — registration guide in `mcp/README.md`, example in `.mcp.json.example`
- When you discover a new domain / capability / element, add it to the same directory (with the `add_concept` tool, or by hand)

## CLAUDE.md / AGENTS.md sync

- **AGENTS.md** (this file) is canonical — the cross-tool standard read by every AI coding tool.
- **CLAUDE.md** imports AGENTS.md and only adds Claude-Code-specific bits (skills, hooks).
- When you change one, sync the other — or just keep CLAUDE.md's `@AGENTS.md` import and they stay consistent automatically.

---

## 한국어 가이드

> AI agent (Claude Code, Cursor, Copilot, Codex, Aider 등) 와 사람 모두를 위한 contributor guide. 코드 만지기 전에 한 번 읽고 시작.

### 프로젝트 개요

`oh-my-ontology` 는 **사람과 AI agent 가 같이 저작하는 codebase ontology workbench** 다 (mission v2 — 2026-05-01). vault 의 `.md` frontmatter 가 *그대로* 노드와 관계 — frontmatter 자체가 자기-승인이라 별도 검수 단계 없음. 사람은 빌더 캔버스 또는 직접 `.md` 편집으로, AI agent (Claude Code 등) 는 `mcp/` MCP 서버로 같은 graph 를 read/write.

핵심 원칙 한 줄:

> **md frontmatter 가 곧 그래프. 사람도 AI agent 도 같은 vault 에 쓴다.**

### Quick start

```bash
pnpm install
pnpm dev                          # http://localhost:3000 — 로그인 0, vault 폴더 선택만으로 즉시 동작
pnpm test:run                     # vitest 100 files / 721 tests
pnpm exec tsc --noEmit
pnpm lint
pnpm build                        # 정적 export → out/
```

### Working principles

세부 룰은 `.claude/rules/*.md` 에 분리해두었고 Claude Code 는 자동으로 로드한다. 다른 도구는 같은 룰을 참조.

- Architecture · FSD 경계 — `@.claude/rules/architecture.md`
- Design system — 무채색 + 단일 인디고, 금지 패턴 — `@.claude/rules/design.md`
- Git workflow — conventional prefix + 한국어 본문 — `@.claude/rules/git.md`
- Testing & verification — TDD-first, 단위 → e2e — `@.claude/rules/testing.md`
- Local-first / offline-first — Notion 처럼 폴더만 선택해도 사용 가능 — `@.claude/rules/local-first.md`
- Authentication — Firebase Auth (email/password + Google) 만 — `@.claude/rules/auth.md`
- 금지 패턴 / Do-Not list — `@.claude/rules/forbidden.md`

### 🚫 npm publish 가드

`npm publish` / `pnpm publish` / `yarn publish` 는 **자동 실행 절대 금지**. `.claude/settings.json` 의 PreToolUse hook 이 차단하고, `CLAUDE.md` 와 `.claude/rules/forbidden.md` 에 규칙으로 명시. 사용자가 직접 "publish 해줘" 라고 *명시적으로* 지시한 경우에만 실행 가능 — 그 경우에도 먼저 `npm pack --dry-run` 으로 audit.

### 이 프로젝트의 ontology

이 프로젝트 자신의 mental model 은 `docs/ontology/` 에 frontmatter md 로 표현되어 있다 (dogfooding — 우리 데이터 형식으로 우리 자신을 기술).

- 진입점: `docs/ontology/README.md` · `docs/ontology/project.md`
- 도메인 8 + capability 9 + element 4 + project 1 + vault-readme 1 ≈ 23 노드
- AI agent 는 `mcp/` MCP 서버로 query 가능 — 등록 가이드 `mcp/README.md` · 예시 `.mcp.json.example`
- 새 도메인/capability/element 가 생기면 같은 디렉토리에 추가 (`add_concept` 도구로 또는 직접 작성)
