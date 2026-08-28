---
title: Architecture
tags: [architecture, infra, overview]
---

# Architecture

> 2026-07-27 update — the current architecture is a local-first, git-backed
> **meaning layer**: a folder of markdown files that records what each part of
> the product is, who owns it, what it depends on, and what proves it. People
> and AI coding agents read and write that same folder. Round 10 permanently
> removed every login and cloud-data screen. In today's route model, reading and
> contextual writing happen together on Topology, ACP writes pause in the same
> conversation for human review, and upkeep lives on the five-question Insights
> page. The old `/ontology/studio` and `/ontology/edit` URLs only translate old links.
> Earlier cloud and retired-workbench design notes are in `docs/archive/`.

## High-level shape

```
┌────────────────────────────────────────────────────────┐
│ User                                                    │
│ ├─ /                       who is asking decides —     │
│ │                          gateway face for a vault-   │
│ │                          less web visitor, map for   │
│ │                          the app and vault users     │
│ ├─ /topology               map + contextual write     │
│ ├─ /architecture           reviewed roles + agent gate│
│ ├─ /docs                   vault picker + editor       │
│ ├─ /ontology               thin redirect → /topology   │
│ ├─ /ontology/edit          compatibility redirect      │
│ ├─ /ontology/studio        compatibility → topology    │
│ ├─ /ontology/insights      five-question maintenance   │
│ ├─ /git                    vault Git workbench         │
│ ├─ /agents                 fetch · install · connect   │
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
│ ├─ read tools     connection/git proof · list/get/find ·│
│ │                  compile_ontology · query_ontology ·  │
│ │                  analyze_repo_structure · infer_imports│
│ │                  inspect_architecture                 │
│ └─ write tools    add_concept · add_concepts ·          │
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
│ CLI (cli/, v0.11.0 — 57 commands)                      │
│ ├─ init/agent-activity/add/import/list/find/validate/query│
│ ├─ mcp-verify/analyze/infer-imports/architecture       │
│ ├─ bootstrap/compile                                   │
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

Architecture intent uses a parallel, non-ontology record. A Markdown file with
`architecture_schema: architecture-profile/v1` has no `kind:` and therefore
never becomes a Map node. It declares pattern axes, scoped implementation roles,
path mappings, an optional one-sentence `summary_<role id>` per role, allowed
dependency direction, and reviewed evidence. MCP
`inspect_architecture` and CLI `architecture` derive the observed import model
from the connected source and compare it with that declaration. Their
`architectureConformance:v1` result is `conforms`, `violated`, or `unknown`;
unsupported languages, incomplete scans, unmapped edges, unruled edges, and
empty roles prevent a false green result. The `/architecture` Living Blueprint
renders the declared model and copies the typed pre/post agent plan, while source
analysis remains in MCP/CLI rather than being duplicated into Markdown.

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

**The two surfaces differ in a small set of modules — we call them bridges — not
in the router.** Each bridge is the single file that calls a desktop-only
ability. The canonical roster is the bridge table in
`.claude/rules/surfaces.md`; the ones that shape this document are:

| Bridge | Module | Web behaviour |
|---|---|---|
| Vault absolute path | `src/shared/lib/tauri-vault-fs.ts` | FSA handle instead (no path) |
| Git | `src/shared/lib/tauri-git.ts` | Cannot run → degraded card |
| Keychain | `src/shared/lib/tauri-secrets.ts` | Impossible by design → degraded card |
| LLM calls | `src/shared/lib/tauri-llm.ts` | Impossible by design → action not rendered |
| In-app agent runtime (ACP) | `src/shared/lib/tauri-acp.ts` | A browser cannot spawn a process → one row states why and where |

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

### In-app coding agents over ACP (2026-08-16)

The app can launch a coding agent the user already installed (Claude Code,
Codex, …) and speak the Agent Client Protocol v1 to it over stdio. It is a
desktop-only ability, so it attaches through the bridge convention above. Both
decision records behind it are in `docs/DECISIONS.md`, dated 2026-08-16.

| Module | Owns |
|---|---|
| `src-tauri/src/acp.rs` | Registry snapshot parsing, runtime detection (`ready` · `cli-missing` · `node-missing` · `uvx-missing` · `binary-missing`), launch resolution, isolated config + credential symlink, permission verdict, process-group termination |
| `src-tauri/src/lib.rs` | The five Tauri commands (`acp_detect_runtimes`, `acp_start`, `acp_send`, `acp_stop`, `acp_permission_verdict`), the four `acp://*` events, and the vault-root rejection that also guards a session's working directory |
| `src-tauri/src/acp-registry.json` | The committed registry snapshot, generated by `scripts/build-acp-registry.mjs` (`pnpm acp:registry`); icons are fetched at build time into `public/acp-icons/` |
| `src/shared/lib/tauri-acp.ts` | The capability bridge and its web degradation. It never re-implements the permission policy |
| `src/features/acp-session/` | `acp-client.ts` (JSON-RPC framing over the bridge) and `use-acp-session.ts` (one session's lifetime; a permission request blocks until the screen answers, and an unanswered one is refused) |
| `src/widgets/acp-chat-panel/` | `AcpChatPanel.tsx` and `AcpPermissionCard.tsx`. **No route or control opens this panel yet**, so it is a module, not a surface |
| `src/widgets/app-settings-menu/ui/AcpRuntimeSettings.tsx` | The one ACP surface a user can reach today: the settings sheet's Runtime section |

Three properties are structural rather than incidental. The registry is a
committed snapshot, so no ACP code path touches the network at runtime. A
launched session runs against an app-owned config directory rather than the
user's global one, which is what makes the permission gate exist at all;
credentials are symlinked, never copied. And the child runs in its own process
group, so quitting the app ends the adapter and everything it spawned.

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
/topology                  map + contextual relation editor + change review. Any link labelled
                           "map" or "edit relation" points here, not at / (gate:
                           tests/contract/map-destination-route.contract.test.ts)
/architecture              reviewed architecture profiles, stable role blueprint, and typed
                           MCP/CLI planning + verification handoff; never an ontology map
/docs                      vault picker / editor / unified palette
/ontology                  thin redirect → /topology?index=expanded (old tree/ego hub retired, B3)
/ontology/edit             compatibility redirect → /topology contextual workbench
/ontology/studio           compatibility redirect; translates node/mode/edit/via/review to /topology
/ontology/insights         five-question maintenance board
/git                       local vault git history / snapshot workbench; remains a
                           primary desktop-rail destination with contextual links too
/agents                    coding agents this computer can run — the app launches them and
                           you talk to them here. Fetches Node and the pinned CLI into an
                           app-only folder when they are missing, runs the eight-step
                           connection check, and repairs what it can. Moved out of the
                           settings sheet 2026-08-20 (ledger 90): settings is where you pick
                           values, this is operational work with progress state. API Key and
                           Workspace stay in settings (the 2026-08-16 freeze and a different
                           owning domain). Desktop launches the tools; on the web the page
                           still renders and says what it cannot do, plus what it can.
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
different list of buttons.** The desktop rail shows seven destinations: Map,
Architecture, Docs, Insights, Projects, Agents, and Git. The mobile bottom bar shows
five persistent destinations: Map, Architecture, Docs, Insights, and Projects;
web adds Get App as a separate utility. Contextual writing stays inside Map,
Agents and Git keep their narrow-screen entry points.
Both read the same rules in
`src/shared/lib/nav-destination.ts`, so every route belongs to exactly one
destination even on a screen size that deliberately hides that button. The
retired
`OperationsNav` and `OntologySubNav` are deleted. `AppSettingsMenu` mounts
through the shell, while `AgentActivityChip` mounts in Topology's contextual map
controls and `AgentActivitySettings` configures that current-work flow; none is
a navigation destination.

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
| `hub` · `c` · `impact` · `pulse` · `index` · `create` | `/`, `/topology` | focused hub · category · impact mode · pulse window · INDEX panel state · legacy create-node intent | see `src/views/home/model/url-state.ts` |
| `workbench` · `edit` | `/topology` | contextual writer state · optional relation/target | `edit` \| `create`; `edit=<relation>:<targetId>` |
| `recent` · `ask` | `/`, `/topology` | recent-change lens · agent first-words intent | typed parsers in `src/views/home/model/url-state.ts` |
| `via` | `/`, `/topology`, `/ontology` | origin marker for the return chip | `insights:<tab>` |
| `review` | `/`, `/topology`, `/ontology/insights` | exact Do-next review row carried across handoff | stable review id, only meaningful with the matching handoff |
| `node` | `/ontology` (redirect) | node to focus after redirect → `?p=` | node id (translated by `translateOntologyDeeplinkToTopologyParam`) |
| `node` · `mode` · `edit` | `/ontology/edit`, `/ontology/studio` | legacy write deep link translated to `p/workbench/edit` | canonical and plural-folder node forms tolerated; `mode=create` → `workbench=create` |
| `slug` | `/docs` | vault file to open | vault file path (`ontology/capabilities/foo`), not a node id — file paths are the docs vault's own address space |
| `tab` | `/ontology/insights` | active maintenance question | `do-next` \| `composition` \| `connections` \| `boundaries` \| `freshness` |

### One place builds node ids, one place reads them

- **Building a link** (map · Insights · popovers · datasheets, all staying in
  the map workbench): `buildTopologyMeaningEditorNodeHref` and
  `buildTopologyMeaningEditorEdgeHref` in
  `src/entities/knowledge-graph/lib/ontology-node-href.ts`. It normalizes any
  input to canonical via `translateOntologyDeeplinkToTopologyParam`
  (`capabilities/foo` → `capability:foo`; already-canonical / bare /
  evidence-path pass through).
- **Compatibility redirect**: `OntologyEditRedirectPage` normalizes legacy
  `/ontology/edit` and `/ontology/studio` query values and replaces the route
  with `/topology?p=...&workbench=edit` or `/topology?workbench=create`.
- **Reading a link**: `parseHomeRouteState` owns `p/workbench/edit`, and
  `parseOntologyStudioEditParam` remains only as the compatibility parser for
  the relation/target pair. Unknown relation values open no editor rather than guessing.
- **Turning a node id into a docs file path** happens in exactly one place: the
  popover and the datasheet pass the focus model's `sourceSlug` (a path to a
  file in the vault) straight into `buildDocsVaultHref({ slug })`. `/docs`
  addresses files, not nodes, so its `?slug=` deliberately stays a file path.
- Both the building and the reading side are pinned by `ontology-node-href.test.ts`,
  `translate-ontology-deeplink.test.ts`, and
  `url-state.test.ts`, and `OntologyEditRedirectPage.test.tsx`. Insights tab
  serialization is separately pinned by `insights-tab-state.test.ts`.

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
