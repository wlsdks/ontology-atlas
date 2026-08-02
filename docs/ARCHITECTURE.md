---
title: Architecture
tags: [architecture, infra, overview]
---

# Architecture

> 2026-07-27 update — the current architecture is a local-first, git-backed
> meaning layer shared by people and AI coding agents. Round 10 permanently
> removed all auth + cloud data surfaces; the current route model converges
> browsing on Topology, writing on Workshop, maintenance on five-question
> Insights, and keeps old ontology URLs only as compatibility redirects.
> Earlier cloud and retired-workbench design notes are in `docs/archive/`.

## High-level shape

```
┌────────────────────────────────────────────────────────┐
│ User                                                    │
│ ├─ /                       who is asking decides —     │
│ │                          gateway face for a vault-   │
│ │                          less web visitor, map for   │
│ │                          the app and vault users     │
│ ├─ /topology               the map (hub + INDEX + data)│
│ ├─ /docs                   vault picker + editor       │
│ ├─ /ontology               thin redirect → /topology   │
│ ├─ /ontology/edit          compatibility redirect      │
│ ├─ /ontology/studio        Compass write workbench     │
│ ├─ /ontology/insights      five-question maintenance   │
│ ├─ /git                    vault Git workbench         │
│ ├─ /projects               project list                │
│ ├─ /project/[slug]         project detail              │
│ ├─ /download               gateway as an explicit link │
│ └─ /guide · /changelog     gateway reading (vault md)  │
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
│ └─ 14 write tools add_concept · add_concepts ·          │
│                    add_relation · add_relations ·       │
│                    remove/replace relation · patch ·    │
│                    reclassify · delete/rename/merge ·   │
│                    absorb_document · git_snapshot ·     │
│                    finalize_project_meaning             │
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

## Surface contract — web and app

Decided 2026-07-27 (`docs/DECISIONS.md`); the working rule agents load is
`.claude/rules/surfaces.md`.

**One codebase, one build.** The macOS app is not a port. Tauri loads the very
same static export into a WebView (`src-tauri/tauri.conf.json` →
`frontendDist: "../out"`). Nothing is forked, and nothing should be.

**What each surface is for.** The app is the vault's home — the workbench where
a person judges the map and connects the agents. The web has two jobs, in this
order: (1) the **gateway**, opening the map with no install, for a demo, a first
five minutes, or a shared link; (2) a **second-best workbench** where no app
exists yet — which in practice means Chromium on Windows and Linux, since the
File System Access API is the capability the whole surface rests on. The order
matters: every observed visitor so far arrived through the web, so demoting the
gateway to "the Windows stand-in" would demote the only inbound path. A Windows
app would retire job 2 on that OS; job 1 has no expiry.

**The split is four capability bridges, not a branch in the router.**

| Bridge | Module | Web behaviour |
|---|---|---|
| Vault absolute path | `src/shared/lib/tauri-vault-fs.ts` | FSA handle instead (no path) |
| Git | `src/shared/lib/tauri-git.ts` | Cannot run → degraded card |
| Keychain | `src/shared/lib/tauri-secrets.ts` | Impossible by design → degraded card |
| LLM calls | `src/shared/lib/tauri-llm.ts` | Impossible by design → action not rendered |

Every bridge follows one convention: `getInvoke()` → `null` when `isTauri()` is
false → the screen degrades honestly. A degraded surface owes the reader two
things — **why** it cannot work here and **where** it can. New desktop
capabilities attach the same way; they do not get a web equivalent backfilled,
and that is a stated decision rather than a backlog item.

**What "the same data" actually guarantees.** The folder on disk is the single
source of truth, and both surfaces open the *physically same folder* — the web
through an FSA handle, the app through an absolute path. Interpretation cannot
drift because the frontmatter parser is pinned by a 3-way contract test and the
schema lives once in `mcp/src/schema.mjs`. Anything that must cross the surface
boundary is written **inside the vault** as plain text —
`.ontology-atlas/activity.jsonl` and `llm-audit.jsonl` — which is the rule this
contract promotes: *data that crosses surfaces lives in the vault folder.*
Concurrent edits are held by `patch_concept(expected_mtime)`.

Deliberately **not** shared: the "last opened vault" handle (each surface keeps
its own IndexedDB — you pick the folder once per surface, and `/download`'s
install step 02 says so), API keys (operating-system credential store, app only), and UI
preferences (localStorage). Secrets and taste do not belong in a vault.

**Verification is split three ways** (this replaced the old web↔app round-trip
check, which the same decision abolished): shared surfaces are proved once in
the browser and counted as proof for the app, because it is the same bundle —
except for font rasterisation, scrolling, and window chrome, which still need
the installed app; desktop capabilities are proved *only* in the installed app;
and the web surface itself is held by `tests/e2e/web-surface-smoke.spec.ts`,
wired into `.github/workflows/e2e.yml` on a deliberately wider condition than
the rest of the suite. The web is an unattended surface with no other watcher.

Cross-surface deep links are not guaranteed to reproduce a screen. Where they
exist they are a convenience, not a contract.

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
   `workspace_brief`, and `health`. `agent_brief` accepts an explicit project
   in multi-project vaults and derives a fresh categorical `meaningAssessment`
   for that project; it does not reuse a saved score.
5. Write tools mutate markdown only after explicit add/patch/relation/rename/
   merge/delete calls. Analysis tools such as `analyze_repo_structure` and
   `infer_imports` are side-effect-free candidate generators.
6. `finalize_project_meaning` is the post-write boundary: after current vault
   validation and complete project scope, it stores a versioned competency
   receipt bound to graph and source provenance. A successful receipt write is
   not a claim that the source is current. Structure, competency witnesses, and
   source currentness remain separate; missing, stale, or unresolved evidence
   closes the assessment as a categorical review/evidence state.

### Dual node identity

Every frontmatter node has an immutable lowercase UUIDv4 `uid` and a mutable,
human-readable `slug`. The compiler requires UID validity and uniqueness,
includes UID and merge-owned `merged_uids` in the semantic hash, and exposes
`uidToSlug`, `slugToUid`, and `mergedUidToSlug`. Compiled nodes and agent-facing
node summaries carry both values. Relations, adjacency maps, edge endpoints,
URLs, and canvas IDs remain slug-based; exact MCP identity lookup and interop
exports use UID. JSON-LD/GraphML serialize identity as `urn:uuid:<uid>`.
Rename/reclassify preserve UID; merge preserves the survivor and absorbs source
identity history. Invalid identity aborts compilation rather than producing a
partial artifact.

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
/                          who is asking decides — a web visitor with no vault gets the gateway
                           face (the same view /download renders); a web user with a vault, and
                           the installed app, get the map / first-run unchanged. The installed
                           app must never offer "download this app" to someone already running
                           it. Single source: isGatewaySurface() in shared/lib/nav-destination
/topology                  the map — canvas-2D hub (map + INDEX + datasheet). Links that say
                           "map" point here, not at / (gate:
                           tests/contract/map-destination-route.contract.test.ts)
/docs                      vault picker / editor / unified palette
/ontology                  thin redirect → /topology?index=expanded (old tree/ego hub retired, B3)
/ontology/edit             compatibility redirect → /ontology/studio (normalizes and forwards ?node=)
/ontology/studio           Compass Stage write surface (ENHANCE / CREATE)
/ontology/insights         five-question maintenance board
/git                       local vault git history / snapshot workbench (desktop-only destination)
/projects                  project list (cards)
/project/[slug]            project detail (inline edit when vault loaded)
/project/[slug]/edit       full project editor
/project/new               new project form
/project/fallback          fallback page for missing slugs
/download                  the gateway view as an explicit deep link — keeps the breadcrumb and
                           the back-to-map link that / drops
/guide                     the project guide, several chapters rendering docs/guide/*.md vault
                           docs. Named `guide` and not `docs` because /docs is already the
                           vault workbench (2026-07-30 ledger). Order and slugs live once in
                           src/views/gateway-doc/model/guide-pages.ts
/guide/[segment]           one chapter; static params come from that same registry
/changelog                 renders docs/CHANGELOG.md from the vault, most recent sections only
```

All routes are wrapped under `/[locale]/` by next-intl (en, ko).

> Removed in earlier rounds: `/admin/*`, `/review/*`, `/diagnostics/*`,
> `/knowledge/*`. Removed in Round 10: `/login`, `/signup`, `/account`,
> `/reset-password`, `/settings/*`.

**One navigation ownership model, responsive inventories.** The desktop rail
exposes six destinations: Map, Docs, Workshop, Insights, Projects, and Git.
The mobile bottom bar exposes four core destinations: Map, Docs, Insights, and
Projects; Workshop remains an immersive desktop write destination and Git is
desktop-only. Both use the same active-destination ladder in
`src/shared/lib/nav-destination.ts`, so a route has one semantic destination
even when a breakpoint intentionally omits its button. The retired
`OperationsNav` and `OntologySubNav` are deleted. `AppSettingsMenu` and
`LiveActivityIndicator` mount through the current shell/page slots rather than
being treated as navigation destinations.

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
| `mode` | `/`, `/topology` | analysis mode | `overview` \| `focus` \| `path` \| `health` |
| `pathFrom` / `pathTo` (aliases `from` / `to`) | `/`, `/topology` | path source / target | node id |
| `hub` · `c` · `impact` · `pulse` · `index` · `create` | `/`, `/topology` | focused hub · category · impact mode · pulse window · INDEX panel state · create-node intent | see `src/views/home/model/url-state.ts` |
| `recent` · `ask` | `/`, `/topology` | recent-change lens · agent first-words intent | typed parsers in `src/views/home/model/url-state.ts` |
| `via` | `/`, `/topology`, `/ontology` | origin marker for the return chip | `insights:<tab>` |
| `review` | `/`, `/topology`, `/ontology/studio`, `/ontology/insights` | exact Do-next review row carried across handoff | stable review id, only meaningful with the matching handoff |
| `node` | `/ontology` (redirect) | node to focus after redirect → `?p=` | node id (translated by `translateOntologyDeeplinkToTopologyParam`) |
| `node` | `/ontology/edit` (redirect), `/ontology/studio` | node to open in Workshop ENHANCE | canonical `<kind>:<slug>` first-class; plural-folder, bare-tail, and Unicode-normalized legacy inputs tolerated |
| `mode` | `/ontology/studio` | Workshop fill state | `create` for CREATE; omitted for ENHANCE |
| `from` · `rel` · `name` · `edit` | `/ontology/studio` | create-from-relation bridge and bearing edit intent | normalized node/relation/name values owned by Workshop |
| `slug` | `/docs` | vault file to open | vault file path (`ontology/capabilities/foo`), not a node id — file paths are the docs vault's own address space |
| `tab` | `/ontology/insights` | active maintenance question | `do-next` \| `composition` \| `connections` \| `boundaries` \| `freshness` |

### id grammar single source of truth

- **Emit** (map · Insights · popover "관계 편집"/datasheet →
  Workshop): `buildOntologyStudioNodeHrefFromGraphId` in
  `src/entities/knowledge-graph/lib/ontology-node-href.ts`. It normalizes any
  input to canonical via `translateOntologyDeeplinkToTopologyParam`
  (`capabilities/foo` → `capability:foo`; already-canonical / bare /
  evidence-path pass through).
- **Compatibility redirect**: `OntologyEditRedirectPage` normalizes a legacy
  `/ontology/edit?node=...` value and replaces the route with
  `/ontology/studio?node=...`.
- **Receive** (Workshop `?node=`): `resolveStudioFocalId` in
  `src/views/ontology-studio/lib/resolve-studio-focal.ts` accepts canonical,
  plural-folder, unique bare-tail, and NFC/NFD-equivalent ids. Ambiguous bare
  tails fail closed; a requested missing node does not silently open a
  different default node.
- **Node id → docs file slug** conversion lives in one pure place: the
  popover/datasheet carry the focus model's `sourceSlug` (a vault file path)
  straight into `buildDocsVaultHref({ slug })`. `/docs` addresses files, not
  nodes, so `?slug=` intentionally stays a file path.
- Emit/receive behavior is pinned by `ontology-node-href.test.ts`,
  `translate-ontology-deeplink.test.ts`, and
  `resolve-studio-focal.test.ts`. Insights tab serialization is separately
  pinned by `insights-tab-state.test.ts`.

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
