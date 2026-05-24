# Documentation Guide

> Current as of 2026-05-18. This repository moves quickly; when a document and
> code disagree, trust `package.json`, `next.config.ts`, `app/[locale]/layout.tsx`,
> `mcp/src/index.js`, `mcp/src/ontology-engine.mjs`, and `cli/src/index.mjs` first.

`oh-my-ontology` is now best described as a **repo-native memory layer for
Claude Code, Cursor, and Codex**. The ontology is not a separate SaaS database.
It is a local, git-backed markdown vault that an AI coding agent can read,
query, and maintain through MCP.

## Current Canon

| Document | Use it for | Status |
|---|---|---|
| [`../README.md`](../README.md) | Public overview, quick start, workflows, verification promises | Canonical public entry |
| [`PRODUCT-DIRECTION.md`](PRODUCT-DIRECTION.md) | Product strategy, audience, launch framing, success criteria | Canonical strategy |
| [`AGENT-MEMORY-POSITIONING.md`](AGENT-MEMORY-POSITIONING.md) | Why the product should be sold as agent memory, not ontology editing | Canonical positioning note |
| [`FEATURES.md`](FEATURES.md) | Complete inventory of shipping CLI, MCP, and web surfaces | Canonical feature inventory |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Local-first architecture, route/data flow, build/test pipeline | Canonical technical overview |
| [`DEVELOPMENT-CHECKS.md`](DEVELOPMENT-CHECKS.md) | Maintainer verification, package checks, dogfood release gates | Canonical maintainer checks |
| [`../mcp/README.md`](../mcp/README.md) | MCP registration, 23 tools, tool contracts, verification | Canonical agent interface |
| [`../cli/README.md`](../cli/README.md) | CLI commands, graph workflows, installed-package checks | Canonical developer terminal interface |
| [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) | Visual language, tokens, forbidden patterns | Canonical UI style guide |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Static export deployment | Current, small |
| [`CHANGELOG.md`](CHANGELOG.md) | Chronological user-visible changes | Historical ledger |
| [`BACKLOG.md`](BACKLOG.md) | Working queue and deferred questions | Operational, may be noisy |

## What Is Normative

The normative product model is:

1. **One codebase, one ontology, developer and AI agent grow it together.**
2. The vault's `.md` frontmatter is the graph. The markdown body is the human
   explanation. Git is the source of truth.
3. The AI-agent surface is MCP: 23 tools, read/write, local-only, no backend.
4. The developer surface is the CLI: 42 commands for scaffold, import,
   validation, compile, agent handoff, graph queries, dashboard facets, relation schema scans,
   connected island checks, prerequisite ordering, growth/maintenance, and safe
   graph edits.
5. The web surface is a local workbench: docs editor, topology, tree, ERD
   builder, insights.
6. The product promise is durable coding-agent memory, not a manual ontology
   editor.

## What Is Historical

`docs/archive/` contains useful design history, but it is not normative for the
current product. In particular, earlier cloud/auth/PM-primary/knowledge-review
directions were removed or demoted. If an archived doc conflicts with current
README, PRODUCT-DIRECTION, FEATURES, ARCHITECTURE, MCP README, or CLI README,
the current docs win.

## Update Rules

When changing behavior, update docs in this order:

1. Public behavior: `README.md` and `FEATURES.md`.
2. Product direction or launch wording: `PRODUCT-DIRECTION.md` and
   `AGENT-MEMORY-POSITIONING.md`.
3. MCP tool behavior: `mcp/README.md` plus focused MCP docs tests.
4. CLI behavior: `cli/README.md` plus focused CLI/package tests.
5. Architecture or routing: `ARCHITECTURE.md`.
6. User-visible release notes: `CHANGELOG.md`.
7. Future work or queue changes: `BACKLOG.md`.

Before claiming docs are current, run at least:

```bash
pnpm test:mcp:docs
pnpm exec tsc --noEmit
```

Use broader checks such as `pnpm test:contracts`, `pnpm package:check`, or
`pnpm dogfood:verify` when schema, MCP, CLI, or packaging behavior changes.
Keep those detailed maintainer-only matrices in `DEVELOPMENT-CHECKS.md`, not
in the public README.
