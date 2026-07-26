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
│ ├─ /                       topology hub always (map +  │
│ │                          INDEX + datasheet); no vault│
│ │                          → dogfood sample + first-run│
│ ├─ /topology               same hub, explicit entry     │
│ ├─ /docs                   vault picker + editor       │
│ ├─ /ontology               thin redirect → /topology   │
│ ├─ /ontology/edit          xyflow ERD builder          │
│ ├─ /ontology/studio        game "강화" enhancement screen│
│ ├─ /ontology/insights      graph census + hubs + edges │
│ ├─ /projects               project list                │
│ └─ /project/[slug]         project detail              │
├────────────────────────────────────────────────────────┤
│ App layer                                               │
│ ├─ Next.js 16 App Router                               │
│ ├─ next-intl /[locale]/ (en, ko)                       │
│ ├─ output: 'export'  (static)                          │
│ ├─ Tauri macOS shell (installed local workbench)        │
│ └─ TaxonomyProvider · ToastProvider · MotionProvider   │
├────────────────────────────────────────────────────────┤
│ Data sources (mode-aware)                               │
│ ├─ vault           Tauri native bridge → user disk      │
│ │                  (source browser dev can use FSA)     │
│ │                  (`src/features/docs-vault-local/`)  │
│ └─ static          build-time dogfood manifest         │
│                    (`docs/ontology/` → JSON import)    │
└────────────────────────────────────────────────────────┘

       ↑ stdio JSON-RPC

┌────────────────────────────────────────────────────────┐
│ MCP server (mcp/, v0.13.0)                              │
│ ├─ 19 read tools  connection/git proof · list/get/find ·│
│ │                  compile_ontology · query_ontology ·  │
│ │                  analyze_repo_structure · infer_imports│
│ └─ 13 write tools add_concept · add_concepts ·          │
│                    add_relation · add_relations ·       │
│                    remove/replace relation · patch ·    │
│                    reclassify · delete/rename/merge ·   │
│                    absorb_document · git_snapshot       │
│                                                         │
│ AI agent (Claude Code, Cursor, …) reads/writes the     │
│ same vault directory the user picked in /docs.         │
│ compile_ontology builds the deterministic artifact;     │
│ query_ontology answers graph-database-like questions    │
│ over that artifact without introducing a server DB.     │
└────────────────────────────────────────────────────────┘

       ↑ stdio JSON-RPC (separate process)

┌────────────────────────────────────────────────────────┐
│ CLI (cli/, v0.11.0 — 52 commands)                      │
│ ├─ init/agent-activity/add/import/list/find/validate/query│
│ ├─ mcp-verify/analyze/infer-imports/bootstrap/compile  │
│ ├─ preflight (commit preflight + pre-commit hook)      │
│ └─ graph CRUD + deep dive commands                     │
│                                                         │
│ Developer-primary daily entry point. Same `.md` files. │
└────────────────────────────────────────────────────────┘
```

There is no backend, no server database, no auth provider. The user's markdown
folder is the single source of truth. Both the MCP server (AI agent) and the
CLI (developer) read/write that single source.

The public app/website brand is **Ontology Atlas**. The macOS app bundle,
bundle identifier, and DMG assets use the Ontology Atlas identity, while the
repo, CLI binary, and MCP package remain under `ontology-atlas`, so product
naming does not imply a backend, Firebase data dependency, or package rename.

The graph-database behavior is runtime computation, not a separate persistence
layer. `compile_ontology` turns markdown frontmatter into a deterministic graph
artifact; `query_ontology` runs graph operations over that artifact; confirmed
write tools persist changes back to markdown.

## FSD layers

```
src/
├── app/        providers, init code
├── views/      page-level components (1 view per route or group)
├── widgets/    composite UI blocks (topology-map-v2, drawer, palette, …)
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
   files — the installed desktop app uses the Tauri native vault bridge,
   hosted web uses the browser File System Access API directly (root-first-open,
   2026-07: `FirstRunStarterModule` in the topology hub's INDEX panel calls
   `useLocalVault().open()` on `/` itself, no install required). `/docs`'s own
   separate local-source tab (browsing a second vault as a documentation
   source inside that page) stays desktop-gated — that is a narrower, older
   feature unrelated to opening your primary vault from the map.
6. Ontology block import/export follows the same split: browser
   `showDirectoryPicker()` or the Tauri `FileSystemDirectoryHandle` shim feeds
   one recursive block reader/writer. Import plans conflicts before writing;
   native or browser picker cancellation has no side effect.

The MCP server is independent: it reads the same vault directory through the
filesystem (Node.js `fs`), not the WebView bridge. AI agents and the installed app end up with the same view.

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
/                          topology hub always (map + INDEX + datasheet); no vault → dogfood sample + first-run starter
/topology                  same hub, explicit entry point (canvas-2D map/graph engine)
/docs                      vault picker / editor / unified palette
/ontology                  thin redirect → /topology?index=expanded (old tree/ego hub retired, B3)
/ontology/edit             legacy redirect → /ontology/studio (forwards ?node=)
/ontology/studio           restrained Compass Stage write surface (enhance/create)
/ontology/insights         graph insights (kind dist · hubs · edge types)
/git                       local vault git history / snapshot workbench
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

**One nav system, not three (feat/rail-rollout).** Every route above (plus
`/download`) mounts `src/widgets/app-nav-rail` as a persistent left sidebar on
desktop (`lg:` and up) and `src/widgets/bottom-tab-bar` on mobile — both read
the same 5 destinations and the same active-item ladder
(`src/shared/lib/nav-destination.ts`), so there is exactly one answer to
"where am I / where can I go" regardless of viewport. The former top tab bar
(`OperationsNav`) and its inline ontology sub-tabs (`OntologySubNav`) are
deleted, not just unmounted. Where that old top bar's settings gear and agent
heartbeat indicator were the only way to reach settings/theme/locale/MCP
status, `src/widgets/app-settings-menu` (`AppSettingsMenu`) plus
`LiveActivityIndicator` now mount directly in the header of the handful of
pages that need them (Projects list, Builder, Insights) — the narrow rail
can't host their wide popovers, so this is a "same feature, different
mount point" move, not a removal.

## URL contract (query-param + node id grammar)

Deep links are the app's shared address space — a copied URL, an agent
handoff, and a browser-back all rebuild the same view. So one node must have
one identity across every screen. The **canonical node id grammar is
`<kind>:<slug>`** (singular kind + colon, e.g. `capability:mcp-server`,
`domain:views`, `project:ontology-atlas`). This is the value that travels in
`?node=` / `?p=` / `?realm=` and the id used inside agent packets.

### Query params

| Param | Screen(s) | Meaning | Value shape |
|---|---|---|---|
| `p` | `/`, `/topology` | focused/selected node | canonical `<kind>:<slug>` (bare slug tolerated) |
| `open` | `/`, `/topology` | density-gate expanded parents | comma list of node ids |
| `realm` | `/`, `/topology` | "realm" containment-subtree root | canonical `<kind>:<slug>` (bare slug promoted) |
| `mode` | `/`, `/topology` | analysis mode | `overview`\|`graph`\|`focus`\|`path`\|`health` |
| `pathFrom` / `pathTo` (aliases `from` / `to`) | `/`, `/topology` | path source / target | node id |
| `hub` · `c` · `impact` · `pulse` · `index` · `create` | `/`, `/topology` | focused hub · category · impact mode · pulse window · INDEX panel state · create-node intent | see `src/views/home/model/url-state.ts` |
| `via` | `/`, `/topology`, `/ontology` | origin marker for the return chip | `insights:<tab>` |
| `node` | `/ontology` (redirect) | node to focus after redirect → `?p=` | node id (translated by `translateOntologyDeeplinkToTopologyParam`) |
| `node` | `/ontology/edit` (builder) | node to select in the inspector | canonical `<kind>:<slug>` **first-class**; plural vault-folder form (`capabilities/foo`) kept as a **legacy alias** |
| `node` | `/ontology/insights` | node to focus (builder-proof link) | vault slug (`capabilities/foo`) |
| `slug` | `/docs` | vault file to open | vault file path (`ontology/capabilities/foo`), not a node id — file paths are the docs vault's own address space |
| `reader` | `/ontology/edit` | reader-intent flag | see `parseOntologyReaderIntent` |
| `tab` | `/ontology/insights` | active insights tab | tab slug |

### id grammar single source of truth

- **Emit** (map · insights · popover "관계 편집"/데이터시트/컨텍스트 메뉴 →
  builder): `buildOntologyBuilderNodeHrefFromGraphId` in
  `src/entities/knowledge-graph/lib/ontology-node-href.ts`. It normalizes any
  input to canonical via `translateOntologyDeeplinkToTopologyParam`
  (`capabilities/foo` → `capability:foo`; already-canonical / bare /
  evidence-path pass through).
- **Receive** (builder `?node=`): `resolveBuilderQueryNodeSlug` in
  `src/views/ontology-edit/lib/resolve-builder-query-node.ts`. It accepts
  canonical `<kind>:<slug>` as first-class and still resolves the legacy
  plural-folder alias (`?node=capabilities/foo`, `?node=domains/views`) so
  previously-shared links never break.
- **Node id → docs file slug** conversion lives in one pure place: the
  popover/datasheet carry the focus model's `sourceSlug` (a vault file path)
  straight into `buildDocsVaultHref({ slug })`. `/docs` addresses files, not
  nodes, so `?slug=` intentionally stays a file path.
- Round-trip is pinned by `resolve-builder-query-node.test.ts` (emit →
  receive → doc) and `ontology-node-href.test.ts`.

Residual (out of the H5 slice, safe because resolvers tolerate it): a few
topology `?p=` / `?pathFrom=` links copied from the builder's relation-write
packet still carry the plural vault-slug form; the topology resolver's
bare-slug fallback resolves them unchanged.

## Build pipeline

```bash
pnpm docs-vault:build      # docs/ontology/*.md → src/entities/docs-vault/data/manifest.json
pnpm docs-vault:check      # verify committed docs-vault outputs are fresh
pnpm build                 # next build → static export → out/
pnpm vault:validate        # R11+ — frontmatter integrity + graph array drift
pnpm test:vault:validate   # focused validator CLI argument contract
pnpm vault:audit           # dogfood ontology capability/element paths exist in repo
pnpm test:vault:audit      # focused vault audit CLI argument contract
pnpm package:check         # MCP/CLI package files contract + self-test
pnpm test:contracts        # focused cross-package parser/schema/validator contracts
pnpm vault:migrate --list  # R11 — schema migration runner (dry-run default)
```

The `docs-vault:build` step is automatic via `predev` and `prebuild` npm hooks. `docs-vault:check` also runs in the macOS release workflow, while `vault:validate`, `test:vault:validate`, `vault:audit`, `test:vault:audit`, and `package:check` remain explicit local/release-preflight gates.

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
