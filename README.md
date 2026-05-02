# oh-my-ontology

> **AI-native codebase ontology workbench.** Humans and AI agents author the same vault.
> Markdown frontmatter is the graph.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built with Next.js](https://img.shields.io/badge/Built_with-Next.js-000?logo=next.js)](https://nextjs.org)
[![MCP server](https://img.shields.io/badge/MCP-11_tools-5e6ad2)](mcp/README.md)

```bash
npx oh-my-ontology init my-vault
cd my-vault
$EDITOR project.md
```

That's it. You now have a frontmatter-based ontology vault that humans
and AI agents (Claude Code, Cursor, etc.) can read and write together.

**Hosted demo (read-only, our own dogfood vault):** https://oh-my-ontology.web.app

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
   `depends_on: [...]` is the entire schema. No DB. No backend required.
2. **Humans and AI share one source of truth** — both edit the same `.md`
   files. No "AI memory" silo. Non-developers contribute by editing markdown.
3. **The MCP server is the AI's only interface** — read 7 + write 4 tools
   over JSON-RPC. The agent doesn't need to "ingest your codebase"; it
   reads the ontology you've already built.

## Why we built this

Codebases keep growing. AI assistants can suggest code, but they don't
*understand* the project's mental model — every conversation starts from
zero. Existing solutions tie that knowledge to one vendor's memory store
(Cursor's chats, Claude's projects). We wanted something **portable,
plain-text, and non-developer accessible**: vault frontmatter you can
edit in Obsidian, commit to git, and an AI agent reads via a tiny MCP
server.

The non-developer angle matters. PMs, designers, and domain experts can
read and edit the same markdown — they don't need to learn the codebase,
they just contribute to its mental model. Their edits become input the
AI uses when planning the next feature.

## Three views, one vault

The same frontmatter graph rendered three ways:

- **Topology** (`/topology`) — Sigma WebGL spatial network of projects
- **Tree** (`/`) — hierarchical drill-down (project → domain → capability → element)
- **ERD builder** (`/ontology/edit`) — xyflow canvas to add nodes and relations visually
- **MCP** (separate package) — JSON-RPC over stdio, 11 tools

All four read and write the same `.md` files. Pick whichever view fits
the moment.

## Quick start

### Just AI agents (no UI)

```bash
npx oh-my-ontology init ./vault
# Open ./vault/.mcp.json.example, copy into your MCP config (Claude Code, Cursor)
# Set OMOT_VAULT to /absolute/path/to/your/vault
# Restart the agent — 11 oh-my-ontology tools become available
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

## Mission v2 promises (verifiable)

| Promise | Verification |
|---|---|
| **vault frontmatter = the graph** (no review queue, no LLM extraction) | `grep -r "extractionJob" src/ → 0` |
| **AI agent partner via MCP** | `mcp/` package, 11 tools, `mcp/scripts/verify.mjs` smoke test |
| **Local-first first paint** (firebase JS not in critical path) | `pnpm bundle:check` — local-first routes 0 KB firebase |
| **Dogfooding** | `docs/ontology/` is the project's own mental model in frontmatter (~130 nodes / 165 relations) |

## Architecture

- **Framework**: Next.js 16 App Router, `output: 'export'` (static)
- **Visualization**: Sigma.js (WebGL) + Graphology + ForceAtlas2 + xyflow + dagre
- **Local-first**: File System Access API + IndexedDB
- **Optional cloud**: Firebase (Auth + Firestore + Storage). Lazy-loaded — chunks not in user-facing first paint.
- **AI agent surface**: `mcp/` MCP server, stdio JSON-RPC, 11 tools
- **Architecture**: Feature-Sliced Design (ESLint boundaries enforced)
- **Tests**: Vitest 100 files / 721 tests + Playwright e2e

Full details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md).

## Repo map

```
app/            Next.js routes (thin wrappers)
src/            Feature-Sliced Design layers
  ├── views/    page-level components
  ├── widgets/  composite UI blocks
  ├── features/ user interactions
  ├── entities/ domain entities (project, ontology-class, knowledge-graph, …)
  └── shared/   ui primitives, lib, config
mcp/            MCP server (`oh-my-ontology-mcp`, 11 tools)
cli/            `npx oh-my-ontology` (vault scaffold + setup)
docs/           Long-form docs + dogfood vault (docs/ontology/)
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

> 사람과 AI agent 가 같이 키우는 codebase ontology workbench.
> markdown frontmatter 가 곧 그래프. AI 와 사람이 같은 vault 를 편집한다.

### 30초 시작

```bash
npx oh-my-ontology init my-vault
cd my-vault
# project.md 와 domains/example.md 를 본인 환경에 맞게 수정
# .mcp.json.example 을 AI agent (Claude Code 등) 의 MCP 설정으로 복사
```

자세한 시작 가이드:
- [`AGENTS.md`](AGENTS.md) — contributor (사람·AI 공통) 가이드, mission v2 정렬
- [`docs/PRODUCT-DIRECTION.md`](docs/PRODUCT-DIRECTION.md) — mission v2 spec
- [`docs/FEATURES.md`](docs/FEATURES.md) — 사용자 가시 기능 전수
- [`mcp/README.md`](mcp/README.md) — MCP 서버 등록 + 11 도구

### 핵심 약속

1. **vault frontmatter = 그래프** — 검수 큐 / 추출 워커 없음. frontmatter 자기-승인.
2. **AI agent partner** — MCP 서버 (read 7 + write 4) 로 같은 vault read/write.
3. **Local-first 첫 paint firebase 0KB** — `pnpm bundle:check` 가 회귀 차단.
4. **Dogfooding** — `docs/ontology/` 가 프로젝트 자기 자신의 mental model.

### 로컬 개발

```bash
pnpm install
pnpm dev                          # http://localhost:3000
pnpm test:run                     # vitest 100 files / 721 tests
pnpm exec tsc --noEmit
pnpm lint
pnpm build                        # 정적 export → out/
pnpm bundle:check                 # firebase 청크 회귀 차단
```

### 사용자 가시 라우트

| 영역 | 라우트 |
|---|---|
| 시각화 | `/`, `/topology`, `/ontology`, `/ontology/edit`, `/ontology/insights`, `/ontology/relations` |
| 프로젝트 | `/projects`, `/project/[slug]`, `/project/[slug]/edit`, `/project/new` |
| Vault | `/docs` |
| 인증 (옵션) | `/login`, `/signup`, `/account`, `/reset-password` |
| 설정 (cloud) | `/settings`, `/settings/categories`, `/settings/statuses`, `/settings/import` |
