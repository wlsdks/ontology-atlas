---
title: Architecture
tags: [architecture, infra, overview]
---

# Architecture

> 2026-05-18 update — the current architecture is a local-first, git-backed
> memory layer for AI coding agents. Round 10 permanently removed all auth +
> cloud surface; later rounds added deterministic graph compilation,
> graph-engine queries, health/workspace briefs, bootstrap analysis, and import
> inference. Earlier cloud-mode design notes are in `docs/archive/`.

## High-level shape

```
┌────────────────────────────────────────────────────────┐
│ User                                                    │
│ ├─ /                       ontology hub (when vault    │
│ │                          loaded) / landing (else)    │
│ ├─ /topology               Sigma WebGL spatial map     │
│ ├─ /docs                   vault picker + editor       │
│ ├─ /ontology               tree + ego graph            │
│ ├─ /ontology/edit          xyflow ERD builder          │
│ ├─ /ontology/insights      graph census + hubs + edges │
│ ├─ /projects               project list                │
│ └─ /project/[slug]         project detail              │
├────────────────────────────────────────────────────────┤
│ App layer                                               │
│ ├─ Next.js 16 App Router                               │
│ ├─ next-intl /[locale]/ (en, ko)                       │
│ ├─ output: 'export'  (static)                          │
│ └─ TaxonomyProvider · ToastProvider · MotionProvider   │
├────────────────────────────────────────────────────────┤
│ Data sources (mode-aware)                               │
│ ├─ vault           File System Access API → user disk  │
│ │                  (`src/features/docs-vault-local/`)  │
│ └─ static          build-time dogfood manifest         │
│                    (`docs/ontology/` → JSON import)    │
└────────────────────────────────────────────────────────┘

       ↑ stdio JSON-RPC

┌────────────────────────────────────────────────────────┐
│ MCP server (mcp/, v0.12.0)                              │
│ ├─ 15 read tools  list/get/find/query/validate ·        │
│ │                  compile_ontology · query_ontology ·  │
│ │                  analyze_repo_structure · infer_imports│
│ └─ 8 write tools  add_concept · add_concepts ·          │
│                    add_relation · add_relations ·       │
│                    patch_concept · delete_concept ·     │
│                    rename_concept · merge_concepts      │
│                                                         │
│ AI agent (Claude Code, Cursor, …) reads/writes the     │
│ same vault directory the user picked in /docs.         │
│ compile_ontology builds the deterministic artifact;     │
│ query_ontology answers graph-database-like questions    │
│ over that artifact without introducing a server DB.     │
└────────────────────────────────────────────────────────┘

       ↑ stdio JSON-RPC (separate process)

┌────────────────────────────────────────────────────────┐
│ CLI (cli/, v0.11.0 — 40 commands)                      │
│ ├─ init/add/import/list/find/validate/query            │
│ ├─ mcp-verify/analyze/infer-imports/bootstrap/compile  │
│ └─ graph CRUD + deep dive commands                     │
│                                                         │
│ Developer-primary daily entry point. Same `.md` files. │
└────────────────────────────────────────────────────────┘
```

There is no backend, no server database, no auth provider. The user's markdown
folder is the single source of truth. Both the MCP server (AI agent) and the
CLI (developer) read/write that single source.

The graph-database behavior is runtime computation, not a separate persistence
layer. `compile_ontology` turns markdown frontmatter into a deterministic graph
artifact; `query_ontology` runs graph operations over that artifact; confirmed
write tools persist changes back to markdown.

## FSD layers

```
src/
├── app/        providers, init code
├── views/      page-level components (1 view per route or group)
├── widgets/    composite UI blocks (sigma, drawer, palette, …)
├── features/   single interaction units (form, picker, search, …)
├── entities/   business entities (project, ontology-class, …)
└── shared/     UI primitives, lib helpers, config, types
```

**Import direction**: `app → views → widgets → features → entities → shared`. ESLint blocks the reverse.

The directory layout is enforced by `eslint-plugin-boundaries` in `eslint.config.mjs`.

## Data flow

### Vault graph lifecycle

1. Markdown files are loaded from the vault folder.
2. Frontmatter is parsed into typed nodes and graph relations.
3. `compile_ontology` canonicalizes nodes/edges, aliases, issues,
   graph-array canonicalization actions, stable `graphHash`, and optional
   query indexes.
4. `query_ontology` serves graph operations such as `neighbors`, `path`,
   `project_scope`, `blast_radius`, `cycles`, `maintenance_plan`,
   `workspace_brief`, and `health`.
5. Write tools mutate markdown only after explicit add/patch/relation/rename/
   merge/delete calls. Analysis tools such as `analyze_repo_structure` and
   `infer_imports` are side-effect-free candidate generators.

### Vault mode (user picked a markdown folder)

1. `useLocalVault()` returns `{ status: 'loaded', handle, manifest }`.
2. `useDataSourceMode()` returns `'local'`.
3. `useProjects()` derives projects from `manifest.docs` (filter `kind: project`).
4. `useOntologyInsight()` derives ontology nodes/edges from vault frontmatter.
5. Mutations (`useProjectMutations.updateProject`) write directly to `.md`
   files via the File System Access API.

The MCP server is independent: it reads the same vault directory through the
filesystem (Node.js `fs`), not the browser FS API. AI agents and the web UI
end up with the same view.

### Static mode (no vault picked)

1. `useLocalVault()` returns `{ status: 'closed' }`.
2. `useDataSourceMode()` returns `'static'`.
3. `useProjects()` derives projects from the build-time dogfood manifest
   (`docs/ontology/` compiled into `src/entities/docs-vault/data/manifest.json`
   by `pnpm docs-vault:build`).
4. Mutations are blocked with a toast pointing to the vault picker.

This is the "first impression" state — visitors see a real ontology
(this project's own dogfood) immediately, before they pick a folder.

## Routes

```
/                          ontology hub when vault loaded; landing when not
/topology                  topology view (Sigma WebGL)
/docs                      vault picker / editor / unified palette
/ontology                  tree + ego graph
/ontology/edit             ERD canvas builder (xyflow)
/ontology/insights         graph insights (kind dist · hubs · edge types)
/projects                  project list (cards)
/project/[slug]            project detail (inline edit when vault loaded)
/project/[slug]/edit       full project editor
/project/new               new project form
/project/fallback          fallback page for missing slugs
```

All routes are wrapped under `/[locale]/` by next-intl (en, ko).

> Removed in earlier rounds: `/admin/*`, `/review/*`, `/diagnostics/*`,
> `/knowledge/*`. Removed in Round 10: `/login`, `/signup`, `/account`,
> `/reset-password`, `/settings/*`.

## Build pipeline

```bash
pnpm docs-vault:build      # docs/ontology/*.md → src/entities/docs-vault/data/manifest.json
pnpm docs-vault:check      # verify committed docs-vault outputs are fresh (CI gate)
pnpm build                 # next build → static export → out/
pnpm bundle:check          # verifies firebase SDK chunk = 0 across user-facing routes
pnpm vault:validate        # R11+ — frontmatter integrity + graph array drift (CI gate)
pnpm test:vault:validate   # focused validator CLI argument contract (CI gate)
pnpm vault:audit           # dogfood ontology capability/element paths exist in repo
pnpm test:vault:audit      # focused vault audit CLI argument contract (CI gate)
pnpm package:check         # MCP/CLI package files contract + self-test (CI gate)
pnpm test:contracts        # focused cross-package parser/schema/validator contracts
pnpm vault:migrate --list  # R11 — schema migration runner (dry-run default)
```

The `docs-vault:build` step is automatic via `predev` and `prebuild` npm hooks. `docs-vault:check`, `vault:validate`, `test:vault:validate`, `vault:audit`, `test:vault:audit`, and `package:check` run in CI on every PR (`.github/workflows/ci.yml`).

## i18n routing contract

- In-app navigation: `Link`, `useRouter`, `usePathname` from `@/i18n/navigation` (locale-aware).
- Locale-agnostic browser history: `useSearchParams` from `next/navigation` (no locale concern).
- Cross-locale pivot (LocaleSwitch): raw `next/navigation` router, intentional.
- Translation key namespaces: see `messages/{en,ko}.json` (kept in parity).

## Test surface

- **Vitest** (`tests/` + co-located `*.test.ts`) — unit + component
- **Playwright** (`tests/e2e/*.spec.ts`) — visual regression, a11y, navigation, mobile

E2E tests no longer rely on Firebase emulators (R10b removed firebase-tools
and emulator scripts entirely).

## Source-of-truth files

When docs and code disagree, code wins:

- `package.json` — what's installed, what scripts exist
- `next.config.ts` — output mode, image config
- `app/layout.tsx` — metadata, providers, head
- `eslint.config.mjs` — FSD boundary rules

Long-form docs:

- [`AGENTS.md`](../AGENTS.md) — contributor guide (canonical for AI tools)
- [`PRODUCT-DIRECTION.md`](./PRODUCT-DIRECTION.md) — mission
- [`FEATURES.md`](./FEATURES.md) — currently shipping features
- [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) — design tokens + forbidden patterns
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — static export → static hosting
- [`CHANGELOG.md`](./CHANGELOG.md) — chronological user-visible changes
- [`docs/archive/`](./archive/) — historical analysis docs (earlier cloud-mode designs, retired surfaces)
