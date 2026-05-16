# oh-my-ontology

> **One codebase, one ontology, that the developer and their AI agent grow together.**
>
> Local-first markdown vault. Developer authors via CLI / web UI.
> AI agent (Claude Code, Codex, Cursor) reads + writes the same `.md` files via MCP — 23 tools.
> No backend. No login. The git repo is the source of truth.

[![CI](https://github.com/wlsdks/oh-my-ontology/actions/workflows/ci.yml/badge.svg)](https://github.com/wlsdks/oh-my-ontology/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built with Next.js](https://img.shields.io/badge/Built_with-Next.js-000?logo=next.js)](https://nextjs.org)
[![MCP server](https://img.shields.io/badge/MCP-23_tools-5e6ad2)](mcp/README.md)

```bash
npx oh-my-ontology init my-vault                # scaffold
cd my-vault
oh-my-ontology list                             # 5 starter nodes
oh-my-ontology add capability auth/token-issue --title="Token issue" --domain=auth
oh-my-ontology find token                       # verify it shows up
oh-my-ontology validate                         # frontmatter integrity (CI gate-friendly)
```

That's it. You now have a frontmatter-based ontology vault that the
developer and their AI agent (Claude Code, Cursor, etc.) can read and
write together — same `.md` files, same git repo.

> 한국어 안내는 아래 [README (한국어)](#한국어-가이드) 섹션 참조.

---

## What this is

Most "AI in your codebase" tools paste source files into a context window
and hope the LLM remembers the architecture. **oh-my-ontology takes the
opposite path:** you (and the AI) maintain the architecture *as a graph
of markdown files*. The graph is the canonical mental model. Source code
references it. AI agents read it before suggesting changes and write to
it after every architectural decision.

Three claims:

1. **Markdown frontmatter is enough** — `kind: capability`, `domain: auth`,
   `depends_on: [...]` is the entire schema. No DB, no backend, no auth.
2. **Developer + AI agent share one source of truth** — both edit the same
   `.md` files. The developer authors via CLI / web UI; the AI agent reads
   + writes via MCP (Claude Code, Codex, Cursor). Same git repo, same diff.
3. **MCP server gives the AI its only interface** — **23 tools** (15 read +
   8 write) over JSON-RPC. The agent doesn't need to "ingest your codebase";
   it reads the ontology the developer already curates. R16 / R17 added
   `analyze_repo_structure` and `infer_imports` so the agent can also
   bootstrap a fresh repo into the vault from heuristics + real import
   graph (side effect 0, candidates only).

## Why we built this

Codebases keep growing. AI assistants can suggest code, but they don't
*understand* the project's mental model — every conversation starts from
zero. Existing solutions tie that knowledge to one vendor's memory store
(Cursor's chats, Claude's projects). We wanted something **portable,
plain-text, and lives next to the code**: vault frontmatter you commit
to git, and the AI agent reads via a tiny MCP server.

The primary audience is the **developer + their AI agent** (R12, 2026-05).
The developer is already in the codebase — the cost of authoring frontmatter
is low. Their AI agent (Claude Code, Cursor) is the *real* daily user of
the 23 MCP tools — it needs ground-truth structure to give better answers,
and without a developer maintaining it, the ontology rots. PM/designer
friendliness is a side effect of plain markdown, not a target.

## Three views, one vault

The same frontmatter graph rendered three ways:

- **Topology** (`/topology`) — Sigma WebGL spatial network of projects
- **Tree** (`/`, `/ontology`) — hierarchical drill-down (project → domain → capability → element)
- **ERD builder** (`/ontology/edit`) — xyflow canvas to add nodes and relations visually
- **MCP** (separate package) — JSON-RPC over stdio, 23 tools

All four read and write the same `.md` files. Pick whichever view fits
the moment.

## Quick start

### Just AI agents (no UI)

```bash
npx oh-my-ontology init ./vault
# Claude Code / Cursor: open the repo or vault folder and restart;
# init wrote wired .mcp.json files in both places.
# Codex: run the exact `codex mcp add ...` command printed by init.
```

### With the visual workbench

```bash
git clone https://github.com/wlsdks/oh-my-ontology
cd oh-my-ontology
pnpm install
pnpm dev   # http://localhost:3000
```

Then visit `/docs` and pick your vault folder (browser File System Access
API). The workbench reads/writes the same `.md` files the AI does.

No `.env`, no Firebase, no auth provider, no cloud account needed.

### Vault tooling (R11)

```bash
pnpm vault:validate              # frontmatter integrity audit (CI gate)
pnpm vault:validate /your/vault  # validate any folder, not just dogfood
pnpm vault:audit                 # dogfood ontology paths match real repo files
pnpm vault:migrate --list        # see registered schema migrations
pnpm vault:migrate <id>          # dry-run a migration (default — no disk writes)
pnpm vault:migrate <id> --write  # apply a migration to disk
```

CI runs `pnpm vault:validate`, `pnpm vault:audit`, and `pnpm package:check`
on every PR. The `LocalVaultPicker` shows a chip when your vault has
frontmatter issues so you know which docs aren't becoming graph nodes.

### Package / MCP release checks

```bash
pnpm package:check              # MCP/CLI package files contract + self-test
OMOT_TEST_NAME_PATTERN="mcp-verify" pnpm integration:cli
OMOT_TEST_NAME_PATTERN="tools/list|initialize" pnpm integration:mcp
pnpm smoke:packed-cli           # pack/install MCP+CLI, verify installed flow/help/failure + tarball summary
pnpm dogfood:walk               # actual MCP stdio walk over this repo's ontology
cd mcp && OMOT_VAULT=../docs/ontology npm run verify
```

Use these when changing `mcp/`, `cli/`, package manifests, or release
scripts. `integration:cli` and `integration:mcp` accept `OMOT_TEST_NAME_PATTERN`
so you can run only the spawn-heavy integration cases touched by a small
change. `npm run verify` calls `get_concepts` with discovered slugs plus one
missing slug, then runs `workspace_brief` and `health`, so the same batch-read
partial-row contract and first-contact diagnosis an AI agent should run are
exercised locally. It also checks both `overview` and `project_map`
`query_plan` targets plus actual `neighbors`, self-`path`, and
`project_scope` calls, so the installed MCP path proves more than the original
single aggregate query. Project-less vaults skip only the containment-specific
`project_scope` smoke, and empty vaults skip node-targeted graph smoke until a
first node exists.
`smoke:packed-cli` also checks the installed `mcp-verify --help` output plus
project-less and empty-vault verify paths, so release tarballs keep exposing the
graph-query and strict-argument smoke scope without starting a server for help
and without assuming every valid vault already has containment roots. It also creates a dependency-cycle vault and checks installed
`workspace-brief --json` exits 1 on fail-severity nextActions.
For local CLI gates, `compile --json` exits 1 on unresolved graph references,
`cycles --json` exits 1 on dependency cycles, and `path --json` exits 1 when
`found:false` so scripts can use these commands as hard ontology checks.
The graph diagnostic exit contract is fail-closed: malformed `cycles`,
`path`, `health`, or `workspace-brief` payloads are treated as command
failures instead of clean vaults.
`dogfood:walk` runs that diagnosis plus graph lookup tasks against this
repo's own `docs/ontology` vault and exits non-zero if the core MCP
responses, strict unknown-argument rejection, `get_concepts` success/partial rows, path check, vault warnings, `validate_vault` problem files,
`workspace_brief.nextActions`, `workspace_brief.health.checks`, or `health`
gate regress. Set `OMOT_DOGFOOD_TIMEOUT_MS=10000` for slower local
filesystems; the value must be a positive integer in milliseconds.

## Verifiable promises

> 📊 **Headline measurement** (R13 benchmark, [methodology](docs/benchmark/)):
> Claude Code with MCP-on **cuts hallucinated answers 9 → 0** on cross-cutting graph tasks.
> Codex with MCP-on **cuts tool calls 76%** (7.0 → 1.67/task) at saturated correctness.
> Same MCP tools, two agents, two different value mechanisms.

| Promise | Verification |
|---|---|
| **vault frontmatter = the graph** (no review queue, no LLM extraction) | `grep -r "extractionJob" src/ → 0` |
| **AI agent partner via MCP** | `mcp/` package, 23 tools, `mcp/scripts/verify.mjs` smoke |
| **No backend** (Firebase / DB / auth) | `pnpm bundle:check` — firebase SDK chunk 0 (deps removed in R10) |
| **Dogfooding** | `docs/ontology/` is this project's own curated mental model — **28 nodes** (capabilities 16 · domains 6 · elements 4 · project 1 · vault-readme 1). The MCP server you'd run is the one we use to write *this README*. |
| **Vault scale** | `node scripts/perf-vault.mjs` measures walk + read + parse on synthetic vaults. **2,000 .md files in 33 ms** (linear, ~17 µs/file). Sub-second up to 1,000 nodes — the ontology will not become the bottleneck. |
| **AI agent quality measurement** *(cross-agent, n=2)* | [`docs/benchmark/`](docs/benchmark/) — 7 tasks × 3 categories × 2 agents (Claude Code + Codex). [Claude Code results](docs/benchmark/results/2026-05-04-claude-code.md): hallucinations 9 → 0, Cat A correctness +1.0. [Codex results](docs/benchmark/results/2026-05-04-codex.md): Cat A tool calls 7.0 → 1.67. Negative control (Cat C, file-read tasks) passes for both — agents correctly defer to Read/Grep, no over-reach. |

## Architecture

- **Framework**: Next.js 16 App Router, `output: 'export'` (static)
- **i18n**: next-intl 4.11 with `/[locale]/` URL prefix (en / ko)
- **Visualization**: Sigma.js (WebGL) + Graphology + ForceAtlas2 + xyflow + dagre
- **Local-first**: File System Access API + IndexedDB
- **AI agent surface**: `mcp/` MCP server, stdio JSON-RPC, 23 tools
- **Architecture**: Feature-Sliced Design (ESLint boundaries enforced)
- **Tests**: Vitest unit + Playwright e2e

Full details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`AGENTS.md`](AGENTS.md).

## Repo map

```
app/            Next.js routes (thin wrappers, locale-prefixed)
src/            Feature-Sliced Design layers
  ├── views/    page-level components
  ├── widgets/  composite UI blocks
  ├── features/ user interactions
  ├── entities/ domain entities (project, ontology-class, knowledge-graph, …)
  └── shared/   ui primitives, lib, config
mcp/            MCP server (`oh-my-ontology-mcp`, 23 tools) — AI agent surface
cli/            `npx oh-my-ontology` (26 commands: scaffold, MCP verify, bootstrap, compile, graph deep dive) — developer terminal surface
docs/           Long-form docs + dogfood vault (docs/ontology/) + benchmark results
docs/archive/   Historical analysis docs
scripts/        Build helpers
```

## How to contribute

We're early. The simplest contribution path:

1. Try `npx oh-my-ontology init` and write your project's mental model in markdown
2. File issues for friction you hit (frontmatter ergonomics, MCP tool gaps, view performance)
3. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before code PRs

Roadmap and open questions: [`docs/PRODUCT-DIRECTION.md`](docs/PRODUCT-DIRECTION.md).

## License

MIT — see [`LICENSE`](LICENSE).

---

## 한국어 가이드

> 사람과 AI agent 가 같이 키우는 local-first codebase ontology workbench.
> markdown frontmatter 가 곧 그래프. 백엔드 / 로그인 0.

### 30초 시작

```bash
npx oh-my-ontology init my-vault
cd my-vault
# project.md 와 domains/example.md 를 본인 환경에 맞게 수정
# Claude Code / Cursor 는 생성된 .mcp.json 을 자동 인식
# Codex 는 init 이 출력한 codex mcp add 명령을 실행
```

자세한 시작 가이드:
- [`AGENTS.md`](AGENTS.md) — contributor (사람·AI 공통) 가이드
- [`docs/PRODUCT-DIRECTION.md`](docs/PRODUCT-DIRECTION.md) — mission spec
- [`docs/FEATURES.md`](docs/FEATURES.md) — 사용자 가시 기능 전수
- [`mcp/README.md`](mcp/README.md) — MCP 서버 등록 + 23 도구

### 핵심 약속

1. **vault frontmatter = 그래프** — 검수 큐 / 추출 워커 없음. frontmatter 자기-승인.
2. **AI agent partner** — MCP 서버 (read 15 + write 8, R16 `analyze_repo_structure` · R17 `infer_imports` · compiler-style `compile_ontology` · graph-engine `query_ontology` 포함) 로 같은 vault read/write + 빈 vault bootstrap.
3. **Local-first single-source** — 사용자 디스크 vault 가 진실원. Firebase / 백엔드 / 인증 의존 0 (R10 — 2026-05).
4. **Dogfooding** — `docs/ontology/` 가 프로젝트 자기 자신의 mental model.

### 로컬 개발

```bash
pnpm install
pnpm dev                          # http://localhost:3000
pnpm test:run
pnpm exec tsc --noEmit
pnpm lint
pnpm build                        # 정적 export → out/
pnpm bundle:check                 # local-first chunk 회귀 차단
```

### 사용자 가시 라우트

| 영역 | 라우트 |
|---|---|
| 시각화 | `/`, `/topology`, `/ontology`, `/ontology/edit`, `/ontology/insights` |
| 프로젝트 | `/projects`, `/project/[slug]`, `/project/[slug]/edit`, `/project/new` |
| Vault | `/docs` |

> R10 (2026-05): `/login`, `/signup`, `/account`, `/reset-password`, `/settings/*` 영구 제거. 미래 cloud collab 단계가 다시 도입될 때 인증 surface 새로 디자인.
