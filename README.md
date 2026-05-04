# oh-my-ontology

> **One codebase, one ontology, that the developer and their AI agent grow together.**
>
> Local-first markdown vault. Developer authors via CLI / web UI / (planned) VSCode plugin.
> AI agent (Claude Code, Cursor) reads + writes the same `.md` files via MCP — 14 tools.
> No backend. No login. The git repo is the source of truth.

[![CI](https://github.com/wlsdks/oh-my-ontology/actions/workflows/ci.yml/badge.svg)](https://github.com/wlsdks/oh-my-ontology/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built with Next.js](https://img.shields.io/badge/Built_with-Next.js-000?logo=next.js)](https://nextjs.org)
[![MCP server](https://img.shields.io/badge/MCP-14_tools-5e6ad2)](mcp/README.md)

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
   `.md` files. The developer authors via CLI / web UI / (planned) VSCode
   plugin; the AI agent reads + writes via MCP. Same git repo, same diff.
3. **MCP server gives the AI its only interface** — **14 tools** (8 read +
   6 write) over JSON-RPC. The agent doesn't need to "ingest your codebase";
   it reads the ontology the developer already curates.

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
the 14 MCP tools — it needs ground-truth structure to give better answers,
and without a developer maintaining it, the ontology rots. PM/designer
friendliness is a side effect of plain markdown, not a target.

## Three views, one vault

The same frontmatter graph rendered three ways:

- **Topology** (`/topology`) — Sigma WebGL spatial network of projects
- **Tree** (`/`, `/ontology`) — hierarchical drill-down (project → domain → capability → element)
- **ERD builder** (`/ontology/edit`) — xyflow canvas to add nodes and relations visually
- **MCP** (separate package) — JSON-RPC over stdio, 14 tools

All four read and write the same `.md` files. Pick whichever view fits
the moment.

## Quick start

### Just AI agents (no UI)

```bash
npx oh-my-ontology init ./vault
# Open ./vault/.mcp.json.example, copy into your MCP config (Claude Code, Cursor)
# Set OMOT_VAULT to /absolute/path/to/your/vault
# Restart the agent — 14 oh-my-ontology tools become available
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
pnpm vault:migrate --list        # see registered schema migrations
pnpm vault:migrate <id>          # dry-run a migration (default — no disk writes)
pnpm vault:migrate <id> --write  # apply a migration to disk
```

CI runs `pnpm vault:validate` on every PR. The `LocalVaultPicker` shows a
chip when your vault has frontmatter issues so you know which docs aren't
becoming graph nodes.

## Verifiable promises

| Promise | Verification |
|---|---|
| **vault frontmatter = the graph** (no review queue, no LLM extraction) | `grep -r "extractionJob" src/ → 0` |
| **AI agent partner via MCP** | `mcp/` package, 14 tools, `mcp/scripts/verify.mjs` smoke |
| **No backend** (Firebase / DB / auth) | `pnpm bundle:check` — firebase SDK chunk 0 (deps removed in R10) |
| **Dogfooding** | `docs/ontology/` is the project's own curated mental model (~21 nodes — domains 6 · capabilities 9 · elements 4 · project 1 · vault-readme 1). |
| **AI agent quality measurement** *(cross-agent, n=1 confirmed + 1 unmeasurable)* | [`docs/benchmark/`](docs/benchmark/) — 7 tasks × 3 categories × 2 agents. **Claude Code**: MCP-on cuts hallucinations 9 → 0, Cat A correctness +1.0 ([results](docs/benchmark/results/2026-05-04-claude-code.md)). **Codex**: `codex exec` (non-interactive) structurally default-denies MCP tool calls regardless of `--sandbox` setting — needs interactive mode or explicit bypass to genuinely measure ([results](docs/benchmark/results/2026-05-04-codex.md)). |

## Architecture

- **Framework**: Next.js 16 App Router, `output: 'export'` (static)
- **i18n**: next-intl 4.11 with `/[locale]/` URL prefix (en / ko)
- **Visualization**: Sigma.js (WebGL) + Graphology + ForceAtlas2 + xyflow + dagre
- **Local-first**: File System Access API + IndexedDB
- **AI agent surface**: `mcp/` MCP server, stdio JSON-RPC, 14 tools
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
mcp/            MCP server (`oh-my-ontology-mcp`, 14 tools)
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

> 사람과 AI agent 가 같이 키우는 local-first codebase ontology workbench.
> markdown frontmatter 가 곧 그래프. 백엔드 / 로그인 0.

### 30초 시작

```bash
npx oh-my-ontology init my-vault
cd my-vault
# project.md 와 domains/example.md 를 본인 환경에 맞게 수정
# .mcp.json.example 을 AI agent (Claude Code 등) 의 MCP 설정으로 복사
```

자세한 시작 가이드:
- [`AGENTS.md`](AGENTS.md) — contributor (사람·AI 공통) 가이드
- [`docs/PRODUCT-DIRECTION.md`](docs/PRODUCT-DIRECTION.md) — mission spec
- [`docs/FEATURES.md`](docs/FEATURES.md) — 사용자 가시 기능 전수
- [`mcp/README.md`](mcp/README.md) — MCP 서버 등록 + 14 도구

### 핵심 약속

1. **vault frontmatter = 그래프** — 검수 큐 / 추출 워커 없음. frontmatter 자기-승인.
2. **AI agent partner** — MCP 서버 (read 8 + write 6) 로 같은 vault read/write.
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
| 시각화 | `/`, `/topology`, `/ontology`, `/ontology/edit`, `/ontology/insights`, `/ontology/relations` |
| 프로젝트 | `/projects`, `/project/[slug]`, `/project/[slug]/edit`, `/project/new` |
| Vault | `/docs` |

> R10 (2026-05): `/login`, `/signup`, `/account`, `/reset-password`, `/settings/*` 영구 제거. 미래 cloud collab 단계가 다시 도입될 때 인증 surface 새로 디자인.
