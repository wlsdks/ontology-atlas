# FEATURES — oh-my-ontology

> Complete inventory of features users can **actually use right now**.
> Last updated: 2026-05-02 (post-OSS-launch readiness — CLI scaffold, web scaffold button, npm publish guard)
> Update trigger: reflect immediately when surfaces are added or removed. Update alongside the PR body and CHANGELOG.

---

## 0. At a glance

> **Mission v2**: "an ontology of the codebase, authored together by humans and AI agents."
> **Operating model**: single-user tool. Local-first vault. Login is optional. AI agents (Claude Code, etc.) read/write directly through the MCP server.

```
input (humans + AI agents)     parse           store              output
        │                       │                │                │
        ▼                       ▼                ▼                ▼
  .md in vault  →          frontmatter   →  vault or       →  tree (/) [hub]
  (frontmatter)                              Firestore        topology (/topology Sigma)
  + AI agent (MCP)                                            builder (/ontology/edit xyflow)
```

---

## 1. Mode branching (data source)

The `useDataSourceMode()` hook resolves to one of three modes:

| Mode | Condition | Behavior |
|---|---|---|
| **local** | vault folder active | vault manifest is the source of truth, zero Firebase calls |
| **cloud** | Firebase login + no active vault | Firestore onSnapshot live sync |
| **static** | neither | build-time demo manifest |

**Effect**: when a user opens a vault folder, `/` (ontology hub), `/topology`, `/projects`, and `/project/[slug]` all switch to vault data instantly. Mutations (create / edit / delete) are mode-aware in exactly the same way.

---

## 2. Features per route

### Ontology hub + visualization

#### `/` — Ontology Tree Hub (the spine of mission v2)

- **mode-aware** (Q1=(a) adopted, `useOntologyInsight`):
  - local: vault frontmatter stub nodes/edges surface immediately in tree, ego graph, and search
  - cloud: subscribes to the `knowledgePublicNodes/Edges` projection
  - static: demo manifest
- **hierarchy tree**: project → domain → capability → element (document nodes contribute as evidence only and are excluded from the tree)
- **node click** → right-side detail panel: kind / title / summary / project link / evidence documents / **ego graph** (1-hop / 2-hop SVG) / neighbor list / "+ add relation" / "copy node link"
- **top toolbar pills**: add node / search (⌘K / ⇧⌘K) / open builder → / insights / relations
- **stat cards**: tree nodes / relations / evidence documents / unresolved stubs / last published
- **stub handling**: unresolved references → in the `OntologyStubList` widget at the bottom of the tree, take "promote" (kind selection) / "dismiss" actions (cloud mode triggers the `promoteStubNode` / `dismissStubNode` callables)
- **empty-vault empty-state** (mode-aware): when a vault is active, a 2-step "write frontmatter → tidy in builder". Otherwise, a 3-step "open vault → frontmatter → builder".
- **shortcuts**: `⌘K` search · `⇧⌘K` global search · `?` shortcut sheet

#### `/topology` — Sigma WebGL topology (the mission v2 exit view)

- **render**: Sigma.js + Graphology + ForceAtlas2 — lays the entire project out as a spatial network
- **interaction**: node click → ProjectDrawer · hover → tooltip + 1-hop neighbor highlight · drag / wheel → pan/zoom
- **side widgets**: left-side Legend (kind color legend) · right-side SigmaHubRail (quick jump to top-degree hubs) · bottom RegionNavigator (minimap)
- **shortcuts**: `⌘K` search · `?` shortcut sheet
- **modes**: works in every mode — only the data source differs

#### `/ontology/edit` — Builder (xyflow ERD)

- **palette (left)**: click one of the 4 kinds → a new ephemeral node (indigo dashed) appears at the canvas center
- **connect**: drag from the dot at a node's edge → drop on another node → ephemeral relation edge
- **Inspector (right)**: when an ephemeral node is selected, name it + save → commits to `knowledgeApprovedNodes/Edges` (cloud) or vault `.md` (local)
- **md export**: download ephemeral nodes/edges as frontmatter markdown
- **fullscreen toggle**: F key or the Maximize button at the top right — hides OperationsNav + uses the full viewport
- **shortcuts**: N (new project node) · F (fullscreen) · Del (delete selection) · Esc (clear selection / exit fullscreen)
- **builder onboarding**: a 3-step coach mark on first entry with an empty canvas (with a "don't show again" toggle)
- **layout**: simple grid

#### `/ontology/insights` — Insights
- **kind distribution** (bars), **distribution per project** (sorted), **relation type distribution**
- **cross-project relation** ratio / absolute count
- **top 10 hub nodes** (by degree, excluding documents and projects)
- **10 most recent activities** (relative time)
- **30-day activity timeline** (per-day approval bars)
- **disconnected nodes** (orphans, highlighted in amber)
- every entry click → jumps to `/ontology/?node=<id>`

#### `/ontology/relations` — Relation distribution
- **edge type distribution** (left) — click to toggle filter
- **top 12 strongest relations** (sorted by evidence richness) — from → type → to + cross chip + evidence count

### Vault Local-First

#### `/docs` — Vault Picker / Doc Vault
- **local folder picker** (File System Access API):
  - pick a folder → auto-scan all `.md` → build manifest
  - file count + last scan time ("just now / 5s ago / 3m ago")
  - refresh / close / re-authorize buttons
  - friendly messages for unsupported browsers, denied permissions, and access errors
- **surfaces when a vault is active**:
  - folder tree + sidebar (pinned · recent · tags)
  - body viewer (markdown + frontmatter metabar)
  - folder topology view (Sigma) — link graph between documents
  - "vault frontmatter ontology" panel — stub nodes/edges extracted from frontmatter alone
  - backlinks / related documents / relation radar
  - command palette (vault-only — Daily Note, Scaffold Topology, exports, etc.)
- **scaffoldTopology()**: in an empty vault, auto-generates `projects/`, `README.md`, `categories.md`, `statuses.md`, and a sample project hub/leaf
- **OntologyStarterCta** (mission v2): when the picked vault has read+write permission, a top-of-page "Create starter seed" button writes 5 starter `.md` files (`README.md`, `project.md`, `domains/example.md`, `capabilities/example.md`, `elements/example.md`) plus `.mcp.json.example` — same template that `npx oh-my-ontology init` writes from the CLI. **Designed for non-developers** so they don't need a terminal to begin.

### Projects

#### `/projects` — Project list
- **mode-aware**: local mode reads `projects/*.md` from the vault; cloud reads Firestore
- **search / filter**: query · category · status · displayed count
- **per card**: ontology node count badge, quick actions (edit)
- **ProjectQuickCreatePanel** — inline quick creation directly in the page (mode-aware)
- **CSV export** — full download
- **WorkspaceOntologyStrip** — top-of-page ontology summary strip

#### `/project/[slug]` — Project detail
- **render**: metadata (name · description · tags · stack · status · category · start/end date · progress · owner · icon) + dependency graph + topology preview
- **inline edit** (when permitted): edit description / status etc. on the spot
- **DependencyPicker**: dependency chip multi-select + search + cycle/missing warnings
- **CopyProjectLinkButton**: simple URL copy (mission v2 alignment, distinct from the share-doc system)
- **Mission 7 atomic alignment**: every piece of information maps automatically from the vault's `projects/<slug>.md`

#### `/project/new` · `/project/[slug]/edit` — Editor
- **full form**: name · slug · description · detail (markdown) · tags · stack · links · dependencies · icon · status · category · progress · timeline · screenshots
- **auto-suggest**: when other project names appear in the description, a dependency suggestion chip is offered
- **mode-aware mutations**: local → write/patch vault `.md`; cloud → Firestore upsert
- **post-save action choice**: "save and keep viewing" / "save and back to list" / "save and go to public view"

#### `/project/fallback` — Static export fallback
- A Firebase Hosting rewrite routes unknown slugs to a client-side Firestore lookup. Dynamic slugs that were unknown at build time still render correctly.

### AI agent partner (`mcp/`)

> Phase 3 — LLM agents like Claude Code read/write the ontology over stdin/stdout JSON-RPC.

- **package**: `oh-my-ontology-mcp` v0.6.0 (in `mcp/`), depends on `@modelcontextprotocol/sdk@^1.0.0`
- **registration**: copy `.mcp.json.example` and set `OMOT_VAULT=<absolute path to your vault>` (or `./docs/ontology` for our dogfood vault)
- **distribution**: `npx -y oh-my-ontology-mcp` (after publish), zero install
- **12 tools** (read 8 + write 4):

| Tool | Read/write | Behavior |
|---|---|---|
| `list_concepts` | read | every node in the vault (kind filter + limit) |
| `get_concept` | read | a single slug's frontmatter + body excerpt + neighbors |
| `find_evidence` | read | partial title match — searches frontmatter + body |
| `find_backlinks` | read | nodes that point to a given slug (frontmatter array keys + body wikilink/mdlink) |
| `find_path` | read | shortest-path BFS between two slugs |
| `list_kinds` | read | distribution of node kinds in the vault |
| `find_orphans` | read | nodes with zero in/out edges |
| `query_concepts` | read | Typed filter DSL — `kind=X AND has(Y) AND NOT ...` |
| `add_concept` | write | write a new `.md` node — throws if the slug already exists |
| `add_relation` | write | create an edge between two slugs (depends_on / relates / contains / describes) |
| `patch_concept` | write | patch an existing node's frontmatter (per-key patch) + body |
| `delete_concept` | write | remove a node and its inbound/outbound references |

- **Dogfood vault**: `docs/ontology/` — this project's own mental model. 1 project + 8 domains + 9 capabilities + 4 elements + 1 vault-readme ≈ 23 nodes.

### Auth / account

#### `/login`
- email + password
- Google OAuth (popup)
- password reset link

#### `/signup`
- displayName + email + password (8+ chars) + confirmation
- automatic login after signup

#### `/reset-password`
- email → sends a Firebase password reset email

#### `/account` (guests are redirected to `/login?next=/account`)
- **my info**: name · email · login provider
- **change password**: current + new + confirm (Firebase email/password users only)
- **resend password reset** email
- sign-out lives in the PublicAccountMenu

### Operations / settings

#### `/settings` — Tidy hub
- iOS-Settings-style grouped list with drill-in
- groups: map maintenance (categories · statuses · import)

#### `/settings/categories` · `/settings/statuses` · `/settings/import`
- edit category label / description / tone (indigo · amber · neutral) / canvas region
- edit status lifecycle label / dot color / sort order
- bulk CSV upload (mode-aware)

> Mission v2 alignment: TBox surfaces (`/settings/ontology[/history]`) have been removed —
> frontmatter `kind:` *is* the schema. `/diagnostics/insights` was removed too —
> user-visible insights are now owned by `/ontology/insights`.

---

## 3. By feature group

### 3.1 Vault Local-First

| Feature | Entry point | Effect |
|---|---|---|
| Folder picker (FSA) | `/docs` LocalVaultPicker | OS folder → manifest |
| Manifest build | automatic (on selection) | frontmatter · backlinks · headings · excerpt |
| Fingerprint change detection | automatic (on tab focus) | rescans (debounced 2s) when you return after editing in an IDE |
| Handle persistence | IndexedDB (`local-fs-handle`) | restore after refresh by clicking re-authorize |
| createDoc / saveDoc / deleteDoc / renameDoc | command palette / inline edit | mode-aware mutation |
| `updateFrontmatter` | useProjectMutations | preserves the body and patches frontmatter |
| Backlink rewrite | best-effort on renameDoc | auto-replaces `[[oldSlug]]` and `[text](old.md)` in other files |
| Scaffold | command palette | seeds an empty vault with README + projects/ + samples |

### 3.2 Mode-Aware Adapters

| Hook | Responsibility |
|---|---|
| `useDataSourceMode()` | resolves local / cloud / static |
| `useProjects(accountId)` | mode-specific project read (sync local / subscribe cloud) |
| `useProjectMutations()` | mode-specific CRUD (vault file write / Firestore upsert) |
| `useOntologyInsight(accountId)` | **new in mission v2** — local: converts vault frontmatter stubs; cloud: knowledgePublic projection. The `/` ontology hub auto-switches to vault mode when a vault is active |
| `TaxonomyProvider` | local/static modes use defaults, cloud subscribes |
| `useLocalVault()` | manifest + handle + commands |
| `useVaultOntology()` | converts a vault manifest → OntologyStubNode/Edge |

**Surfaces using these**: HomePage / OntologyViewPage (`/`) / ProjectSelectorPage / ProjectDetailPage / ProjectForm / MountedGlobalSearch / DependencyPicker / TaxonomyProvider

### 3.3 AI Agent Partner (new in mission v2)

| Item | Description |
|---|---|
| MCP server | `oh-my-ontology-mcp` package (`mcp/`), stdin/stdout JSON-RPC, 12 tools (read 8 + write 4) |
| Registration | copy `.mcp.json.example` → restart Claude Code |
| Vault | `OMOT_VAULT` env (default cwd) — the user's vault or `docs/ontology/` (dogfood) |
| Compatibility | works on any vault; only `.md` files with a `kind:` frontmatter become nodes. Existing ontology format is preserved as-is |
| **CLI** (`oh-my-ontology`) | `cli/` package — `npx oh-my-ontology init my-vault` scaffolds 5 starter `.md` + `.mcp.json.example`. Identical templates to the web `/docs` scaffold button so CLI and web converge on the same starter |
| **Web scaffold** (`OntologyStarterCta`) | `/docs` button — same 5 starter files, no terminal required (non-developer entry) |
| **npm publish guard** | 3 layers (`CLAUDE.md` rule + `.claude/rules/forbidden.md` + PreToolUse Bash hook in `.claude/settings.json`). AI agents cannot run `npm publish` without explicit user approval — protects the maintainer's npm account from accidental releases |

### 3.4 Search

| Kind | Shortcut | Entry point |
|---|---|---|
| Project SearchPalette | `⌘K` (home) | topology / project screens |
| Global search (ontology + docs + projects) | `⇧⌘K` | every page |

**Capabilities**: Korean/English fuzzy match · kind filter chips · project filter chips · keyboard nav (↑↓ Enter Esc) · sample entries per source when the query is empty.

### 3.5 Frontmatter parser

| Form | Example |
|---|---|
| Scalar | `name: foo` / `count: 42` / `active: true` |
| Quoted | `desc: "hello: world"` |
| Inline list | `tags: [a, b, c]` |
| Block list | `items:\n  - a\n  - b` |
| **Inline object** | `pos: { x: 1, y: 2 }` |
| **Block object** | `pos:\n  x: 1\n  y: 2` |

Inside an object value, `'true'/'false'/numbers` are typed automatically. `applyFrontmatterUpdates()` patches frontmatter while preserving the body (null = delete the key).

scripts/build-docs-vault.mjs, src/shared/lib/parse-frontmatter.ts, and mcp/src/parser.mjs keep this capability in sync.

### 3.6 Vault frontmatter → Ontology stub

frontmatter keys:
- `kind:` (project / capability / element / domain / decision / workflow / ...)
- `title:` (or the first `#` heading / filename fallback)
- `domain:` (single-domain node candidate)
- `capabilities: []` / `elements: []` (array node candidates)
- `relates: []` / `dependencies: []` (edge candidates)

→ output: `OntologyStubNode[]` + `OntologyStubEdge[]` + warnings. A fast path that bypasses AI extraction. Visible immediately on `/`, `/docs`, and `/ontology/edit`.

### 3.7 V1.1 Wikidata Statement Annotation (new in mission v2)

Optional fields added to `KnowledgeGraphEdge` (additive, zero breakage):

- `qualifiers?: Array<{ propertyId: string; value: QualifierValue }>`
- `rank?: 'preferred' | 'normal' | 'deprecated'`

`QualifierValue` union: string / time (precision year-month-day) / quantity (value+unit) / nodeRef.

Legacy edges leave both fields undefined → the code falls back to `rank ?? 'normal'`. `publishKnowledgeProjectionCore` passes the fields through during the approved → public projection. Details: `docs/ONTOLOGY-MODEL-V2-DRAFT.md` §2.

### 3.8 Permissions

| Role | Behavior |
|---|---|
| Anonymous / guest | public surfaces (read the home tree) + full vault-mode usage |
| Demo session | `/login` demo button → read-only demo data |
| Firebase-authenticated user | full rights over their own data (single-user tool) |
| `admins/{email}` allowlist | reserved for future global operations — the TBox / diagnostics operations it used to gate were retired in mission v2 |

The `PermissionGate` component branches on own-space / membership / admin.

### 3.9 Mobile / responsive

| Feature | Location | Behavior |
|---|---|---|
| **BottomTabBar** | `src/widgets/bottom-tab-bar/` | a fixed bottom tab bar on mobile (below md) — map · projects · docs · settings. On desktop, OperationsNav exposes the same destinations |
| **GestureHint** | `src/widgets/gesture-hint/` | shows swipe-gesture guidance the first time touch devices land on the topology |
| **safe-area** | OperationsNav mobile mode | avoids collisions with the iOS notch + BottomTabBar |
| Mobile detail sheet | `/` tree | desktop uses the right-side panel; mobile uses a bottom-fixed sheet |

### 3.10 Theme / accessibility / notifications

| Feature | Location | Behavior |
|---|---|---|
| **ThemeToggle (Light/Dark)** | right side of OperationsNav + `src/features/theme-toggle/` | toggles `html[data-theme="light"]`. Defaults to dark. Persisted in localStorage |
| **Toast** | `useToast()` (`src/shared/ui/toast.tsx`, sonner-based) | 50+ call sites. `show(message, tone)` API. success / error / warning / info |
| **LiveAnnouncer** | `src/shared/ui/live-announcer.tsx` | aria-live region — announces topology node selection / search result changes etc. to screen readers |
| **Tooltip** | `src/shared/ui` (Radix-based) | every icon / shortcut hint |
| **prefers-reduced-motion** | globals.css base layer | automatically respected — for both Sigma pulses and framer-motion |

### 3.11 Auxiliary widgets

| Widget | Entry point | Role |
|---|---|---|
| **DocsQuickDrawer** | `/topology` topology (folder icon) | a vault document quick-preview drawer — pinned docs / recent / inline tree |
| **WorkspaceOntologyStrip** | `/` `/projects` header | a strip with current ontology stats — auto-hidden when there are zero matches. The unresolved-stub chip jumps to `/ontology` (the tree's stub list) |
| **ProjectKnowledgeTopologyScene** | shown when a node is selected on `/topology` | a detailed scene of the project's knowledge graph |
| **OntologyStubList** | `/` (bottom of the tree) | list of unresolved stub nodes + promote / dismiss actions (cloud-mode callable) |
| **VaultOntologyStubsPanel** | `/` (above the tree when vault mode is active) | visualizes stub nodes/edges extracted from vault frontmatter alone |

### 3.12 Shortcuts

| Key | Where | Effect |
|---|---|---|
| `⌘K` / `Ctrl+K` | anywhere | search palette (projects) |
| `⇧⌘K` | anywhere | global search (ontology + docs + projects) |
| `?` | anywhere | shortcut sheet |
| `Esc` | modal / builder | close / clear selection |
| `N` | `/ontology/edit` | new project node |
| `F` | `/ontology/edit` | toggle fullscreen |
| `Del` / `Backspace` | `/ontology/edit` | delete selected node |
| `↑` / `↓` | search / tree | move between items |

---

## 4. Data flow (mission v2 single-source)

```
md files (vault or cloud)               MCP server (AI agents)
  │                                          │
  ├─→ manifest (vault) / Firestore (cloud)   │
  │                                          │ (read/write)
  ├─→ Project[] ← useProjects (mode-aware)   │
  │                                          ▼
  ├─→ frontmatter → derive-ontology-from-vault → OntologyStub[] (local)
  │                       or
  │   manual editor / builder → knowledgeApprovedNodes/Edges (cloud)
  │                       or
  │   AI agent (Claude Code) → MCP add_concept / patch_concept → vault .md (local)
  │
  └─→ tree (`/`) / topology (`/topology` Sigma) / builder (`/ontology/edit` xyflow)
```

**Paths removed by mission v2 cleanup**:
- ❌ AI extraction (cloud LLM Gemini/Claude) → knowledgeExtractionJobs/Outputs
- ❌ Review queue (`/review/knowledge`) → knowledgeReviews/ApprovalEvents

Earlier data is preserved in cold storage but is read-only since the callables are gone.

---

## 4-A. Static data (mission v2)

In mission v2, the source of truth for `static` mode is the `docs/ontology/` dogfood vault —
the project expresses its own mental model as frontmatter markdown. At build time,
`scripts/build-docs-vault.mjs` scans the vault and bakes it into
`src/entities/docs-vault/data/manifest.json`.

- **1 project + 8 domains + 9 capabilities + 4 elements + 1 README ≈ 23 nodes**
- When a user has not selected a vault and is anonymous (static) mode, this manifest
  immediately renders topology / ontology / projects — zero-friction entry.
- The v1 `src/shared/mocks/demo-blueprint.ts` (6 containers, ~50 projects) was
  retired in PR #33/#34 (2026-04 to 2026-05). The new source of truth is the dogfood vault.

## 4-B. Framework / build-time surfaces

| Item | Location | Behavior |
|---|---|---|
| **app/layout.tsx** | root layout | TaxonomyProvider + ToastProvider + global styles. Title template `'%s · oh-my-ontology'` |
| **app/page.tsx** | `/` entry | RootEntryPage — anonymous users see the LandingPage; otherwise the OntologyViewPage |
| **app/topology/page.tsx** | `/topology` entry | HomePage (Sigma topology) |
| **app/manifest.ts** | `/manifest.webmanifest` | PWA manifest |
| **app/sitemap.ts** | `/sitemap.xml` | exposes static-export routes |
| **app/robots.ts** | `/robots.txt` | search engine crawl policy |
| **app/not-found.tsx** | 404 page | "lost your way" copy + home CTA |
| **app/error.tsx** | route-level error boundary | "unexpected error" + retry / topology home |
| **app/global-error.tsx** | layout-level error boundary | last line of defense |
| **app/project/[slug]/opengraph-image.tsx** | OG image | dynamic share card on the project detail |
| **app/project/fallback/** | static-export fallback | unknown slug → client-side Firestore lookup |

---

## 5. Constraints / intentional absences

### Removed in the mission v1 era (already done)
- **share link** (commit "share-doc cascade removed" — pushed to v2 collaboration)
- **GitHub webhook activity history** (commit "docs-vault-activity removed")
- **AI extraction client** (commit "ontology-extraction client removed")
- **HTTP push API** (commit "api-keys + receive-doc cascade removed")
- **dev-admin-bypass** (commit "dev-admin-bypass infra + 41 callsites cleaned up")
- **/admin/*** routes (deprecated)
- **legacy redirects** (/project/topology, /project/view)

### Removed by mission v2 cleanup
- **`/review/knowledge` review queue** — page + route + entity callables + functions handler all removed (Stage 4)
- **AI Cloud Functions** — `extract-gemini.js` + `ontology-extract.js` deleted entirely (Stage 3)
- **Cloud LLM extraction flow** — `enqueueExtractionJob` / `processExtractionJob` / `reclaimStaleExtractionJobs` removed (Stage 3)
- **`applyReviewAction` callable** — removed (Stage 4)
- **"Start analysis" UI CTA** — removed from all 4 views (Stage 1)
- **`approveKnowledgeOutput` / `rejectKnowledgeOutput` httpsCallable wrappers** — removed (Stage 4)
- **the dual stepper's "analysis stage"** — KnowledgeDocumentDetailPage went from 4 steps to 2 (Stage 4)
- **`/knowledge/*` routes + `KnowledgeDocument` / `KnowledgeDocumentVersion` entities** — entire surface retired (commit `a906635`). The vault is the single source of truth; cloud-mode users still read existing `knowledgeApprovedNodes/Edges` from the builder, but document-style upload/preview is gone
- **`/diagnostics/*` routes + Firestore seed scripts** — operations insights are now owned by `/ontology/insights` (commit `b323571`)
- **TBox surface (`/settings/ontology[/history]`)** — `kind:` in frontmatter *is* the schema (commit `3a46c78`)
- **`functions/` folder itself** — `firebase.json` now omits a Functions deploy (commit `8eac23e`); the project ships as a static export to Firebase Hosting only

### Intentional absences
- **Multi-account**: none — `accountId = null` is fixed (held back for the v2 collaboration phase)
- **External IAM**: none — Firebase Auth (email/password + Google OAuth) only
- **firebase deploy**: not run, by user policy. Further mission v2 cleanup retired the `functions/` folder itself (since vault frontmatter is self-approving, publish/promote/dismiss gates are unnecessary)

---

## 6. Verification (post-OSS-launch readiness, 2026-05-02)

- tsc 0 errors
- eslint 0 errors (62 warnings — all pre-existing)
- vitest **100 files / 721 tests pass**
- MCP server stdin/stdout JSON-RPC: initialize → tools/list (12 tools) → tools/call all healthy
- MCP parser smoke pass
- Playwright MCP browser-level QA (current routes): zero console errors on every mission v2 surface
- CLI smoke (`node cli/src/index.mjs init test-vault`) writes 5 starter `.md` + `.mcp.json.example`
- `npm pack --dry-run` audit: 0 secrets / 0 PII / 0 absolute paths in either tarball

---

## 7. Where to start — user workflows

```
1. New user (no login):
   /docs → "open a markdown folder on my PC"
   → vault active → /, /topology, /projects all auto-recognize it

2. Register an AI agent (Claude Code) (optional):
   copy .mcp.json.example → set OMOT_VAULT → restart Claude Code
   → mcp__oh-my-ontology__* 12 tools become available

3. Add a new project:
   (a) directly in the vault:
       write projects/my-project.md
       ---
       kind: project
       title: my project
       category: in-progress
       status: developing
       dependencies: [auth, billing]
       ---
       → automatically appears on /, /topology, /projects

   (b) UI quick create:
       /projects → click "new project" → ProjectQuickCreatePanel
       → vault `.md` is auto-generated (mode-aware)

   (c) AI agent (MCP):
       the agent analyzes the code and calls mcp__oh-my-ontology__add_concept
       → writes the vault `.md` directly

4. Add an ontology concept:
   (a) frontmatter-based (human):
       add kind: capability + relates: [...] to a document
       → appears in the / tree as a stub automatically

   (b) directly in the builder (human):
       /ontology/edit → palette → click a node → drag a handle → save

   (c) AI agent (MCP):
       mcp__oh-my-ontology__add_concept / add_relation / patch_concept
       → vault frontmatter updates → / tree updates automatically

5. Explore:
   ⇧⌘K (global search) → kind filter → jump
   / → tree + ego graph exploration
   /topology → Sigma visual network
   /ontology/insights → activity / hubs / orphans
```

---

## 8. OSS distribution surfaces (post-launch readiness)

What ships outside the running app — designed so global users can adopt the project without reading Korean.

### 8.1 npm packages

| Package | Path | Required for | Distribution |
|---|---|---|---|
| `oh-my-ontology-mcp` | `mcp/` | AI agent integration (Claude Code, Cursor, …) | Public, MIT, free; install via `npx -y oh-my-ontology-mcp` |
| `oh-my-ontology` | `cli/` | CLI vault scaffold (`init` subcommand) | Optional — the web `/docs` scaffold button is the alternative |

Both go through `npm pack --dry-run` audit before any publish — 0 secrets / 0 PII / 0 absolute paths verified.

### 8.2 Hosting

- **Firebase Hosting** at `https://oh-my-ontology.web.app` (free Spark plan)
- Static export only (`output: 'export'` → `out/`); no Firebase Functions runtime needed
- `firebase.json` defines the deploy with `predeploy: pnpm build` and a `/project/[slug]` rewrite to `/project/fallback`
- `docs/DEPLOY-FIREBASE.md` — step-by-step deploy guide (English)

### 8.3 GitHub OSS surfaces

| Surface | What |
|---|---|
| `README.md` | English first + Korean sub-section, hero hosted-demo link, MCP / CLI / scaffold quickstart |
| `AGENTS.md` | English first + Korean sub-section — canonical contributor guide for every AI tool |
| `CONTRIBUTING.md` | English — branch naming, conventional commits, FSD boundaries reminder |
| `LICENSE` | MIT |
| `.github/ISSUE_TEMPLATE/*.yml` | 3 bilingual issue forms (bug report / feature request / question) + config disabling blank issues |
| `.github/PULL_REQUEST_TEMPLATE.md` | Bilingual PR template (Summary / Test plan / Screenshots) |
| `.github/DISCUSSIONS-CATEGORIES.md` | Discussion category taxonomy (Korean — internal admin reference) |
| GitHub Discussions | Activated programmatically via `gh api PATCH ... has_discussions=true`; welcome post #108 created |

### 8.4 OSS docs

All English unless noted:

| Doc | Purpose |
|---|---|
| `docs/PUBLISH-NPM.md` | step-by-step npm publish guide for maintainers, includes the publish-guard explanation |
| `docs/TROUBLESHOOTING.md` | common issues for end users — vault scaffold / MCP / build·test / publish |
| `docs/PRODUCT-DIRECTION.md` | mission v2 direction |
| `docs/FEATURES.md` | this file |
| `docs/ARCHITECTURE.md` | architecture and FSD boundaries |
| `docs/DATA-MODEL.md` | Firestore schema + Storage layout |
| `docs/DESIGN-SYSTEM.md` | tokens / motion / forbidden visual patterns |
| `docs/MODE-AWARE-CRUD.md` | local / cloud / static branching guide |
| `docs/DEPLOY-FIREBASE.md` | hosting deploy |
| `docs/launch/*.md` | HN / Reddit / X drafts (Korean — internal launch material; published only after maintainer review) |

### 8.5 npm publish guard (3 layers)

A defense-in-depth block against accidental `npm publish` by AI agents:

1. **`CLAUDE.md` rule** (Claude-specific guidance): never run publish without explicit user approval
2. **`.claude/rules/forbidden.md`**: same rule in the auto-loaded forbidden-patterns file
3. **`.claude/settings.json` PreToolUse hook** + `.claude/hooks/block-npm-publish.sh`: actually intercepts Bash commands matching `npm/pnpm/yarn publish` (and `npm pack` without `--dry-run`) and returns `permissionDecision: "deny"`

Tested against 7 input shapes (publish variants blocked; `npm whoami` / `npm pack --dry-run` / regular commands allowed).
