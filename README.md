# ontology-atlas

> **A repo-native memory layer for Claude Code, Cursor, and Codex.**
>
> Your AI coding agent forgets your codebase between sessions. Give it a
> local, git-backed mental model it can read, query, and maintain through MCP.

[![CI](https://github.com/wlsdks/ontology-atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/wlsdks/ontology-atlas/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![MCP](https://img.shields.io/badge/MCP-24_tools-5e6ad2)](mcp/README.md)

| Open it | Link |
|---|---|
| **App brand** | **Ontology Atlas** (repo, CLI, MCP package, and release assets stay `ontology-atlas`) |
| **Website / downloads** | **https://ontology-atlas.web.app** |
| **GitHub repository** | https://github.com/wlsdks/ontology-atlas |
| **MCP docs** | [`mcp/README.md`](mcp/README.md) |

**Ontology Atlas** is the installable macOS app and public product name for the
`ontology-atlas` project. `ontology-atlas` remains the repository, CLI, MCP, and
release-artifact identity.

`ontology-atlas` is a local-first workbench for the shared memory between a
developer and their AI coding agent. The graph is not stored in a hosted
database. It is plain markdown frontmatter inside your repo, so every change is
reviewable as a normal git diff.

```bash
npx ontology-atlas init ./ontology
ontology-atlas analyze . --vault ./ontology
ontology-atlas workspace-brief ./ontology
ontology-atlas health ./ontology
```

No backend. No login. No cloud account. Your repo is the source of truth.

---

## Why It Exists

AI coding agents are useful, but they usually rebuild project context from
scratch every session. They remember the current prompt better than the long
term shape of the codebase: domains, capabilities, dependencies, ownership,
and design decisions.

`ontology-atlas` gives agents a durable local memory they can query before
touching code and update after real changes.

The product is not "please maintain an ontology." The useful loop is:

1. Open a repo.
2. Draft the first graph automatically from source layout, README headings,
   `package.json`, and TS/JS imports.
3. Let the AI agent answer through MCP using the maintained graph.
4. After code work, let the agent propose memory updates.
5. Review the markdown diff.
6. The next agent session starts with better context.

## What It Does

| Surface | What you use it for |
|---|---|
| **macOS app** | Install once, pick a local vault folder, and use the visual tree, topology, docs, projects, and ERD builder without returning to the website. |
| **CLI** | Init a vault, bootstrap from a repo, validate frontmatter, compile graphs, inspect paths, find backlinks, rename/merge/delete nodes safely. |
| **MCP server** | Give Claude Code, Cursor, Codex, and other agents 24 local read/write tools over stdio JSON-RPC. |
| **Website** | Explain the product, show a read-only demo, and route users to the signed macOS release download. |
| **Compiler + query engine** | Turn markdown files into a deterministic graph artifact with `graphHash`, issues, indexes, health checks, impact, lineage, cycles, and maintenance actions. |

## How The Memory Works

In this project, an ontology is the executable meaning model of a product and
the codebase that realizes it: projects, domains, capabilities, elements, and
the relations that explain why they belong together or depend on each other. It
is useful only when planners, marketers, decision-makers, developers, and AI
agents can read the same graph before work, update it after work, and verify it
as a git diff.

The ontology is not a generic slide-deck taxonomy and it is not a raw
source-code index. Business concepts belong when they explain product intent,
operating model, ownership, capability boundaries, decisions, or impact. Source
files belong as `element` nodes when they prove or realize a higher-level
`domain` or `capability`. The daily target is the layer that connects those two
worlds: a durable map of what the business/system means, why it matters, and
which implementation carries it.

Every markdown file is one graph node. Frontmatter is the machine-readable
record; the body is the human-readable explanation.

```yaml
---
slug: capabilities/token-issue
kind: capability
title: Token issue
domain: domains/auth
elements:
  - elements/src/auth/token-service
dependencies:
  - capabilities/session-refresh
---

Issues access and refresh tokens for authenticated users.
```

`compile_ontology` reads the vault and produces a deterministic graph artifact:
canonical nodes, canonical edges, aliases, issues, `graphHash`, `maxMtime`, and
optional query indexes. `query_ontology` then answers graph-style questions
over that artifact: neighbors, paths, centrality, communities, impact, blast
radius, project scope, lineage, cycles, health, agent brief, workspace brief,
and maintenance plan.

That means this is not a server-side graph database. It is a markdown-backed
ontology vault with graph database behavior at runtime.

## Quick Start

### 1. Create a local vault

```bash
npx ontology-atlas init ./ontology
```

The command scaffolds a git-friendly markdown vault and writes repo-local MCP
configs for your agent. Claude Code and Cursor can read the generated
`.mcp.json`; Codex can read the generated `.codex/config.toml`. A global
`codex mcp add ...` fallback is printed too.

Already have a vault? Run `ontology-atlas agent-setup ./ontology --write` to
repair only the agent config files without adding starter markdown.

### 2. Draft the first graph

```bash
ontology-atlas analyze . --vault ./ontology      # preview only
ontology-atlas bootstrap . --vault ./ontology    # write accepted candidates
ontology-atlas workspace-brief ./ontology
```

`analyze` is side-effect-free. It proposes domains, capabilities, elements, and
relations from real repo structure. `infer-imports` can add TS/JS import
evidence for dependency edges.

### 3. Use the visual app

The hosted site is the product introduction and download entry point. Daily
visual editing starts in the installed macOS app: download the signed DMG from
the GitHub Releases page after the release gate publishes it, launch the app,
and pick your local vault folder.

Maintainers can run the desktop shell from source while developing:

```bash
git clone https://github.com/wlsdks/ontology-atlas
cd ontology-atlas
pnpm install
pnpm desktop:dev
```

## Three views plus MCP, one vault

The same frontmatter graph is rendered three ways and exposed to agents through MCP:

- **Topology** (`/topology`) - Sigma WebGL spatial network of projects and relations.
- **Tree** (`/`, `/ontology`) - project to domain to capability to element drill-down.
- **ERD builder** (`/ontology/edit`) - xyflow canvas for adding nodes and relations visually.
- **MCP** (`mcp/`) - JSON-RPC stdio server with 24 tools for AI agents: 16 read + 8 write.

All four read and write the same `.md` files. Pick the interface that matches
the task; the vault stays the source of truth.

## Agent Workflow

Use the graph before code work:

```bash
ontology-atlas workspace-brief ./ontology
ontology-atlas agent-brief ./ontology
ontology-atlas agent-brief ./ontology --graph-db-pack
ontology-atlas overview ./ontology
ontology-atlas backlinks capabilities/token-issue ./ontology
ontology-atlas blast-radius capabilities/token-issue ./ontology
```

`agent-brief` is the Claude Code/Codex handoff: readiness score, graph
entrypoints, first MCP calls, investigation playbooks, write guardrails,
`relation_check` decision guide, health coverage, and the read-first write
policy. `agent-brief --graph-db-pack` prints a shell-pasteable graph scan pack
for connector-less sessions, with the selected vault path already inserted.
`workspace-brief` is the cheap first-contact dashboard:
it shows hotspots,
`PROJECT별 포함 노드 수 (project_scope)`, health-check coverage as
`id:status:count`, and growth counts before the agent chooses where to read
deeper.

Then let the agent sync memory after non-trivial changes:

- New code capability: add a `kind: capability` node.
- New concrete file/module worth tracking: add a `kind: element` node.
- New dependency: add a relation.
- Rename or merge: use the safe dry-run commands first, then confirm.

Manual editing is allowed, but the product bet is automation: bootstrap first,
agent-maintained memory after that.

## Web Routes

| Route | Purpose |
|---|---|
| `/` | Hosted landing page, or local ontology hub inside the installed app after a vault is selected |
| `/download` | macOS release download and install guide |
| `/docs` | Desktop local vault picker, markdown editor, command palette |
| `/ontology` | Tree and ego graph hub |
| `/ontology/edit` | ERD canvas builder |
| `/ontology/insights` | Kind census, hubs, relation breakdown |
| `/topology` | Spatial graph view |
| `/projects` | Project list from `kind: project` docs |
| `/project/[slug]` | Project detail (inline edit when a local vault is loaded) |
| `/project/[slug]/edit` | Full project editor |
| `/project/new` | New project form |
| `/project/fallback` | Static-export fallback for unknown project slugs |

The public website is a static promo/download site with a read-only demo. Real
vault editing happens in the installed macOS app after it receives permission
to access a local folder on your machine.

## Verifiable promises

| Promise | How this repo checks it |
|---|---|
| **No backend** | `pnpm bundle:check` keeps Firebase/server chunks out of landing, download, and local-first app routes. |
| **Static deploy** | `pnpm build` exports to `out/`; Firebase Hosting serves only static files. |
| **Static dogfood manifest** | `pnpm docs-vault:check` keeps committed `src/entities/docs-vault/data/manifest.json` and `public/docs-vault/` in sync with `docs/`. |
| **Vault integrity** | `pnpm vault:validate`, `test:vault:validate`, `vault:audit`, and `test:vault:audit` run in CI. |
| **MCP/CLI contracts** | `pnpm test:cli:args`, `pnpm test:mcp:docs`, `pnpm package:check`, `pnpm test:contracts`, and focused `test:mcp:*` scripts cover the agent surface. |
| **Graph hot paths** | `pnpm perf:graph:check` is part of `pnpm package:check`, so compile/query latency budgets run before release. |
| **Dogfooding** | This repo's own vault has **98 nodes**: capabilities 33, document 1, domains 6, elements 56, project 1, vault-readme 1. |

For the detailed maintainer command matrix, see
[`docs/DEVELOPMENT-CHECKS.md`](docs/DEVELOPMENT-CHECKS.md).

## Local Development

```bash
pnpm install
pnpm dev
pnpm exec tsc --noEmit
pnpm lint
pnpm test:run
pnpm build
pnpm docs-vault:check
pnpm bundle:check
```

Helpful vault commands:

```bash
pnpm vault:validate
pnpm vault:audit
pnpm dogfood:compile
pnpm dogfood:compile-fix
pnpm dogfood:compile-fix -- --help
pnpm test:dogfood:args
pnpm test:dogfood:script-refs
pnpm test:dogfood:compile-fix
pnpm dogfood:health
pnpm dogfood:agent
pnpm dogfood:agent-graph-db-pack
pnpm dogfood:agent-setup-gate
pnpm dogfood:agent-fallbacks
pnpm dogfood:brief
pnpm dogfood:status
pnpm dogfood:status -- --help
pnpm test:dogfood:status
pnpm dogfood:verify
```

### Vault tooling

The vault tooling is intentionally local and scriptable:

```bash
pnpm vault:validate              # frontmatter integrity audit
pnpm vault:validate /your/vault  # validate any folder
pnpm vault:validate -- --help    # print validator usage without scanning
pnpm test:vault:validate         # focused validator CLI argument contract
pnpm docs-vault:check            # committed docs-vault output freshness
pnpm vault:audit                 # dogfood ontology paths match real repo files
pnpm test:vault:audit            # focused vault audit CLI argument contract
```

CI runs `pnpm docs-vault:check`, `pnpm vault:validate`, `pnpm test:vault:validate`,
`pnpm vault:audit`, `pnpm test:vault:audit`, and `pnpm package:check` on every PR.

## Architecture

| Area | Stack |
|---|---|
| App | Next.js 16, React 19, TypeScript 5, App Router, static export, Tauri macOS shell |
| UI | Tailwind CSS 4, Radix primitives, lucide icons |
| Graph | Sigma.js, Graphology, ForceAtlas2, xyflow |
| Local-first | Tauri native vault bridge, source-browser File System Access fallback, IndexedDB handle/path persistence |
| Agent interface | `@modelcontextprotocol/sdk`, stdio JSON-RPC |
| Tests | Vitest, Testing Library, jsdom, Playwright, Node test runner |

Feature-Sliced Design import direction is enforced by ESLint:

```text
app -> views -> widgets -> features -> entities -> shared
```

## Documentation

| Document | Use it for |
|---|---|
| [`docs/PRODUCT-DIRECTION.md`](docs/PRODUCT-DIRECTION.md) | Product strategy and launch framing |
| [`docs/AGENT-MEMORY-POSITIONING.md`](docs/AGENT-MEMORY-POSITIONING.md) | Why this is agent memory, not an ontology editor |
| [`docs/AGENT-GRAPH-WORKFLOW.md`](docs/AGENT-GRAPH-WORKFLOW.md) | CLI-only vs MCP-connected graph workflows, graph DB differences, and verification evidence |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Current CLI, MCP, and web feature inventory |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Local-first architecture and data flow |
| [`docs/DEVELOPMENT-CHECKS.md`](docs/DEVELOPMENT-CHECKS.md) | Maintainer verification and release checks |
| [`mcp/README.md`](mcp/README.md) | MCP registration and tool contracts |
| [`cli/README.md`](cli/README.md) | CLI commands and examples |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Contribution workflow |

## Contributing

Issues and PRs are welcome. The most useful feedback right now is practical:

- Try `npx ontology-atlas init` in a real repo.
- Connect an AI coding agent through MCP and note where the memory helps or fails.
- Bring a messy markdown vault and report where validation or bootstrap is confusing.

Before contributing, read [`AGENTS.md`](AGENTS.md). It is the canonical guide
for both humans and AI agents working in this repo.

## License

MIT. See [`LICENSE`](LICENSE).

---

## 한국어 가이드

`ontology-atlas`는 Claude Code, Cursor, Codex 같은 AI coding agent가
코드베이스의 장기 맥락을 잃지 않도록 돕는 local-first memory layer입니다.

핵심은 간단합니다.

- markdown frontmatter가 그래프입니다.
- git repo가 진실원입니다.
- 백엔드, 로그인, DB가 없습니다.
- 개발자와 AI agent가 같은 `.md` vault를 읽고 씁니다.

빠른 시작:

```bash
npx ontology-atlas init ./ontology
ontology-atlas analyze . --vault ./ontology
ontology-atlas bootstrap . --vault ./ontology
ontology-atlas workspace-brief ./ontology
ontology-atlas agent-brief ./ontology
ontology-atlas agent-brief ./ontology --graph-db-pack
```

시각 편집은 설치된 macOS 앱에서 시작합니다. 웹 사이트는 제품 소개와
다운로드 진입점이고, 실제 vault 폴더 열기와 저장은 앱 안에서 이뤄집니다.
개발 중 데스크톱 shell 을 소스에서 실행하려면:

```bash
pnpm install
pnpm desktop:dev
```

제품의 목표는 “온톨로지를 손으로 관리하게 만드는 도구”가 아닙니다. 목표는
repo를 열면 초안을 만들고, agent가 작업 후 mental model 업데이트를 제안하고,
사용자가 diff처럼 승인하고, 다음 agent 작업에서 바로 더 나은 맥락을 느끼는
루프입니다.
