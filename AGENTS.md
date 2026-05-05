# AGENTS.md — oh-my-ontology

> Canonical contributor guide for AI agents (Claude Code, Cursor, Copilot, Codex, Aider, …) and humans alike. Read once before touching the codebase.
>
> 한국어 안내는 아래 [한국어 가이드](#한국어-가이드) 섹션 참조.

## Project overview

`oh-my-ontology` is **a local-first codebase ontology workbench for the developer + their AI agent**. The `.md` frontmatter inside the vault *is* the nodes and edges — frontmatter is self-approving, no separate review step. Developer edits via CLI (`oh-my-ontology list/validate/init`) / web UI (`/ontology`, `/docs`) / planned VSCode plugin; AI agent (Claude Code, Cursor) reads/writes the same `.md` files via the `mcp/` MCP server (14 tools).

For direction, see `docs/PRODUCT-DIRECTION.md`. For features users can use right now, see `docs/FEATURES.md`.

The single guiding principle (v3, R11 fire #25):

> **One codebase, one ontology, that the developer and their AI agent grow together.**

Markdown frontmatter is the graph. The git repo is the source of truth. No backend. No login. PM-primary 결정은 R11 에서 reverted — 비개발자 surface 는 *bonus*, *target 아님*.

## Quick start

```bash
pnpm install
pnpm dev                          # http://localhost:3000 — pick a markdown folder and you're in
pnpm test:run                     # vitest unit suite
pnpm exec tsc --noEmit
pnpm lint
pnpm build                        # static export → out/
pnpm bundle:check                 # local-first chunk leak guard
pnpm vault:validate               # frontmatter integrity (R11 — runs in CI too)
pnpm vault:migrate --list         # see registered schema migrations (R11)

# Register an AI agent (Claude Code) — copy .mcp.json.example, follow mcp/README.md
```

No `.env`, no auth provider, no backend setup needed. Round 10 (2026-05) permanently removed the optional Firebase / Firestore / Auth surface — the OSS is now pure local-first.

## Tech stack

- **Framework** Next.js 16 · App Router · `output: 'export'`
- **Language** TypeScript 5
- **Style** Tailwind CSS 4 (`@theme` CSS-based tokens)
- **i18n** next-intl 4.11 with `/[locale]/` URL prefix (en / ko)
- **Visualization** Sigma.js (WebGL) · Graphology · ForceAtlas2 · xyflow
- **Local-first** File System Access API + IndexedDB (vault handle persistence)
- **AI agent** `@modelcontextprotocol/sdk` (stdin/stdout JSON-RPC server, `mcp/` package)
- **State** in-memory + IndexedDB (vault handle) · React local state · URL state
- **Architecture** Feature-Sliced Design (ESLint boundaries enforce import direction)
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
  └── shared/              UI · lib · config primitives
mcp/                       MCP server (the AI agent's surface) — npm pkg, 14 tools
cli/                       CLI binary (developer's daily entry point) — npm pkg, R12 v0.2
                           init / list / validate / add / find / import
docs/                      long-form docs
docs/ontology/             this project's own ontology vault (dogfood — 22 nodes)
tests/                     Vitest unit + Playwright E2E
  └── contract/            cross-package contract tests (parser 4-way, validator 3-way)
scripts/                   vault tooling (R11) + perf baseline (R11) + dogfood walk (R12)
                           build-docs-vault · validate-vault · migrate-vault
                           dogfood-mcp-walk · perf-vault
.claude/rules/             granular working rules (auto-loaded)
.githooks/                 pre-push tsc gate (R11 #2)
```

**Import direction**: `app → views → widgets → features → entities → shared`. ESLint blocks the reverse.

## Routes

```
/                          ontology hub when vault is selected; landing page when not
/topology                  topology view (Sigma WebGL)
/projects                  project list (vault frontmatter `kind: project` docs)
/project/[slug]            project detail (inline edit when vault is loaded)
/project/[slug]/edit       full project editor
/project/new               new project form
/docs                      vault picker / editor / unified palette
/ontology                  tree + ego graph hub
/ontology/edit             ERD canvas builder (xyflow → vault md export)
/ontology/insights         graph insights (kind census · hubs · relation breakdown)
```

> Round 10 (2026-05) permanently removed: `/login`, `/signup`, `/account`, `/reset-password`, `/settings/*`, and earlier rounds had already removed `/admin/*`, `/review/*`, `/diagnostics/*`, `/knowledge/*`. Cloud entity API, Firestore subscribers, manual node/edge cloud modals, screenshot uploader (Firebase Storage) are all gone. Future cloud collab features will be re-designed when sponsorship / collaboration requests come.

All routes are `[locale]` prefixed by next-intl; in-app links use `@/i18n/navigation`.

## Working principles

The detailed rules live in `.claude/rules/*.md` and Claude Code auto-loads them. Other tools should reference the same rules from there.

- **Architecture · FSD boundaries** — `@.claude/rules/architecture.md`
- **Design system** — neutrals + a single indigo, forbidden patterns — `@.claude/rules/design.md` · `@docs/DESIGN-SYSTEM.md`
- **Git workflow** — conventional prefix + Korean (or English) body — `@.claude/rules/git.md`
- **Testing & verification** — TDD-first, unit → e2e — `@.claude/rules/testing.md`
- **Local-first** — vault folder only, no backend — `@.claude/rules/local-first.md`
- **Forbidden patterns / Do-Not list** — `@.claude/rules/forbidden.md`
- **Documentation discipline** — `@.claude/rules/documentation.md`

## 🚫 npm publish guard

`npm publish` / `pnpm publish` / `yarn publish` is **never** run automatically. A PreToolUse hook in `.claude/settings.json` blocks it; `.claude/rules/forbidden.md` documents why. Only execute publish commands when the user explicitly asks. Even then, run `npm pack --dry-run` first to audit the tarball.

## Source-of-truth files

When docs and code disagree, the code wins. For framework / build / routing facts, trust these three:

- `package.json`
- `next.config.ts`
- `app/layout.tsx`

Long-form docs:

- `@docs/PRODUCT-DIRECTION.md` — mission direction
- `@docs/FEATURES.md` — features users can use right now
- `@docs/ARCHITECTURE.md` · `@docs/DESIGN-SYSTEM.md`
- `@docs/CHANGELOG.md` — chronological user-visible changes
- `@mcp/README.md` — AI agent partner (MCP 14 tools — read 8 + write 6) registration + usage
- `@docs/archive/` — historical analysis docs (no longer normative)

## This project's own ontology

This project describes its own mental model in `docs/ontology/` as frontmatter markdown (dogfooding — we describe ourselves in our own data format).

- Entry points: `docs/ontology/README.md` · `docs/ontology/project.md`
- ~18 nodes (domains / capabilities / elements / project / vault-readme)
- AI agents query it via the `mcp/` MCP server — registration guide in `mcp/README.md`, example in `.mcp.json.example`
- When you discover a new domain / capability / element, add it to the same directory (with the MCP `add_concept` tool, or by hand)

## Working with the ontology while you code

The vault is the **shared mental model** between the developer and the AI agent. Treat reading and writing the ontology as part of any non-trivial code task — not as a separate chore. Two patterns:

**Read at the start of a task** (cheap, often skipped). Before opening a feature you don't fully know, ask the vault:

- `list_kinds` — what's in the codebase, by kind?
- `list_concepts` (filter by kind / project) — full node table
- `get_concept(slug)` — fetch the node + its neighbors before extending it
- `find_backlinks(slug)` — who depends on this? (run *before* you rename or merge)
- `find_path(from, to)` — does a relation already exist?

A 30-second read at the top of the task often replaces a 10-minute re-discovery in the code.

**Write at the end of a task** (the part that's easy to skip). When a unit of work introduced a new capability / element / domain, or renamed/folded an existing one, mirror the change in the vault:

- new node → `add_concept(slug, kind, title, domain?, …)` — frontmatter is auto-normalized per kind, body defaults to a kind-specific starter, and missing strongly-expected fields come back as `warnings` so you know what to follow up
- new edge between existing nodes → `add_relation(from, to, type)`
- node moved or renamed in code → `rename_concept(oldSlug, newSlug)` (dry-run first, then `confirm: true`) — atomically rewrites every backlink
- two near-duplicates collapse → `merge_concepts(fromSlug, intoSlug)` (same dry-run pattern)
- existing node refined → `patch_concept(slug, frontmatter, body, expected_mtime)` — pass `expected_mtime` from a prior `get_concept` so a concurrent human edit isn't silently overwritten

For the explicit "I'm done with this task — please sync the ontology now" loop, invoke the **`/ontology-sync`** skill (see `.claude/skills/ontology-sync/SKILL.md`). It bundles the read-then-write pattern with a checklist for when to skip (typos, style nudges).

**Skip the ontology** for: typo fixes, comment tweaks, single-line style nudges, lint config, test fixtures with no shape change. Anything that changes "what the codebase *is*" goes into the vault; anything that doesn't, stays out.

## Frontmatter shape per kind (R14)

When an AI agent (`add_concept`) or a developer (`oh-my-ontology add` / `oh-my-ontology import`) creates a new node, the frontmatter is normalized per `kind` so external `.md` ingestion stays consistent. See `mcp/README.md` for the full table and `mcp/src/schema.mjs` (mirror at `cli/src/lib/schema.mjs`) for the source. Contract test: `tests/contract/vault-schema.contract.test.ts`. Validator surfaces missing strongly-expected fields (e.g. capability/element without `domain:`) as the `missing-expected-field` warning — advisory only, not a hard error, so pre-existing vaults still pass.

`oh-my-ontology import <path...>` is the bulk path: hand it your own `.md` (single file, directory, or many) and each file is run through the same schema before landing in the vault. Frontmatter `kind`/`slug`/`title` win when present; `--kind` is the fallback, the first `# H1` is the title fallback, `--auto-prefix` / `--rename` / `--dry-run` cover the typical conflict cases. Same shape as `add_concept` / `add` — one schema, three entry points.

## CLAUDE.md / AGENTS.md sync

- **AGENTS.md** (this file) is canonical — the cross-tool standard.
- **CLAUDE.md** imports AGENTS.md and only adds Claude-Code-specific bits (skills, hooks).
- When you change one, sync the other — or just keep CLAUDE.md's `@AGENTS.md` import and they stay consistent automatically.

---

## 한국어 가이드

> AI agent (Claude Code, Cursor, Copilot, Codex, Aider 등) 와 사람 모두를 위한 contributor guide. 코드 만지기 전에 한 번 읽고 시작.

### 프로젝트 개요

`oh-my-ontology` 는 **개발자와 그 AI agent 가 같이 키우는 local-first codebase ontology workbench** 다. vault 의 `.md` frontmatter 가 *그대로* 노드와 관계 — 자기-승인이라 별도 검수 단계 없음. 개발자는 CLI (`oh-my-ontology list/validate/init`) / 웹 UI (`/ontology`, `/docs`) / 향후 VSCode plugin 으로 편집, AI agent (Claude Code, Cursor) 는 `mcp/` MCP 서버 (14 tools) 로 같은 `.md` 파일을 read/write.

핵심 원칙 한 줄 (v3, R11 fire #25):

> **하나의 codebase, 하나의 ontology, 개발자와 그 AI agent 가 같이 키운다.**

md frontmatter 가 곧 그래프. git repo 가 진실원. 백엔드 / 로그인 0. PM-primary 결정은 R11 에서 reverted — 비개발자 surface 는 *bonus*, *target 아님*.

### Quick start

```bash
pnpm install
pnpm dev                          # http://localhost:3000 — vault 폴더 선택만으로 즉시 동작
pnpm test:run
pnpm exec tsc --noEmit
pnpm lint
pnpm build                        # 정적 export → out/
pnpm vault:validate               # frontmatter integrity (R11 — CI 게이트)
pnpm vault:migrate --list         # 등록된 schema 마이그레이션 (R11)
```

`.env` 파일 / 인증 provider / 백엔드 설정 불필요. R10 (2026-05) 에서 옵션이었던 Firebase / Firestore / Auth surface 영구 제거 — OSS 는 순수 local-first.

### Working principles

세부 룰은 `.claude/rules/*.md` 에 분리해두었고 Claude Code 는 자동으로 로드한다. 다른 도구는 같은 룰을 참조.

- Architecture · FSD 경계 — `@.claude/rules/architecture.md`
- Design system — 무채색 + 단일 인디고, 금지 패턴 — `@.claude/rules/design.md`
- Git workflow — conventional prefix + 한국어 본문 — `@.claude/rules/git.md`
- Testing & verification — TDD-first, 단위 → e2e — `@.claude/rules/testing.md`
- Local-first — vault 폴더만으로, 백엔드 0 — `@.claude/rules/local-first.md`
- 금지 패턴 / Do-Not list — `@.claude/rules/forbidden.md`
- 문서화 규율 — `@.claude/rules/documentation.md`

### 🚫 npm publish 가드

`npm publish` / `pnpm publish` / `yarn publish` 는 **자동 실행 절대 금지**. `.claude/settings.json` 의 PreToolUse hook 이 차단하고 `.claude/rules/forbidden.md` 에 규칙으로 명시. 사용자가 직접 "publish 해줘" 라고 *명시적으로* 지시한 경우에만 실행 가능 — 그 경우에도 먼저 `npm pack --dry-run` 으로 audit.

### 이 프로젝트의 ontology

이 프로젝트 자신의 mental model 은 `docs/ontology/` 에 frontmatter md 로 표현되어 있다 (dogfooding — 우리 데이터 형식으로 우리 자신을 기술).

- 진입점: `docs/ontology/README.md` · `docs/ontology/project.md`
- 약 18 노드 (도메인 6 · capability 6 · element 4 · project 1 · vault-readme 1)
- AI agent 는 `mcp/` MCP 서버로 query 가능 — 등록 가이드 `mcp/README.md` · 예시 `.mcp.json.example`
- 새 도메인/capability/element 가 생기면 같은 디렉토리에 추가 (`add_concept` 도구로 또는 직접 작성)
