# Documentation Guide

이 폴더는 **Ontology Atlas 를 만드는 사람들이 쓰는 기술 문서 모음**입니다. 제품이
무엇인지 알고 싶어서 들어오셨다면 이 목록이 아니라 **지도** 화면을 먼저 보세요 —
제품이 어떤 영역으로 나뉘고 각 영역에 무엇이 들어 있는지 그림 한 장으로 보여 줍니다.
아래 표는 "어떤 주제를 어느 문서에서 찾는가" 를 정리한 색인입니다.

**This folder is the working documentation for people building Ontology Atlas.**
If you came here to learn what the product is, open the **Map** screen instead —
this list is an index of engineering references, not a product introduction. The
table below says which document answers which question.

> Current as of 2026-05-18. This repository moves quickly; when a document and
> code disagree, trust `package.json`, `next.config.ts`, `app/[locale]/layout.tsx`,
> `mcp/src/index.js`, `mcp/src/ontology-engine.mjs`, and `cli/src/index.mjs` first.

## How the product is positioned

`ontology-atlas` is now best described as a **repo-native memory layer for
Claude Code, Cursor, and Codex**. The ontology is not a separate SaaS database.
It is a local, git-backed markdown vault that an AI coding agent can read,
query, and maintain through MCP.

The code-facing promise is intentionally narrow: Atlas does not replace
CodeGraph, Serena, grep, AST indexes, language servers, or source search. It preserves the meaning layer
those tools cannot infer alone: which domain or capability a code artifact
proves, why a change matters, and which validation path an agent should run
before trusting the result.

The minimum supported setup is also narrow: plain Claude Code or Codex connected
to Atlas MCP/CLI must be enough to use the product. Extra source-intelligence
tools can accelerate lookup, but they cannot be required for onboarding,
workspace briefs, graph health, handoff packets, or memory update diffs.

## Current Canon

| Document | Use it for | Status |
|---|---|---|
| [`../README.md`](../README.md) | Public overview, quick start, workflows, verification promises | Canonical public entry |
| [`PRODUCT-OWNER-OPERATING-SYSTEM.md`](PRODUCT-OWNER-OPERATING-SYSTEM.md) | Mandatory PO gate, product decision rules, agent implementation contract | Canonical product-operating gate |
| [`PRODUCT-DESIGN-OPERATING-SYSTEM.md`](PRODUCT-DESIGN-OPERATING-SYSTEM.md) | Mandatory design council gate for UI hierarchy, graph readability, responsive behavior, macOS proof, and MCP/CLI handoff | Canonical product-design gate |
| [`PRODUCT-DIRECTION.md`](PRODUCT-DIRECTION.md) | Product strategy, audience, launch framing, success criteria | Canonical strategy |
| [`AGENT-MEMORY-POSITIONING.md`](AGENT-MEMORY-POSITIONING.md) | Why the product should be sold as agent memory, not ontology editing | Canonical positioning note |
| [`AGENT-GRAPH-WORKFLOW.md`](AGENT-GRAPH-WORKFLOW.md) | How to use the local graph with CLI-only workflows, MCP-connected agents, graph-DB-style query packs, and actual verification evidence | Canonical user-facing workflow |
| [`FEATURES.md`](FEATURES.md) | Complete inventory of shipping macOS app, CLI, MCP, and website surfaces | Canonical feature inventory |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Local-first architecture, route/data flow, build/test pipeline | Canonical technical overview |
| [`DEVELOPMENT-CHECKS.md`](DEVELOPMENT-CHECKS.md) | Maintainer verification, package checks, dogfood release gates | Canonical maintainer checks |
| [`DESKTOP-MACOS.md`](DESKTOP-MACOS.md) | macOS desktop app track, readiness gate, first Tauri prototype scope | Current distribution track |
| [`../mcp/README.md`](../mcp/README.md) | MCP registration, 32 tools, tool contracts, verification | Canonical agent interface |
| [`../cli/README.md`](../cli/README.md) | CLI commands, graph workflows, installed-package checks | Canonical developer terminal interface |
| [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) | Visual language, tokens, forbidden patterns | Canonical UI style guide |
| [`MAP-TESTABILITY.md`](MAP-TESTABILITY.md) | Observing the canvas map from outside (`?e2e=1` → `window.__atlasMap`), and the measurement discipline that a 2026-07-31 six-false-negative incident produced | Canonical map test surface |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Static export deployment | Current, small |
| [`CHANGELOG.md`](CHANGELOG.md) | Chronological user-visible changes | Historical ledger |
| [`BACKLOG.md`](BACKLOG.md) | Working queue and deferred questions | Operational, may be noisy |

## What Is Normative

The normative product model is:

1. **One codebase, one ontology, developer and AI agent grow it together.**
2. The vault's `.md` frontmatter is the graph. The markdown body is the human
   explanation. Git is the source of truth.
3. The AI-agent surface is MCP: 32 tools, read/write, local-only, no backend.
4. The developer surface is the CLI: 52 commands for scaffold, import,
   validation, compile, agent handoff, live activity heartbeat, graph queries, dashboard facets, relation schema scans,
   connected island checks, prerequisite ordering, growth/maintenance, commit
   preflight, git snapshot commits, and safe graph edits.
5. The installed macOS app is the local workbench: Docs source editing,
   Topology + INDEX inspection, Workshop relation writing, five-question
   Insights maintenance, Projects, and Git history. The hosted website is the
   read-only dogfood map plus download/source entry.
6. The product promise is durable coding-agent memory, not a manual ontology
   editor.
7. Atlas stores meaningful implementation evidence, not exhaustive code facts.
   Structural code tools find symbols and callers; Atlas gives humans and AI
   agents the task starting point, product meaning, impact boundary, and
   verification path.
8. User-facing graph workflow docs must explain what works without MCP, what
   MCP adds, how the local graph differs from a graph database, and which
   commands prove the setup on the current machine.

## What Is Historical

`docs/archive/` contains useful design history, but it is not normative for the
current product. In particular, earlier cloud/auth/PM-primary/knowledge-review
directions were removed or demoted. If an archived doc conflicts with current
README, PRODUCT-DIRECTION, FEATURES, ARCHITECTURE, MCP README, or CLI README,
the current docs win.

## Update Rules

When changing behavior, update docs in this order:

1. Product decision shape: `PRODUCT-OWNER-OPERATING-SYSTEM.md`.
2. Product design shape: `PRODUCT-DESIGN-OPERATING-SYSTEM.md` and
   `DESIGN-SYSTEM.md`.
3. Public behavior: `README.md` and `FEATURES.md`.
4. Product direction or launch wording: `PRODUCT-DIRECTION.md` and
   `AGENT-MEMORY-POSITIONING.md`.
5. MCP tool behavior: `mcp/README.md` plus focused MCP docs tests.
6. CLI behavior: `cli/README.md` plus focused CLI/package tests.
7. Architecture or routing: `ARCHITECTURE.md`.
8. User-visible release notes: `CHANGELOG.md`.
9. Future work or queue changes: `BACKLOG.md`.

Before claiming docs are current, run at least:

```bash
pnpm test:mcp:docs
pnpm exec tsc --noEmit
```

Use broader checks such as `pnpm test:contracts`, `pnpm package:check`, or
`pnpm dogfood:verify` when schema, MCP, CLI, or packaging behavior changes.
Keep those detailed maintainer-only matrices in `DEVELOPMENT-CHECKS.md`, not
in the public README.
