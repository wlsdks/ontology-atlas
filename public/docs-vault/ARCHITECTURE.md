---
title: Architecture
tags: [architecture, infra, overview]
---

# Architecture

> 2026-07-27 update — the current architecture is a local-first, git-backed
> **meaning layer**: a folder of markdown files that records what each part of
> the product is, who owns it, what it depends on, and what proves it. People
> and AI coding agents read and write that same folder. Round 10 permanently
> removed every login and cloud-data screen. In today's route model, browsing
> happens on Topology, writing on Workshop, and upkeep on the five-question
> Insights page; the old `/ontology*` URLs stay only so old links still work.
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

There is no backend, no server database, no login provider. The user's markdown
folder — called the **vault** everywhere in this repo — is the single source of
truth. Both the MCP server (used by the AI agent) and the CLI (used by the
developer) read and write that same folder.

The public app/website brand is **Ontology Atlas**. The macOS app bundle,
bundle identifier, and DMG assets use the Ontology Atlas identity, while the
repo, CLI binary, and MCP package remain under `ontology-atlas`, so product
naming does not imply a backend, Firebase data dependency, or package rename.

Atlas answers graph-database questions by computing the answer when asked. It
never keeps a second copy of the data. `compile_ontology` reads the frontmatter
(the `key: value` block at the top of each `.md` file) and builds one graph file
in memory — the same vault always produces byte-identical output, which is what
"deterministic" means here. `query_ontology` runs its graph operations over that
file, and write tools save confirmed changes back into the markdown.

## Surface contract — web and app

Decided 2026-07-27 (`docs/DECISIONS.md`); the working rule agents load is
`.claude/rules/surfaces.md`.

**One codebase, one build.** The macOS app is not a port. Tauri loads the very
same static export into a WebView (`src-tauri/tauri.conf.json` →
`frontendDist: "../out"`). Nothing is forked, and nothing should be.

**What each surface is for.** The app is where the vault lives day to day: the
place a person reads the map, judges it, and connects their AI agents. The web
has two jobs, in this order. (1) It is the **gateway** — it opens the map with
no install, for a demo, someone's first five minutes, or a shared link. (2) It
is a **second-best workbench** where no app exists yet, which in practice means
Chromium on Windows and Linux, because the whole web surface needs the browser's
File System Access API to work at all. The order matters: every visitor we have
observed so far arrived through the web, so treating the gateway as merely "the
Windows stand-in" would downgrade the only way people currently arrive. A
Windows app would end job 2 on that operating system; job 1 never expires.

**The two surfaces differ in four small modules — we call them bridges — not in
the router.** Each bridge is the single file that calls a desktop-only ability.

| Bridge | Module | Web behaviour |
|---|---|---|
| Vault absolute path | `src/shared/lib/tauri-vault-fs.ts` | FSA handle instead (no path) |
| Git | `src/shared/lib/tauri-git.ts` | Cannot run → degraded card |
| Keychain | `src/shared/lib/tauri-secrets.ts` | Impossible by design → degraded card |
| LLM calls | `src/shared/lib/tauri-llm.ts` | Impossible by design → action not rendered |

Every bridge follows one convention: `getInvoke()` returns `null` when
`isTauri()` is false, and the screen then says plainly that it cannot do this
here. Such a screen must tell the reader two things: **why** it cannot work here
and **where** it can. New desktop abilities attach the same way. They do not get
a web version added later — that is a decision we have made, not a task waiting
in a backlog.

**What "the same data" actually guarantees.** The folder on disk is the single
source of truth, and both surfaces open the *physically same folder* — the web
through an FSA handle, the app through an absolute path. The two surfaces cannot
end up reading the same file differently, because one contract test runs the
same file through all three parsers (web, MCP, scripts) and the schema is
written in exactly one place, `mcp/src/schema.mjs`. Anything that has to pass
between the two surfaces is written **inside the vault** as plain text —
`.ontology-atlas/activity.jsonl` and `llm-audit.jsonl`. That is the rule this
contract sets: *anything shared between surfaces lives in the vault folder.* If
two people (or an agent and a person) edit at once,
`patch_concept(expected_mtime)` stops the second write from silently erasing the
first.

Three things are deliberately **not** shared. The "last opened vault" handle:
each surface keeps its own IndexedDB, so you pick the folder once per surface,
and `/download`'s install step 02 says so. API keys: they live in the operating
system's credential store, app only. UI preferences: localStorage. API keys and
personal display settings are not part of the shared model, so they stay out of
the vault.

**Verification is split three ways** (this replaced the old web↔app round-trip
check, which the same decision abolished). First, screens that both surfaces
share are tested once in the browser, and that counts as proof for the app too,
because it is literally the same bundle — the exceptions are font rendering,
scrolling, and the window frame, which still have to be checked in the installed
app. Second, desktop-only abilities are proved *only* in the installed app.
Third, the web surface has its own test, `tests/e2e/web-surface-smoke.spec.ts`,
wired into `.github/workflows/e2e.yml` on a deliberately wider condition than
the rest of the suite — nobody watches the web by hand, so that test is its only
guard.

A deep link built on one surface is not guaranteed to rebuild the same screen on
the other. Where such links work, treat it as a convenience, not a promise.

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
2. Each file's frontmatter becomes one **node** (a thing in the model: a
   project, a domain, a capability, or an element), and the lists inside that
   frontmatter become **relations** (typed links between two nodes).
3. `compile_ontology` puts those nodes and relations into one fixed order,
   resolves aliases, collects the problems it found, lists the frontmatter
   arrays it would tidy up, computes a stable `graphHash` (one fingerprint for
   the meaning of the whole graph), and optionally builds query indexes.
4. `query_ontology` serves graph operations such as `neighbors`, `path`,
   `project_scope`, `blast_radius`, `cycles`, `maintenance_plan`,
   `workspace_brief`, and `health`. `agent_brief` accepts an explicit project
   in multi-project vaults and derives a fresh categorical `meaningAssessment`
   for that project; it does not reuse a saved score.
5. Write tools change the markdown only when someone explicitly calls
   add/patch/relation/rename/merge/delete. Analysis tools such as
   `analyze_repo_structure` and `infer_imports` only propose candidates; they
   never change a file.
6. `finalize_project_meaning` runs after the writes are done. Once the vault
   validates and the project's scope is complete, it saves a versioned record —
   a *receipt* — of the competency answers, tied to the current graph and to
   where the source code came from. Writing that receipt successfully does
   **not** mean the source is still current. Three things stay separate and are
   never added up into one number: whether the structure is complete, whether
   each competency answer has evidence behind it, and whether the source has
   been rechecked. If evidence is missing, out of date, or unresolved, the
   assessment closes in one of the named review/evidence states instead of a
   score.

### Dual node identity

Every node carries two names. The `uid` is a lowercase UUIDv4 that never
changes — it is the node's permanent identity. The `slug` is the short readable
name in the file path and the URL, and it can be renamed at any time. The
compiler requires UID validity and uniqueness,
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

This is what a first-time visitor sees: a real, filled-in ontology — this
project's own — before they have picked any folder of their own.

## Routes

```
/                          shows a different screen depending on who opens it. A web visitor
                           with no vault gets the gateway — the install-free intro page, the
                           same view /download renders. A web user who has a vault, and anyone
                           in the installed app, gets the map (or first run) unchanged. The
                           installed app must never offer "download this app" to someone who is
                           already running it. One function decides: isGatewaySurface() in
                           shared/lib/nav-destination
/topology                  the map — canvas-2D hub (map + INDEX + datasheet). Any link labelled
                           "map" points here, not at / (gate:
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
/download                  the same gateway page at its own address — it keeps the breadcrumb
                           and the back-to-map link that / leaves out
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

**One piece of code decides which nav item is active; each screen size shows a
different list of buttons.** The desktop rail shows six destinations: Map, Docs,
Workshop, Insights, Projects, and Git. The mobile bottom bar shows four: Map,
Docs, Insights, and Projects — Workshop is a full-screen desktop writing
destination and Git is desktop-only. Both read the same rules in
`src/shared/lib/nav-destination.ts`, so every route belongs to exactly one
destination even on a screen size that deliberately hides that button. The
retired
`OperationsNav` and `OntologySubNav` are deleted. `AppSettingsMenu` and
`LiveActivityIndicator` mount through the current shell/page slots rather than
being treated as navigation destinations.

## URL contract (query-param + node id grammar)

A URL is how this app shares a view. A copied link, a handoff to an AI agent,
and the browser's back button must all rebuild the same screen, so one node has
to be written the same way everywhere. The **standard way to write a node id is
`<kind>:<slug>`** — the kind in singular, a colon, then the slug, for example
`capability:mcp-server`, `domain:views`, `project:ontology-atlas`. That is the
value carried in `?node=` / `?p=` / `?realm=` and the id used in the text handed
to an agent.

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

### One place builds node ids, one place reads them

- **Building a link** (map · Insights · the popover's "관계 편집" and the
  datasheet, all pointing at Workshop):
  `buildOntologyStudioNodeHrefFromGraphId` in
  `src/entities/knowledge-graph/lib/ontology-node-href.ts`. It normalizes any
  input to canonical via `translateOntologyDeeplinkToTopologyParam`
  (`capabilities/foo` → `capability:foo`; already-canonical / bare /
  evidence-path pass through).
- **Compatibility redirect**: `OntologyEditRedirectPage` normalizes a legacy
  `/ontology/edit?node=...` value and replaces the route with
  `/ontology/studio?node=...`.
- **Reading a link** (Workshop's `?node=`): `resolveStudioFocalId` in
  `src/views/ontology-studio/lib/resolve-studio-focal.ts` accepts the standard
  form, the plural-folder form, a bare tail when only one node matches it, and
  ids that differ only by Unicode normalization (NFC/NFD). If a bare tail
  matches more than one node, Workshop opens nothing rather than guessing, and
  a link to a node that no longer exists never quietly opens some other node
  instead.
- **Turning a node id into a docs file path** happens in exactly one place: the
  popover and the datasheet pass the focus model's `sourceSlug` (a path to a
  file in the vault) straight into `buildDocsVaultHref({ slug })`. `/docs`
  addresses files, not nodes, so its `?slug=` deliberately stays a file path.
- Both the building and the reading side are pinned by `ontology-node-href.test.ts`,
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
