# AGENTS.md — oh-my-ontology

> Canonical contributor guide for AI agents (Claude Code, Cursor, Copilot, Codex, Aider, …) and humans alike. Read once before touching the codebase.
>
> 한국어 안내는 아래 [한국어 가이드](#한국어-가이드) 섹션 참조.

## Project overview

`oh-my-ontology` is **a local-first codebase ontology workbench for the developer + their AI agent**. The `.md` frontmatter inside the vault *is* the nodes and edges — frontmatter is self-approving, no separate review step. Developer edits via CLI (`oh-my-ontology init/list/validate/add/find/import`) or web UI (`/ontology`, `/docs`); AI agent (Claude Code, Codex, Cursor) reads/writes the same `.md` files via the `mcp/` MCP server (20 tools).

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

# AI agent (Claude Code) auto-registers via this repo's `.mcp.json` — `mcp/README.md` has details.
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
mcp/                       MCP server (the AI agent's surface) — npm pkg, 20 tools
cli/                       CLI binary (developer's daily entry point) — npm pkg, R12 v0.2
                           init / list / validate / add / find / import
docs/                      long-form docs
docs/ontology/             this project's own ontology vault (dogfood — 26 nodes)
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
- `@mcp/README.md` — AI agent partner (MCP 20 tools — read 12 + write 8) registration + usage
- `@docs/archive/` — historical analysis docs (no longer normative)

## This project's own ontology

This project describes its own mental model in `docs/ontology/` as frontmatter markdown (dogfooding — we describe ourselves in our own data format).

- Entry points: `docs/ontology/README.md` · `docs/ontology/project.md`
- ~26 nodes (capability 14 · domain 6 · element 4 · project 1 · vault-readme 1)
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

**Bootstrap an empty vault** (R16). When a user just ran `oh-my-ontology init` on a fresh repo and the vault has only the 5 starter nodes, don't make the user hand-author every node. Use the **`/ontology-bootstrap`** skill (`.claude/skills/ontology-bootstrap/SKILL.md`):

- It calls `analyze_repo_structure` once. **Side effect 0** — returns deterministic candidates (project + domains[] + capabilities[] + elements[] + suggestedRelations[]) by reading `package.json` / `README.md` H2 sections / `src/` folder layout (FSD or generic). Vault NOT modified.
- Shows the candidates compactly, lets the user prune / refine, then lands the accepted ones via `add_concept` / `add_relation`. Single source of truth preserved — only the user (via your subsequent calls) writes to the vault.
- Companion to `/ontology-sync` (incremental, post-bootstrap).

**Write at the end of a task** (the part that's easy to skip). When a unit of work introduced a new capability / element / domain, or renamed/folded an existing one, mirror the change in the vault:

- new node → `add_concept(slug, kind, title, domain?, …)` — frontmatter is auto-normalized per kind, body defaults to a kind-specific starter, and missing strongly-expected fields come back as `warnings` so you know what to follow up
- new edge between existing nodes → `add_relation(from, to, type)`
- node moved or renamed in code → `rename_concept(oldSlug, newSlug)` (dry-run first, then `confirm: true`) — atomically rewrites every backlink
- two near-duplicates collapse → `merge_concepts(fromSlug, intoSlug)` (same dry-run pattern)
- existing node refined → `patch_concept(slug, frontmatter, body, expected_mtime)` — pass `expected_mtime` from a prior `get_concept` so a concurrent human edit isn't silently overwritten

For the explicit "I'm done with this task — please sync the ontology now" loop, invoke the **`/ontology-sync`** skill (see `.claude/skills/ontology-sync/SKILL.md`). It bundles the read-then-write pattern with a checklist for when to skip (typos, style nudges).

For the *implicit* "I just opened this repo" loop, the **SessionStart hook** at `.claude/hooks/inject-ontology-summary.sh` runs once when Claude Code attaches to the workspace and injects a short census of the vault (kind counts + first 8 entries) into the agent's system context. The agent then has the ontology in mind from message #1 — no `list_concepts` round trip needed for the first orientation. The hook stays silent in repos without a vault, so it's safe to keep on globally.

**Skip the ontology** for: typo fixes, comment tweaks, single-line style nudges, lint config, test fixtures with no shape change. Anything that changes "what the codebase *is*" goes into the vault; anything that doesn't, stays out.

## Frontmatter shape per kind (R14)

When an AI agent (`add_concept`) or a developer (`oh-my-ontology add` / `oh-my-ontology import`) creates a new node, the frontmatter is normalized per `kind` so external `.md` ingestion stays consistent. See `mcp/README.md` for the full table and `mcp/src/schema.mjs` (mirror at `cli/src/lib/schema.mjs`) for the source. Contract test: `tests/contract/vault-schema.contract.test.ts`. Validator surfaces missing strongly-expected fields (e.g. capability/element without `domain:`) as the `missing-expected-field` warning — advisory only, not a hard error, so pre-existing vaults still pass.

`oh-my-ontology import <path...>` is the bulk path: hand it your own `.md` (single file, directory, or many) and each file is run through the same schema before landing in the vault. Frontmatter `kind`/`slug`/`title` win when present; `--kind` is the fallback, the first `# H1` is the title fallback, `--auto-prefix` / `--rename` / `--dry-run` cover the typical conflict cases. Same shape as `add_concept` / `add` — one schema, three entry points.

### Project containment is implicit (no `project:` key needed)

Frontmatter does **not** require an explicit `project:` key. The runtime (`derivationToInsight`) walks the `contains` / `belongs_to` graph from each `kind: project` root and stamps every descendant (domain / capability / element) with that project's slug as a `projectIds` entry. So:

- write `kind: capability` with `domain: foo` and the project containment falls out automatically (capability → domain → project, all wired via `contains`)
- `/projects` card fact strips, `/ontology/insights` per-project bars, and cross-project edge counts all derive from this BFS — no manual stamping

A vault with no `kind: project` doc still works (no containment, all nodes orphans in project terms). When you eventually add the project doc, all existing descendants pick up `projectIds` on the next derive — no migration.

## CLAUDE.md / AGENTS.md sync

- **AGENTS.md** (this file) is canonical — the cross-tool standard.
- **CLAUDE.md** imports AGENTS.md and only adds Claude-Code-specific bits (skills, hooks).
- When you change one, sync the other — or just keep CLAUDE.md's `@AGENTS.md` import and they stay consistent automatically.

---

## 한국어 가이드

> AI agent (Claude Code, Cursor, Copilot, Codex, Aider 등) 와 사람 모두를 위한 contributor guide. 코드 만지기 전에 한 번 읽고 시작.

### 프로젝트 개요

`oh-my-ontology` 는 **개발자와 그 AI agent 가 같이 키우는 local-first codebase ontology workbench** 다. vault 의 `.md` frontmatter 가 *그대로* 노드와 관계 — 자기-승인이라 별도 검수 단계 없음. 개발자는 CLI (`oh-my-ontology init/list/validate/add/find/import`) 또는 웹 UI (`/ontology`, `/docs`) 로 편집, AI agent (Claude Code, Codex, Cursor) 는 `mcp/` MCP 서버 (20 tools) 로 같은 `.md` 파일을 read/write.

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
pnpm vault:audit                  # capability/element path drift 가드 (R12)
pnpm vault:migrate --list         # 등록된 schema 마이그레이션 (R11)

# AI agent (Claude Code 등) 는 이 repo 의 `.mcp.json` 으로 자동 등록 — 자세한 사용법 mcp/README.md.
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
- 26 노드 (capability 14 · domain 6 · element 4 · project 1 · vault-readme 1) — 이 repo 의 `.mcp.json` 자동 등록 후 `mcp__oh-my-ontology__list_concepts` 로 즉시 조회
- AI agent 는 `mcp/` MCP 서버로 query/write — 등록 가이드 `mcp/README.md`. **R14 부터** `add_concept` / `add` / `import` 세 진입점이 같은 schema 모듈로 양식 정규화 (`mcp/src/schema.mjs` ↔ `cli/src/lib/schema.mjs`)
- 새 도메인/capability/element 가 생기면 같은 디렉토리에 추가 (`add_concept` 도구로 또는 직접 작성). **R14 의 `/ontology-sync` skill** 또는 SessionStart hook 으로 자동 sync 가능

### 코드 작업 중 ontology 다루기

vault 는 개발자와 AI agent 가 **공유하는 mental model**. ontology 의 read / write 를 *별개 작업* 이 아니라 *모든 non-trivial 코드 작업의 일부* 로 취급. 두 패턴:

**작업 시작 시 read** (싸고, 자주 빠뜨림). 잘 모르는 영역을 만지기 전에 vault 에 묻기:

- `list_kinds` — 어떤 kind 가 codebase 에 몇 개씩?
- `list_concepts` (kind / project filter) — 전체 노드 표
- `get_concept(slug)` — 확장하기 전에 노드 + 이웃 확인
- `find_backlinks(slug)` — 누가 이 노드 의존? (rename/merge *전에* 실행)
- `find_path(from, to)` — 관계가 이미 있나?

작업 head 의 30 초 read 가 코드에서의 10 분 재발견을 자주 대신해 줌.

**빈 vault 부트스트랩** (R16). 사용자가 fresh repo 에서 `oh-my-ontology init` 만 한 직후 — 5 starter 노드 외 빈 vault. 사용자가 매 노드 손 작성 부담 — 대신 **`/ontology-bootstrap`** skill (`.claude/skills/ontology-bootstrap/SKILL.md`) 사용:

- `analyze_repo_structure` 1 회 호출. **side effect 0** — `package.json` / `README.md` H2 / `src/` 폴더 layout 읽어 deterministic 후보 반환. vault 변경 안 함.
- 후보를 사용자에게 *5 줄 max* 요약 → confirm/pick/refine 분기 → 채택된 것만 `add_concept` / `add_relation`. 단일 source of truth 보존.
- `/ontology-sync` 의 *cold-start* 짝 (sync 는 incremental, bootstrap 은 post-init).

**작업 끝에 write** (쉽게 빠뜨림). 한 작업 단위가 새 capability / element / domain 을 도입했거나 기존 것을 rename / 합쳤다면, vault 에 반영:

- 새 노드 → `add_concept(slug, kind, title, domain?, …)` — frontmatter 가 kind 별 자동 정규화, body 는 kind-specific starter, 강 expected 필드 누락은 `warnings` 로 회신
- 기존 노드 사이 새 edge → `add_relation(from, to, type)`
- 코드의 노드가 이동/이름 변경 → `rename_concept(oldSlug, newSlug)` (dry-run 후 `confirm: true`) — 모든 backlink 자동 재배선
- 거의 같은 두 노드 합치기 → `merge_concepts(fromSlug, intoSlug)` (같은 dry-run 패턴)
- 기존 노드 정련 → `patch_concept(slug, frontmatter, body, expected_mtime)` — `expected_mtime` 은 직전 `get_concept` 에서. 동시 사람 편집 silent overwrite 차단

명시적 "이 작업 끝났으니 ontology sync 해줘" 루프는 **`/ontology-sync`** skill (`.claude/skills/ontology-sync/SKILL.md`) 로. read-then-write 패턴 + skip 케이스 (typo, style nudge) 체크리스트 묶음.

암시적 "이 repo 방금 열었어" 루프는 **SessionStart hook** (`.claude/hooks/inject-ontology-summary.sh`) 이 처리. Claude Code 가 workspace 에 attach 할 때 한 번 vault census (kind 카운트 + 첫 8 항목) 를 system context 에 inject — agent 가 message #1 부터 ontology 를 이미 인지. vault 없는 repo 에선 silent exit, 글로벌 활성화 안전.

**ontology skip** 케이스: typo fix, 주석 수정, 한 줄 style nudge, lint config, shape 변화 없는 test fixture. *codebase 가 무엇인지* 바뀌는 변화는 vault 로, 아니면 그대로.

### Kind 별 frontmatter 양식 (R14)

AI agent (`add_concept`) 또는 개발자 (`oh-my-ontology add` / `import`) 가 새 노드를 만들면, frontmatter 는 `kind` 별로 정규화되어 외부 .md 흡수도 일관. 전체 표는 `mcp/README.md`, source 는 `mcp/src/schema.mjs` (mirror `cli/src/lib/schema.mjs`). Contract test: `tests/contract/vault-schema.contract.test.ts`. Validator 가 강하게 기대되는 필드 누락 (예: capability/element 의 `domain:`) 을 `missing-expected-field` warning 으로 노출 — advisory 만, hard error 아님 (기존 vault 호환 보존).

`oh-my-ontology import <path...>` 가 bulk path: 본인 `.md` (단일 파일, 디렉토리, 다수) 를 넘기면 같은 schema 거쳐 vault 에 자리잡음. frontmatter `kind`/`slug`/`title` 우선, `--kind` 가 fallback, 첫 `# H1` 이 title fallback, `--auto-prefix` (R15 default on) / `--rename` / `--dry-run` 이 일반 충돌 케이스 cover. `add_concept` / `add` 와 같은 shape — 하나의 schema, 세 진입점.
