# FEATURES — ontology-atlas

> Complete inventory of features users can **actually use right now**.
> Last updated: 2026-07-18 (전 페이지 시안-우선 재구성 웨이브, PR #355~#366 —
> `docs/prototypes/` 승인 시안 기반으로 `/`·`/topology`·`/project/[slug]`·
> `/ontology/edit`·`/ontology/insights`·`/docs`·`/projects`·`/download`·project
> 폼을 재구성. 3-tab insights, 352px 데이터시트, 3-pane 빌더, engraved census
> 헤더가 모두 이 라운드에서 나옴 — 세부는 §2 각 라우트 절 참고). Earlier
> (2026-05-31): real-time **adaptive** vault polling, `/docs` editor save-conflict data-loss guard, fresh-init starter ambiguous-alias fix, `find_evidence` relevance ranking, `validate_vault` vault→code `pathDrift`, `infer_imports` edge reconciliation. Earlier still (2026-05-28): graph DB health gate, `/ontology` Browse / Write / Query loop, Builder proof handoff role, desktop route smoke.
> Routes section UI detail remains a maintained product snapshot. When route
> behavior changes, update this file alongside the PR body and CHANGELOG.
> Update trigger: reflect immediately when surfaces are added or removed. Update alongside the PR body and CHANGELOG.

---

## 0. At a glance

> **Mission v3**: "One codebase, one ontology, that the developer and their AI agent grow together."
> **Launch framing v4**: "A repo-native memory layer for Claude Code, Cursor, and Codex."
> **Operating model**: single-user tool. Local-first vault. No login, no backend. **4 surfaces (macOS app · CLI · MCP · Website)** — daily heavy-lift ontology work happens in the installed app / CLI / MCP; the hosted website's root map lets anyone open their own local vault folder directly too (root-first-open, 2026-07), while `/download` stays the product intro + release download path.
> **Brand split**: **Ontology Atlas** is the user-facing macOS app / website brand and macOS release asset identity. `ontology-atlas` remains the repo, CLI binary, and MCP package name.

The product should not feel like an ontology editor. The core user-visible loop
is `init -> bootstrap -> MCP-backed agent answer -> agent sync proposal -> git
diff review -> better next agent task`.

| Surface | Entry | Audience |
|---|---|---|
| **macOS app** (Ontology Atlas desktop distribution track) | signed DMG → installed local workbench; first run opens `/docs/?intent=local` vault setup welcome; visual routes `/docs`, `/ontology`, `/topology`, `/projects`, `/ontology/edit`, `/ontology/insights` | daily visual ontology work — pick a local vault folder, edit markdown-backed nodes/relations, reopen recent vaults without visiting the hosted site |
| **CLI** (R12 / R14 / R15+ · 48 commands) | `init / agent-setup / agent-activity / add / import / list / find / validate / mcp-verify / query / compile` (vault basics + existing-vault Claude/Codex config repair + explicit live activity heartbeat + installed MCP health/graph-query smoke + deterministic graph compile) · `index / analyze / infer-imports / bootstrap` (autonomous ingest and project ontology indexing) · `backlinks / orphans / path / explain / all-paths / reachability / relation-check / relate / rename / merge / delete` (graph CRUD + direct/path/common-neighbor explanation + bounded traversal + transitive closure + write preflight + write) · `match-nodes / match-edges / domain-matrix / facets / schema / pattern-walk / project-map / overview / hubs / blast-radius / cycles / components / topological-order / health / agent-brief / workspace-brief / growth / maintenance / node / similar` (graph deep dive — `query_ontology` ops, including graph DB-style node/edge scans, relation dashboard facets, relation schema patterns, explicit traversal and project maps, connected island checks, prerequisite ordering, relationship explanation, domain coupling matrix, agent handoff, and growth/maintenance queues) | developer terminal — vault scaffold, daily exploration, bulk import, MCP sanity check, live agent activity handoff, graph deep dive (same authority as AI agent via MCP) |
| **MCP** (R5 / R7 / R11 / R14 / R16 / R17) | 24 tools (16 read · 8 write) over JSON-RPC | AI agent (Claude Code, Codex, Cursor) — read for context · write back findings · bootstrap and index projects (R16 `analyze_repo_structure` · R17 `infer_imports` · R+ `index_project`) · compile/query/health/agent-brief/workspace-brief as graph-engine memory access |
| **Website** | Firebase static hosting / `/` + `/download` | `/` renders the topology map directly and lets you open your own local vault folder from the browser (File System Access API, no install); `/download` is the product intro + release download path. Only `/docs`'s own separate local-source *browsing* tab stays desktop-only. |

```
input (humans + AI agents)     parse           store              output
        │                       │                │                │
        ▼                       ▼                ▼                ▼
  .md in vault  →          frontmatter   →  user disk      →  Browse (/, /ontology) tree+ego
  (frontmatter)                              (vault)           Topology (/, /topology) canvas-2D map/graph
  + AI agent (MCP)                                            Builder (/ontology/edit) xyflow ERD
                                                              App views (/ontology, /topology, /docs)
                                                              Insights (/ontology/insights) census
```

---

## 1. Mode branching (data source)

`useDataSourceMode()` resolves to one of two modes (R10b: cloud / auth surface permanently removed):

| Mode | Condition | Behavior |
|---|---|---|
| **local** | desktop app vault folder active | vault manifest is the source of truth |
| **static** | no active vault | build-time dogfood manifest (this project's own ontology) |

**Effect**: when a user opens a vault folder in the installed app, `/`, `/topology`, `/projects`, `/project/[slug]`, `/ontology`, `/ontology/insights`, and `/ontology/edit` all switch to vault data instantly. Mutations (create / edit / delete / connect) are mode-aware: local → write to vault `.md`; static → rejected with toast (read-only) and routed toward the macOS app download on hosted web.

**Bootstrap from existing docs (2026-07-20, Slice 1)**: opening a folder that
already has markdown but no `kind:` frontmatter used to strand the user on a
"0 concepts" map with misdirected copy. Now the topology empty state
acknowledges the found documents ("문서 N개를 찾았어요") and offers **내 문서로
지도 만들기** — a blocking dialog that proposes candidates from the already
scanned manifest (root README → project title · 1-depth folders → domains ·
each doc → element with `domain:`), and on confirm writes ONLY frontmatter to
the accepted docs (bodies untouched) plus one new `project.md`. Pure candidate
derivation: `src/features/docs-vault-local/lib/bootstrap-candidates.ts` — the
browser equivalent of CLI `bootstrap` / MCP `analyze_repo_structure`, so all
three ingress paths converge on the same shape. Plain-language copy: the
dialog never says "온톨로지" (map-building framing for non-experts).

**Meaning & time surfaces (2026-07-21 execution run, PRs #425–#449)**:
- **Edge popover** — edges are first-class clickable objects on the map: a
  click within 7px opens a popover with a plain-language sentence ("A leans
  on B"), the formal type, both endpoints (click = focus), the declaring
  `.md` (with its change-date label), an optional **why** line
  (`relation_notes`), and an edit-relation deep link.
- **Relation rationale (why)** — `relation_notes: {ref: one-line-why}` in
  frontmatter; MCP `add_relation` takes `why` and writes relation + note in
  ONE frontmatter write; `rename_concept` rewrites note keys (collision:
  existing new-key note wins).
- **Agent connect sheet** — INDEX footer agent status opens a sheet:
  heartbeat-file connection state, Claude Code/.mcp.json + Codex + generic
  registration snippets (desktop autofills the path), config-file writer on
  desktop, and an agent-brief preview that speaks the user's own domain
  names.
- **Hierarchy ink ladder** — containment edges carry depth (L0 project
  spine → L2 leaf) as width×value (never hue); pass-through edges (both
  endpoints off-screen) get demoted ink; `depends` bows are
  direction-consistent perpendicular offsets (mutual pairs separate).
- **Magnitude & type scale** — domain/capability radii encode descendant
  count (log-compressed); labels/engraved numerals scale sub-linearly with
  zoom (widthCache keys include quantized font size).
- **First-map reveal** — after "내 문서로 지도 만들기", nodes assemble out
  of the project position and spring-settle into place (reduced-motion
  arrives instantly).
- **Idle frame gate** — the canvas stops physics+paint after 1.2s of true
  idle (rAF stays alive; any state change resumes next frame).
- **Canonical census** — every surface that says "개념 N" uses one
  derivation (`computeCanonicalCensus`); the builder honestly says
  "저장된 개념 N" for its file-backed scope.
- **Docs library on the web** — the local-vault gate is capability-based
  (File System Access), not runtime-based: the same browser session that
  writes via the builder can read/edit in the docs library.
- **Relation vocabulary** — one dictionary (formal/plain × 7 types × ko/en)
  feeds the map legend, insights, builder, and datasheet (contract-tested);
  the "?" sheet footer defines 도메인/역량/요소 in plain language.

**Single source of truth (R8)**: `LocalVaultProvider` mounts once in `app/[locale]/layout.tsx`. Its many `useLocalVault()` consumers (`RootEntryPage` / `AppNavRail` / `OntologyEditPage` / `DocsVaultPage` / `useDataSourceMode` / `useProjects` / `useProjectMutations` / `useVaultOntology` and more since feat/rail-rollout mounted the rail everywhere) share one state instance, one IDB rehydrate, one filesystem walk.

**Desktop first-run (2026-07-18)**: in the installed app (Tauri — detected via
`isDesktopShell()`, `src/shared/lib/desktop-shell.ts`), `/` with no vault
renders an Obsidian-style **FirstRunPage** (`src/views/first-run/`): three
machined cards — open vault folder / create new vault (existing
`scaffoldOntology()` when the picked folder is empty — 5 markdown seeds +
agent configs) / browse the built-in demo vault — plus a local-first trust
line. No download CTA inside the installed app.

**Web root-first-open (2026-07-18)**: on hosted web, `/` no longer shows a
marketing landing page at all — with no vault selected it renders `HomePage`
(the same topology hub `/topology` uses) drawing this project's own dogfood
sample, read-only, plus a **first-run starter module** integrated into the
INDEX panel itself (no floating card/dock — `FirstRunStarterModule`,
`src/features/first-run-starter/`): census meters (concepts/relations/
domains, real data) + "open my markdown folder" (calls
`useLocalVault().open()` directly, same File System Access API path as the
desktop picker) + "create a new vault" + "just looking around" dismiss
(sessionStorage — reappears next session, not on reload). A brand-pill
`SAMPLE` badge and a bottom-right map readout ("N project · N domains ·
Spine view · zoom in to reveal elements") stay visible for the whole static
session regardless of whether the starter module was dismissed. The former
`LandingPage` and its hero/value-chain/evidence-instrument content moved to
`/download` (see below) — a returning user whose vault handle restores from
IndexedDB goes straight to their own workspace, no starter surfaces at all.

---

## 2. Routes (12 `[locale]`-prefixed routes)

### `/` — Smart entry

- **Hosted web, no vault** → `HomePage` rendering the dogfood sample read-only, plus the INDEX-panel first-run starter (see above) — no separate marketing landing page since root-first-open (2026-07)
- **macOS app, no restored vault** → `FirstRunPage` (open / create / browse demo), not the hosted intro
- **Recent desktop vaults** → the picker stores recently opened Tauri vault paths, can reopen them without another Finder selection, and can remove stale paths from the list
- **Vault loaded (web or desktop)** → `HomePage` — the topology hub (map + INDEX concept panel + node datasheet), same component `/topology` renders (B3 허브가 곧 지도 — the old tree/ego hub, `OntologyViewPage`, is retired; `/ontology` now redirects here with INDEX expanded). Restoring a previously-opened vault handle from IndexedDB goes straight here — no starter surfaces, no re-clicking through first-run every visit
- **Switch vault mid-session**: the topology settings gear (⚙, top-right utility rail) has a "switch vault" row → `/docs/?intent=local`, alongside the `/docs` vault pill's own "swap" control

### `/download` — Intro + download (absorbed the retired LandingPage, Slice 2 2026-07-18)

- **Intro section** (top of the page, above the release/trust content): Ontology Atlas brand header + macOS-first title + subtitle + 3-step value chain rail (01 / 02 / 03) + the dogfood evidence instrument (project hex + domain chips + hub capability circle, real `docs/ontology` census — `src/views/download/model/dogfood-census.generated.ts`, built by `scripts/build-docs-vault.mjs`)
- **Primary CTA**: "Open macOS releases" → GitHub Releases
- **Secondary CTA**: "View source code" → GitHub repo
- **First-release checklist**: shows macOS app blockers (PR review, tag/package/Tauri/Cargo version alignment, Developer ID signing/notarization, v0.1.0 GitHub Release) separately from the Firebase Hosting `/ko/download/` website deploy gate; it also exposes a copyable `pnpm desktop:release-status -- --pr=<number> --include-hosted-surface` completion audit that writes owner-grouped blocker JSON and a reviewer checklist before anyone waits on CI. Rebuild with `NEXT_PUBLIC_OATLAS_FIRST_RELEASE_PENDING=0` after verified DMGs publish and the hosted download route is live to hide it.
- **Live deploy verification**: `pnpm desktop:verify-hosted` checks the deployed `ontology-atlas.web.app` root/download pages — root-first-open changed this contract from "root stays promo-only" to "root offers the local-folder open CTA directly"; it now asserts `/ko/` includes the CTA and `/ko/download/` still points to the stable GitHub Releases page, not `/releases/latest`.
- **Privacy note**: the installed app and vault data use local disk as the source of truth; `/docs`'s own local-source *browsing* tab stays desktop-only (unrelated to opening your primary vault from `/`)
- **Footer**: license · GitHub · stack chips · `LocaleSwitch`

### `/` and `/topology` — canvas-2D topology hub

Both routes render the same `HomePage` (R3 keep-both decision: `/` = home/back-link target, `/topology` = explicit deep-link namespace).

#### Views (2-view rail) + workflow entry points
- **지도 (overview, default)** — Relief skeleton: deterministic project/domain/hub layout with card choreography (read-first decision surface)
- **그래프 (graph)** — Obsidian-style living graph: all ontology nodes under an always-on d3-force simulation (Web Worker), free node drag with position persistence, hover ego highlight. Node click keeps graph mode (no focus hijack)
- 초점/경로/상태 are **not top-level tabs** (R+ owner feedback: "5 identical-looking modes"):
  - **초점 (focus)** — enters via node click on the map (selection state); `mode=focus` deep links preserved
  - **경로 (path)** — enters via shift-click of 2 nodes or `mode=path` deep links
  - **상태 (health)** — enters via the 정리 queue count chip on the view rail; `mode=health` deep links preserved

#### Canvas (`topology-map-v2` — custom canvas-2D engine + Graphology ForceAtlas2 physics)
- **Click node** → right-side panel opens (`ProjectDrawer` for project nodes, the 352px node datasheet for domain/capability/element nodes — see "Node datasheet" below)
- **Drag node** → reposition (releases back to physics)
- **Double-click node** → "local graph" mode (2-hop neighbors only, breadcrumb: `Local · Root · slugA · slugB`, click to backtrack, Esc to exit)
- **Right-click node** → context menu (Focus / Local graph / Copy detail URL)
- **Shift-click 2 nodes** → highlight shortest path
- **Tab** → keyboard cycle to neighbor hub
- **Empty state** (0–1 nodes) → `TopologyEmptyState` card with 3 CTAs (tree / builder / open vault)
- **Filter active** → bottom-left "filter · N / TOTAL" badge

#### `SigmaControls` (top-right, collapsed default)
- Fit Map button · Open Controls button
- Expanded panel: search input · "Hubs only" toggle · Overlay section (recent-update pulse, backref highlight) · Advanced section (owner color, audit highlight, depth slider 1–7, force sliders, Reset layout)
- Shortcuts inside controls: `/` focus search · `0`–`6` set depth · `?` shortcuts sheet

#### `SigmaHubRail` (left, collapsed default)
- Hub list sorted by degree, click to select
- Keyboard: `↑/↓` cycle hubs · `Home/End` jump to first/last
- Suppressed when hero panel expanded (avoid overlap)

#### Top-right buttons
- **Source button** (`D`) → `DocsQuickDrawer` overlay with pinned/recent markdown source preview
- **Shortcuts button** (`?`) → `ShortcutSheet`
- **Settings gear** (`TopologyV2SettingsGear`, 2026-07-18) → compact anchored popover (228px), no scrim: 언어 (`LocaleSwitch`) · 테마 (`ThemeToggle`) · INDEX 기본 상태 (expanded/collapsed default, writes the same localStorage key the INDEX panel reads). Self-closes; owns its own Escape so the global topology Esc ladder doesn't double-fire. Desktop-only (1512/1920 scope)

#### Top-left brand pill (`HeroCollapsed`, compact-only since 2026-06-11)
- One pill, no expanded hero state (removed — it competed with the map for attention): selected project name, or workspace subtitle (concept/relation counts + weekly growth signal when > 0)
- Source Vault (`/docs`) and Ontology (`/ontology`) quick links inline
- Chevron toggles the selected-node inspector support rail when a node is focused, or closes the drawer/datasheet otherwise

#### Node datasheet — two variants by node kind
- **Project node click** → right-side `ProjectDrawer`: name + icon + category badge · description · tags · stack · "View project" (`/project/[slug]/`) · "Open workspace" (`/docs/?slug=...`) · connections summary (dependencies / referencedBy) · impact mode toggle (Default · Upstream · Downstream · Network) · integrity checks · screenshots (lazy top 2) · timeline · links · footer "slug · updated DATE"
- **Domain / capability / element node click** → `TopologyV2DetailPanel`, the 352px datasheet (scaled up from 288px, 2026-07-18): single engraved metric line ("쓰는 곳 N · 기대는 곳 N · 근거 N"), two direction groups — **쓰는 곳** (direct incoming — places that use this node) and **기대는 곳** (direct outgoing — places this node leans on), each capped with a "+N more" overflow; a promoted **근거** (evidence) group listing `evidenceIds` rows; a copyable agent handoff row (MCP/CLI-style payload); "전체 상세 →" opt-in to the full detail panel. Direction, not relation type, is the single grouping axis (R+ — avoids double-counting the same edge under both a type split and a direction split)

#### Mobile-only
- `BottomTabBar` (4 tabs: Ontology / Topology / Projects / Source) at safe-area bottom
- `GestureHint` overlay (dismissible, not persisted)

#### Global keyboard shortcuts (all `useTypingShortcuts`-gated)
| Key | Action |
|---|---|
| `⌘K` | Project search palette (`SearchPalette`) |
| `⇧⌘K` | Global search (`MountedGlobalSearch` — nodes + projects) |
| `D` | Toggle source drawer |
| `?` | Toggle shortcut sheet |
| `Esc` | Layered: exit local graph → close drawer → clear search |

---

### `/docs` — Ontology workspace (reader + editor + palette)

#### Crumbs row (2026-07-18, engraved vault census — always visible, above header)
- Back-to-workspace link · `Workspace` label · right-aligned engraved census (`concepts · relations`, mono numerals, sm+)

#### Header (always visible)
- Mobile tree-open button (<lg) · title · **vault pill**: vault path (md+) + doc count + top-level folder count (sm+) + swap/re-pick action · `Local` badge (when source=local)
- **Source toggle** (R3 cut C — radio: Sample / Local). Round 4 J: clicking Local auto-opens vault tools dropdown if no vault loaded yet
- **Palette button** (`⌘K`)
- **Inspector button**: opens the document outline, share/print actions, file actions, and backlinks only when requested, keeping the reading canvas quiet by default
- **Vault tools dropdown** (gear icon, only when source=local + supported):
  - Folder-topology view toggle (button)
  - `LocalVaultPicker` (open / close / refresh / re-authorize / status display)
  - `OntologyStarterCta` (when vault is empty)
  - "New doc" button (when canEdit)

#### Status banner (R9 cut, below header)
- Visible when `source=local && (status='error' || status='permission-needed')`
- Shows error message · "Open picker" button to reauth/re-pick
- Stops the silent server-fallback that was confusing users

#### Sidebar (`DocsSidebarBody`, persistent 280px pane on lg+, docs-vault-final spec)
- Three sections always visible (2026-07-18 — previously Pinned/Recent were tucked inside a collapsible "filter & saved" disclosure; an Obsidian-style vault workspace uses pinned/recent as often as the tree itself):
  - **Pinned** — pinned docs, unpin action
  - **Vault** (`DocsVaultTree`) — full folder hierarchy, kind glyphs + per-folder engraved counts, click to select, local search, tag-filter auto-expands folders
  - **Recent** — recently opened docs
- Tag filter stays its own collapsible disclosure (not this screen's primary purpose); active tag keeps it open

#### Mobile drawer (<lg)
- Hamburger button → overlay drawer with the same `DocsSidebarBody` contents

#### Content area
- **view=doc** (default): editor (when editing) or viewer + `DocMetaBar` (word count, reading minutes, tags, updated date) + `DocFrontmatterBlock` (2026-07-18 — renders `kind`/`slug`/`domain`/`depends_on`/`evidence` directly on the page, only when the doc has a `kind:`; the visible proof that "frontmatter is the graph") + optional inspector (`DocsVaultDocOutlinePanel`) + `DocsVaultProjectDepsBar` (in `projects/*` + local) + bottom **backlinks strip** (2026-07-18, full pane width, dedup'd single source — replaces the earlier duplicate backlinks surfaces)
- **view=folder-topology** (local only): mini Sigma over `projects/*.md`, drag positions saved to frontmatter, `+ Project` button (canEdit)

#### Unified palette (`⌘K`, `DocsVaultUnifiedPalette`)
- **Empty query**: pinned → recent → top 5 commands
- **`>` prefix**: command fuzzy match
- **`#` prefix**: tag fuzzy match
- **General query**: doc title/slug/tags/excerpt search (15 results) + command substring (5)
- Keyboard: `↑↓` move · `↵` execute · `Tab` cycles mode (`""` → `>` → `#`) · `Esc` close
- Doc rows are `<Link>` (⌘-click → new tab)

#### Editor mode (`DocsVaultEditor`, local only)
- Top bar: slug eyebrow · dirty indicator · saved flash · Preview toggle · Save · Cancel
- Save contract: `Auto backup` shows whether an unsaved browser-local draft exists; `Final save` shows whether the markdown file on disk still needs the Save button / `⌘S`
- Format toolbar: Bold / Italic / Code / H1-3 / Bullet / Numbered / Checkbox / Quote / Link
- Editor: textarea, monospace, optional 50/50 live preview (200 ms debounce)
- Wikilink autocomplete (`[[…`): top 8 matching docs, `↑↓ Tab Enter`
- Inline error red banner on save failure
- Keyboard: `⌘S` save · `⌘B` bold · `⌘I` italic · `⌘K` insert link · `Esc` close (with discard confirm)
- `beforeunload` blocks navigation when dirty

#### Commands (~20 in palette)
view-doc · view-folder-topology · pin · unpin · copy URL · print · edit · new doc · daily note · rename · delete · insert TOC · export doc HTML · export vault · import vault · scaffold topology · source-server · source-local · create project · find tags

#### Visual / behavioral details
- Indigo accent (`rgba(139,151,255,…)`) for active, gold star for pinned
- Markdown: GFM tables/lists/blockquotes/code · callout blocks (`> [!tip]` etc.) · wikilinks (`[[slug]]`, `[[slug|label]]`, `[[slug#anchor]]`, `[[project:slug]]`) · heading anchor copy buttons
- Local images: relative paths resolved to blob URLs via `resolveImage` callback
- Recent + pinned per-vault localStorage (key prefix includes vault folder name)
- Sample/Local source toggle persisted to localStorage; folder-topology view forced back to `doc` when switching to server

---

### `/ontology` — retired tree/ego hub → thin redirect (B3 허브가 곧 지도)

The tree + ego graph Browse surface this section used to describe
(`OntologyViewPage`, `OntologyTreeView`, the old `NodeDetailPanel`/ego SVG) is
retired. `/ontology` is now a thin client redirect
(`src/views/ontology-redirect/`) to `/topology/?index=expanded`, translating
its `?node=<id>` deep-link contract into `/topology`'s `?p=<id>` so every
existing agent-handoff / search / docs-viewer link built via
`buildOntologyNodeHref` keeps resolving instead of 404ing.

The hub itself — project → domain → capability → element browsing, node
selection, agent handoff copy — now lives inside `/topology` (see "INDEX
panel" under the `/topology` section below): a left instrument panel
(`TopologyIndexPanel`/`TopologyIndexTab`, `src/widgets/topology-index-panel/`)
that floats over the map, reusing the same `buildOntologyTree` /
`filterTreeByQuery` the old tree page used, so row search/select behavior is
unchanged even though the surface is.

`/ontology/edit` (Builder) and `/ontology/insights` (Query) are unaffected —
only the Browse leg of the old Browse/Write/Query loop moved.

---

### `/ontology/insights` — Insights (3-tab dashboard, rebuilt 2026-07-18)

Full rebuild against the approved `docs/prototypes/insights-final.html` mockup.
The previous round's 4-tab reader-persona system (proof / collaboration /
agent / census presets, session proof strip, collaborator brief, query-recipe
cockpit — ~6,200 lines) is gone; every number on this page now derives from
the same data source the page already used (`useOntologyInsight`,
`shared/lib/ontology-tree`) instead of a separate persona layer.

#### Header (always visible)
- Title + subtitle + right-aligned engraved census (`N concepts · N relations · N domains`)
- `TabBar` (개요 Overview / 관계 Relations / 신선도 Freshness), tab state in `?tab=`, each tab shows a live count badge (total nodes / total edges / freshness window in weeks)

#### Tab 1 — 개요 Overview
- **Hero census** (`InsightsHeroCensus`) — concepts / relations / health facts (orphan count, cycle count, domain-membership rate, evidence-linked rate)
- **Kind census** card — kind → glyph + bar + count, tallest bar highlighted
- **Domain capacity** card — domain → bar (capability/element sub-counts), hidden when there are no domains

#### Tab 2 — 관계 Relations
- **Relation breakdown** — every edge type as a bar row with a `TopologyV2TraceMark` (solid=containment, dashed=depends/relates) + count + percent of total
- **Top depends_on pairs** — from → to rows with counts, capped list
- **Hubs** — top nodes by degree, each with a 52px mini ego-thumbnail SVG (real spokes/degree from `buildHubEgoThumbnail`, not decorative) + degree count; "+N more" note when truncated

#### Tab 3 — 신선도 Freshness
- **Domain freshness heatstrip** — one row per domain, a week-by-week heat strip (neutral ramp, current week in indigo) built from real vault `updatedAt` values (`FRESHNESS_WINDOW_WEEKS`); domains with no dated docs are excluded from the stale count rather than counted as stale ("unknown" ≠ "old"); stale domains get a dashed "stale" tag
- **Recent updates** — most recently touched nodes with kind glyph, domain, and ISO date; footer shows total stale-domain count

#### Bottom handoff row (`InsightsHandoffRow`, always visible)
- One copyable `query_ontology(...)` chain per active tab (e.g. Relations tab copies `match_edges(type:"depends_on")` → `blast_radius`) — a single focused agent handoff instead of the old multi-panel query-recipe cockpit

Empty state (0 nodes): link to `/docs` (open vault).

---

### `/ontology/edit` — Builder (xyflow ERD canvas)
- **Drop-to-add**: 포트에서 빈 캔버스로 드래그를 놓으면 그 자리에 자식 kind 초안이 생기고 연결까지 이어진다(인스펙터 이름 입력 자동 포커스).

#### Layout (3-pane, resident only on xl+ — rebuilt 2026-07-18)
- Left palette (`OntologyKindPalette`, 240 px, collapsible to 44 px icon-only) · Center canvas (flex-1) · Right inspector (340 px, collapsible) — all three resident together only at `xl+`
- Below `xl` (but `md+`): the inspector becomes a centered modal sheet (scrim, `xl:hidden`) instead of a resident pane; a compact "open inspector" chip takes its place inline
- Mobile (<md): fallback card (eyebrow + title + body) with links to `/ontology` and `/topology` — layouts collide below `md`, so the builder doesn't try to render

#### Left palette (`OntologyKindPalette`)
- 4 kind buttons: Project / Domain / Capability / Element
- Click or `P` `D` `C` `E` → add ephemeral node
- Collapsed state: 44 px, icon-only (localStorage)

#### Center canvas (`ReactFlow` + dagre/force layout)
- Saved node entry rail: flat full-width canvas status strip with degree-ranked persisted project/domain/capability/element nodes, visible slug labels on every focus node, explicit `pick focus node` contract, active focused-slug chip, and highlighted current node so details, relation writes, and proof handoffs stay on the same vault slug before drawing
- Layout modes: Hierarchy (dagre LR, default) / Force (FA2)
- Auto-layout button (Wand2 icon) ignores frontmatter `canvasPosition` (in-memory only)
- Vault nodes: draggable, drag-stop patches `canvasPosition`
- Ephemeral nodes: in-memory until save
- MiniMap (bottom-right)
- Connection preview: indigo dashed bezier
- **Edge persistence**:
  - vault↔vault drag → auto-persist to source frontmatter array (R4 verified)
  - ephemeral endpoint drag → amber dashed `EphemeralEdge` with center "Save" chip (R4 cut I, R5 cut N validates title before persist to prevent `untitled.md` pollution)
  - relation write confirm and post-save handoff keep the graph proof path visible: Topology Path, endpoint focus, `/ontology/insights/` query cockpit, copyable CLI/MCP preflight, bounded `all_paths` contract, the `14 checks` runtime gate, and post-change sync gate.
- **Proof packet**: the header `Proof` cell shows the same `14 graph checks` runtime gate used by Source Vault and Insights, names `runtime replay` plus `relation_name_parity` and `pattern_walk` / `project_map` in the visible cell copy, then copies a graph DB-style runbook. The packet starts with the portable setup gate (`agent-brief --verify-fallbacks --json`), `agent-brief --graph-db-pack`, and the direct `pnpm dogfood:graph-db` runtime replay, so Builder verification begins from the same local graph DB pack contract as Insights. Overview mode then runs `workspace_brief`, `query_plan(match_nodes)`, `match_nodes`, planned generic `match_edges`, planned `depends_on` public relation scans, planned frontmatter-key `elements` scans, `facets`, `schema`, and `health`; CLI fallbacks include the matching `--plan` scans before raw `match-nodes` / `match-edges`. Selected-node mode prefers the canonical vault slug for the visible Insights link, card copy, and MCP/CLI proof commands, then adds `node_profile`, incoming `blast_radius`, planned incoming/outgoing edge scans, planned `depends_on` relation-name parity scans, `query_plan(all_paths)`, bounded `all_paths`, `relation_check` target/type placeholders, shell-safe CLI fallbacks, the scan-to-proof checklist, and the shared post-change sync gate. The cell also exposes a direct sync-gate copy action for users who already have enough query evidence.
- **`BuilderWriteConfirmBar`** (2026-07-18, bottom of canvas, md+) — a single status/action bar with a status line (`relationPending` / `draftReady` / `draftNeedsName` / clean) and two actions: "dry-run" and "vault 에 쓰기" (routes to whichever existing handler applies — confirm pending relation / save ephemeral node / open detail)
- **Relation trace-mark** (`relation-trace-mark.ts`) — the same solid/dashed/dotted convention used in the topology datasheet and `/project/[slug]`: containment keys (`domains`/`capabilities`/`elements`/`contains`) solid, `dependencies`/`relates` dashed, `describes` (evidence) dotted

#### Right inspector
- **Ephemeral node**: name input (auto-focus + select) · slug preview · coordinate display · Save button (`Enter`, disabled if title empty/placeholder)
- **Vault node**: title rename (Enter to commit) · slug (read-only) · vault/dogfood badge · backlinks chips
- Editable (when canEdit + live vault):
  - Literal editors: domain (single-line, blur to commit), description (multiline)
  - Array editors: capabilities / elements / dependencies / relates — chip list with `✕` to remove, input + Add to append, newly added items 1.2 s amber highlight
- Delete button (vault node only) → `BlastRadiusConfirm` modal (backlinks shown)

#### Header toolbar
- Help tooltip (palette + drag-to-connect + Save chip onboarding)
- Export buttons (only if nodes/edges exist): Markdown · JSON-LD · GraphML
- Layout toggle: Hierarchy / Force radio
- Auto-layout button
- Fullscreen toggle (`F`)
- Clear ephemeral button (two-step confirm, 3 s timeout)

#### `BuilderOnboarding` (when canvas empty)
- 3-step coach mark: Palette → Connect → Save chip
- "Don't show again" toggle (localStorage)

#### Keyboard shortcuts
| Key | Action |
|---|---|
| `P` / `N` | Add Project |
| `D` | Add Domain |
| `C` | Add Capability |
| `E` | Add Element |
| `F` | Toggle fullscreen |
| `Del` / `Backspace` | Delete selected ephemeral (vault nodes protected) |
| `Esc` | Clear selection or exit fullscreen |
| `Enter` (inspector input) | Save ephemeral node / commit vault rename |

---

### `/projects` — Project list (rebuilt 2026-07-18)

Rebuilt against RATIO-SYSTEM (1600px shared container). The previous
search/filter/CSV list UI (full-text search, phase/status chips, paginated
grid cards) is gone — replaced with an engraved census header and full-width
project cards; there is currently no in-page filtering.

#### Header
- Crumb row (Home → Projects) + right-aligned engraved census (`concepts · relations`)
- H1 + census line (`N projects · N domains · N concepts`) + "new project" CTA

#### Recent activity strip (when any docs exist)
- Up to 4 rows of the most recently updated vault docs: kind glyph · slug · one-line "what" summary · domain (or "no domain") · relative time ("today" / "yesterday" / "N days ago")

#### Cards (one full-width `<article>` per project, stacked, sorted by `updatedAt` desc)
- Hex kind-glyph + name + relative-time-updated dot + description · slug
- **Fact strip** — 5 engraved facts: domain / capability / element / document / relation counts (single-project vaults without `projectIds` stamping fall back to counting every node as this project's own)
- **Domain composition rows** (when the project has domains) — domain glyph + title + proportional meter bar (indigo for the largest) + `total (capability N · element N)` summary
- Footer: "See details" · "View topology" links + right-aligned `updated DATE · path`

#### Dashed "next project" slot (always shown, bottom)
- Project kind glyph + title + subtitle
- Two rows: CLI command to add a project + caption, and MCP/agent command to add one + caption — the empty-state affordance is now "ask the CLI or your agent," not a create form

#### Empty state
- No projects at all → lede text pointing at the same CLI/MCP next-slot row (no separate quick-create panel on this page anymore)

---

### `/project/[slug]` — Project detail (3-zone rebuild, 2026-07-18)

Rebuilt as a single-container 3-zone layout (`docs/prototypes` chrome), one
level below `/projects`.

#### Top bar
- Breadcrumb: Home → Projects → `{Name|Slug}` · Source Vault link · copy-link button · global census (concepts/relations, md+)

#### Zone 1 — hero band
- Project kind glyph + inline-editable name (`InlineEditable`, when `canManageProject`) + hero meta (Hub label or plain label · status) + updated date + inline-editable description
- "View topology" link + `ProjectQuickEditPanel` (quick-edit: name / description / owner / tags — the fast path; stack/links/dependencies/dates stay in the full editor)
- **Engraved metric strip** — domains / capabilities / elements / documents / relations, derived from this project's own ontology nodes/edges (not the whole vault)
- **Mini domain map** (`MiniDomainMap`, lg+, only when the project has domains) — real proportional SVG by domain node count, "open in topology" link

#### Zone 2 — domain composition
- Grid of domain cards (1 col / 2 col sm / 3 col lg), only rendered when the project has domains (hidden entirely on 0 domains — "match 0 → hide" principle), each linking into topology focus for that domain

#### Zone 3 — body + summary rail
- **Body card** (left, flexible width) — `project.detail` markdown, or an empty-state hint when absent
- **Summary rail** (right, 400px on lg+):
  - **Connected projects** card — dependency + `relates`-graph projects, dedup'd, first shown + "+N more" note; the connection-map mini-graph that used to sit above this card was retired (2026-07, demo-unreachable — dogfood's single-project vault always showed the map's empty state, and the same typed fact already lived here)
  - **Agent handoff** card — copyable MCP/CLI snippet for this exact project slug

#### Footer
- Slug + updated date, engraved mono caption

#### Mobile / narrow
- `ProjectQuickEditPanel` doubles as the mobile quick-edit entry (hamburger menu context)
- Search palette (`⌘K`) and shortcut sheet (`?`) open as page-local overlays (not a route change) so context isn't lost

#### Empty / not-found
- Invalid slug → "Project not found" panel + back-to-workspace button
- Loading → "Loading project data" gray panel

---

### `/project/[slug]/edit` and `/project/new` — Full editor

`ProjectForm` (2026-07-18 — 640px centered form column + 260px companion column, `docs/prototypes/project-forms-final.html` + RATIO-SYSTEM; 4 collapsible sections + sticky save bar):

1. **Basics** (always open) — slug (disabled in edit, auto-slugify in create) · name · nameEn · category (taxonomy select) · status (taxonomy select)
2. **Story** (collapsible) — description (required) · detail (markdown) · tags CSV · stack CSV · linksText (multiline `label|URL`)
3. **Network** (collapsible, collapsed in create) — dependencies picker with cycle check (suggestions from description/detail text)
4. **Operations** (collapsible, collapsed in create) — startedAt · launchedAt (date order validated) · owner · icon · progress · `isHub` checkbox

Section labels are engraved (mono uppercase caption + hairline), matching the census styling used elsewhere in this wave.

#### Validation (`schema.ts`)
- slug: `/^[\p{L}\p{N}-]+$/u` (Unicode letters/numbers/hyphen)
- name + description required (min 1)
- linksText: each line `label|https://…`, http(s) only
- dates: ISO 8601 YYYY-MM-DD, `launchedAt >= startedAt`

#### Actions
- Save & continue · Save & return · Cancel (with dirty-state guard via `beforeunload` + router intercept)
- **Delete** (edit-only) — isolated in a single dashed-border danger row at the bottom of the form (2026-07-18; dashed border is the destructive-action category signal, matching the design system rule); no other delete affordance on this page
- Form nav pills jump to sections
- Top + bottom sticky save bar

#### Companion column (260px, sidebar, collapsible <lg)
- Live preview `ProjectCard` · completeness % · public status · change summary (max 4 items)

#### Note
- `screenshots` field exists in schema but no uploader UI (markdown/vault assets only — codex Round 6 finding)
- Folder-topology scaffold path (`/docs view: folder-topology`) creates `projects/{slug}.md` without `description` (different contract from this canonical form, by-design — Round 6 skip)

---

### `/project/new` — Create

Same `ProjectForm` minus existing-project context.
- Submit buttons: "Create & continue" / "Create & return"
- Tips panel (easiest path: name → category/status → description, then save)
- `ProjectQuickCreatePanel` still exists as a component but is no longer surfaced from `/projects` (2026-07-18 — that list's empty state now points at the CLI/MCP next-slot row instead); this full form remains the canonical create path

### `/project/fallback` — Static-export fallback

Used when a non-existent slug is hit in static export. Redirects or shows "not found" panel.

---

### `/download` — macOS app download (rebuilt 2026-07-18)

RATIO-SYSTEM 1600px container / 960px centered utility column.

#### Header
- Back link · eyebrow · right-aligned "macOS · DMG · GitHub Release" caption · `LocaleSwitch`
- Title + subtitle · primary CTA (download DMG) + secondary CTA (view source on GitHub)

#### Engraved fact strip (real repo facts only — no DMG has shipped yet)
- Version (`RELEASE_VERSION`, from `package.json`/`tauri.conf.json`) · format (DMG) · architecture · **size: "게시 시 기록" placeholder** (honest — no built artifact to measure yet) · min macOS (`RELEASE_MIN_MACOS`) · channel
- SHA-256 row below it: a placeholder all-zero hash + "게시 시 기록" note + copy button — same honesty contract as size

#### First-release checklist (shown until a real release ships; `showFirstReleaseChecklist` prop)
- PR review / tag+version alignment / secrets / release / hosted-surface checklist items
- Copyable `pnpm desktop:release-status ...` audit command

#### "Includes" cards (3, sm+)
- Topology map · MCP server (tool count) · CLI (command count)

#### Install steps (4, numbered 01–04, sm+ 2-col grid)

#### Trust panel + changelog preview (2-col on lg+)
- **Trust panel** — signed / notarized / checksum rows + a real `spctl --assess --type open --context context:primary-signature ...` verify command + a trust note ("security claims only made when re-verifiable")
- **Changelog preview** (`CHANGELOG_PREVIEW_ENTRIES`, sourced from `docs/CHANGELOG.md`) — version + a handful of recent entry titles + "as of DATE" caption

#### GitHub row + release-gate note + footer
- GitHub repo link row · a note that the release gate must pass before this page's CTA is "real" · footer (license / GitHub / stack)

---

## 3. MCP server (24 tools)

Run via `pnpm exec node mcp/src/index.js` (registered in user's `.mcp.json`). AI agents read/write the same vault as humans.

**R14 — workflow automation** (Claude Code + Codex):

| Trigger | What | Where |
|---|---|---|
| **SessionStart hook** (implicit) | Compact vault census auto-injected into agent context on session start: total nodes, kind distribution, and only an actionable drift warning when needed. The hook deliberately avoids domains, hub lists, and full node tables to keep token use low. | `.claude/hooks/inject-ontology-summary.sh` / `.codex/hooks/inject-ontology-summary.sh` — silent in repos without a vault |
| **Explicit live activity CLI** | Agents or humans can still publish `.ontology-atlas/agent-activity.json` through `ontology-atlas agent-activity` when a handoff needs it. The automatic PreToolUse heartbeat hooks were removed during the token-budget pass; routine shell commands no longer update the sidecar implicitly. | `cli/src/commands/agent-activity.mjs` · `src/features/docs-vault-local/model/agent-activity-status.ts` |
| **`/ontology-bootstrap` skill** (cold start) | Empty vault → first 5–15 nodes from code structure. `analyze_repo_structure` side-effect-zero → user picks candidates → land via batch writers | `.claude/skills/ontology-bootstrap/SKILL.md` / `.agents/skills/ontology-bootstrap/SKILL.md` |
| **`/ontology-sync` skill** (code change) | "I'm done with this task — please sync the ontology now" loop. git diff + context → MCP write tools | `.claude/skills/ontology-sync/SKILL.md` / `.agents/skills/ontology-sync/SKILL.md` |
| **`/ontology-extract` skill** (prose ingress, R+) | User shares prose (meeting note / PR / RFC / Notion paragraph) → `find_evidence` + `similar_nodes` cross-check → candidate table → user picks → land. LLM hallucination guard via prose-source citation in body | `.claude/skills/ontology-extract/SKILL.md` / `.agents/skills/ontology-extract/SKILL.md` |
| **Agent config scaffold** | CLI `init` and the installed app starter write ready-to-use `.mcp.json` and `.codex/config.toml` files into the vault folder, so opening that folder in Claude Code / Cursor / Codex is enough to attach MCP. The empty-vault CTA previews the agent verification path before creation, both empty and existing-vault CTAs include a copyable prompt for Claude Code/Codex that falls back to the CLI setup gate when MCP is unavailable, CLI proof packet, and automation JSON gate, the Workspace palette exposes the same prompt whenever a local vault is loaded, and the local vault tools menu shows whether `.mcp.json`, `.codex/config.toml`, and `.mcp.json.example` are present, summarizes how many setup files are ready, names the next missing or invalid config, shows a three-step non-developer checklist (config files → agent restart → JSON gate before edits), and offers a repair action that creates only missing agent config files plus grouped copy buttons for a complete setup packet (preferred `agent-setup <vault> --root <codebase> --write` repair command + MCP/Codex templates + restart guidance + verification prompt + CLI fallback + automation JSON gate), the same read-first verification prompt, matching installed-CLI graph runbook (`validate` → `workspace-brief` → `agent-brief --prompt` → `agent-brief --graph-db-pack` → `agent-brief --verify-fallbacks` → `cycles` → `growth` → `maintenance` → `hubs --plan` → `hubs` → `mcp-verify`), a separate one-click automation gate (`agent-brief --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`) with visible command preview, the visible first-contact proof contract (`config_state` → `mcp_verify` → `json_gate` → `graph_briefs`), a separate codebase-root `agent-setup` repair command copy button, codebase-root `.mcp.json.example` template, codebase-root Codex `.codex/config.toml` template, and a one-line `codex mcp add ...` command for users who prefer Codex CLI registration; the starter README gives the same first-contact verification loop plus the `agent-setup /absolute/path/to/this-vault --root . --write` existing-vault repair path before any agent edit. `agent-setup --json` includes `docs.modeComparison` for the CLI-only, MCP-connected, graph DB pack, and setup gate modes, so AI tools can explain the right setup path without scraping Markdown. `agent-brief --verify-fallbacks` runs fallback commands through a bounded parallel queue, prints a human setup-gate line (`ok`, `performanceOk`, wall time, slow count, failed count) before per-command elapsed time plus the slowest fallback, and `agent-brief --verify-fallbacks --json` emits the same check as a compact machine-readable timing report for Claude Code/Codex automation with output samples only on failed rows, so local graph query latency is visible without flooding connector-less setup checks. Each fallback command has a 15s default timeout, configurable with `--fallback-timeout-ms N` or `OATLAS_AGENT_FALLBACK_TIMEOUT_MS=N`, and timeout rows report `timedOut:true` for fail-closed setup automation. Passing-but-slow rows are counted under `slow`, marked with `slow:true`, and summarized by `performanceOk:false` when they exceed the 5s default `slowThresholdMs`, tunable with `--fallback-slow-ms N` or `OATLAS_AGENT_FALLBACK_SLOW_MS=N`; fallback concurrency defaults to 4 and is tunable with `--fallback-concurrency N` or `OATLAS_AGENT_FALLBACK_CONCURRENCY=N`, so automation can distinguish broken setup from local graph latency drift without making the setup gate unnecessarily slow. Root-level CLI init writes matching cwd configs for codebase-root sessions. | `cli/src/index.mjs` · `src/features/docs-vault-local/lib/ontology-starter.ts` · `src/features/docs-vault-local/model/use-local-vault.ts` · `src/widgets/docs-vault/ui/VaultToolsMenu.tsx` · `src/views/docs-vault/ui/DocsVaultPage.tsx` |
| **10-minute memory loop smoke** | Fresh repo `init -> bootstrap -> validate -> workspace_brief -> agent_brief -> node_profile -> sync proposal` path is executable as a release-readiness gate, including git diff alignment before any side-effecting sync write. | `scripts/smoke-memory-loop.mjs` · `pnpm smoke:memory-loop` |
| **`/firebase-deploy` skill** (static Hosting deploy) | Reads local `.env.prod`, runs docs/type/build/bundle gates, deploys only Firebase Hosting, then verifies the live `web.app` URL. Keeps Firebase as static hosting, not backend. | `.claude/skills/firebase-deploy/SKILL.md` |
| **`mcp__ontology-atlas__*` `instructions` field** (R13 v0.7.1) | Server's initialize response carries kind hierarchy, first-time workflow, write safety patterns — every connecting agent gets the discipline without trial-and-error | `mcp/src/index.js` |
| **`.ontology-atlasignore`** (R+) | Vault-root gitignore-style file. Patterns match `materialize_external_element` refs in `growth_plan` / `maintenance_plan` and skip them. Intentional external code (e.g. `src/**`, `cli/**`) stops surfacing as noise. `externalElementRefsIgnored` count exposed for transparency | `docs/ontology/.ontology-atlasignore` (dogfood example) · `mcp/src/ontology-atlas-ignore.mjs` |

R14 also unified `add_concept` / CLI `add` / CLI `import` to a single per-kind frontmatter schema (`mcp/src/schema.mjs` ↔ `cli/src/lib/schema.mjs`) — three entry points, one shape.

**R14 — vault live updates** (`/topology` + all pages):

- **Adaptive polling** (visible-only) — `useLocalVault` fingerprint check while the tab is visible; bursts to ~1.5s right after a detected change and decays to ~5s when idle, so agent / CLI writes surface fast without idle churn (generation-token poller avoids orphaned timers across hide/show)
- **Graph diff pulse** — newly appearing slugs amber-pulse for 5s on `/topology`
- **Toasts** — `Added: <slug>` (info) / `Edited: <slug>` (success, mtime change) on every page
- **Save-conflict guard** — if a file changed on disk between read and write, `/docs` editor save surfaces a localized conflict notice and keeps the buffer dirty instead of silently overwriting unsaved edits
- Effect: IDE / AI agent / CLI 변경이 웹 탭 *focus 안 해도* ~1.5–5s 안에 그래프 + toast.

#### Read tools (15)
1. **list_concepts** `{ kind?, domain?, since?, summary?, limit? }` — every node, optional filters, mtime, and summary preview
2. **get_concept** `{ slug }` — full detail: frontmatter + prose excerpt + graph neighbors / `outgoingEdges[]` + `mtime` (ms; **R11** caller가 후속 patch/delete 의 `expected_mtime` 으로 전달하면 외부 변경 감지); warnings include frontmatter issues and dangling outgoing graph references
3. **get_concepts** `{ slugs }` — batch read (max 50), order-preserving partial results with the same per-node warnings
4. **find_evidence** `{ title }` — partial-match across title / capabilities / elements / body, with `domain`, `mtime`, and prose excerpt
5. **find_backlinks** `{ slug }` — every node referencing target (frontmatter arrays + wikilinks/markdown)
6. **find_neighbors** `{ slug, direction?, types?, includeNodes?, limit? }` — one-hop local graph around a node, with canonical incoming/outgoing `edges[]` and neighbor summaries (`includeNodes` defaults true, `limit` defaults 100/max 500); public relation type aliases like `depends_on` are normalized to stored graph keys
7. **find_path** `{ from, to, maxHops? }` — shortest undirected BFS across graph frontmatter, including `domains` / `domain` containment (default 5 hops, includes aligned `nodes[]` summaries plus `edges[via]`)
8. **list_kinds** — vault kind census `{ total, byKind: { capability: N, … } }`
9. **find_orphans** `{ kind?, excludeKinds? }` — isolated nodes across graph frontmatter, including `domains` / `domain` containment (defaults exclude `project` and `vault-readme`; pass `excludeKinds: []` to include every kind)
10. **query_concepts** `{ filter, limit? }` — typed filter DSL with AND/OR/NOT on `kind` / `domain` / `slug` / `title` / `has(arrayKey)`
11. **compile_ontology** `{ includeIndexes?, summary?, nodesLimit?, nodesOffset?, edgesLimit?, edgesOffset? }` — deterministic graph artifact with canonical `nodes[]`, `edges[]`, aliases, issues, graph-array canonicalization actions, stable semantic `graphHash`, `maxMtime`, optional query indexes, cheap `summary:true` polling, and node/edge pagination for large vaults
12. **query_ontology** `{ operation, ... }` — graph-engine query over the compiled artifact (`neighbors`, `path` with aligned `nodes[]`, `all_paths` with per-path `nodes[]` plus `limit` / `searchBudget` / `exhaustive` / `truncatedByBudget` / `totalPathsExact` metadata and `evidence` guidance, `query_plan` with executable run/narrow advice, filter-preserving `suggestedQuery`, and filter-aware `estimate.totalMatches` for `match_nodes` / `match_edges`, `centrality`, `communities`, `similar_nodes`, `explain_relation`, `reachability`, `pattern_walk`, `impact`, `blast_radius`, `subgraph`, `overview`, `schema`, `facets`, `match_nodes`, `match_edges`, `node_profile`, `domain_profile`, `domain_matrix`, `project_scope`, `project_map`, `relation_check`, `components`, `lineage`, `containment_tree`, `cycles`, `topological_order`, `recommend_relations`, `growth_plan`, `maintenance_plan`, `agent_brief`, `workspace_brief`, `health`) for graph-database-like answers without pulling the full compile payload. Repeated read calls inside one MCP server session reuse the compiled artifact while the vault document signature is unchanged, so first-contact agent run orders do not pay the full compile cost for every graph query. `match_nodes` returns a `followUp` packet for the first returned row with ready-to-run `node_profile`, incoming/outgoing `match_edges`, and `blast_radius` MCP calls plus CLI fallback commands, so a graph scan can become focused evidence without another round of tool-selection guesswork. `match_edges` returns a `followUp` packet for the first returned real edge with ready-to-run `explain_relation`, `path`, and `relation_check` MCP calls plus CLI fallback commands, so edge scans move directly into evidence and write-preflight instead of being treated as raw proof. `match_edges.filters`, `match_edges.edges[].relationType`, `followUp.focusEdge.relationType`, and `query_plan(match_edges).normalized` expose public names such as `depends_on` next to canonical frontmatter `types` or `via` values such as `dependencies`, so terminal and MCP clients can show the relation name users typed while keeping executable graph keys. `node_profile.edges.incoming/outgoing.byRelationType` and edge `relationType` expose public names such as `depends_on` for node detail views; `domain_matrix.filters.relationTypes`, `connections.rows[].byRelationType`, and connection examples do the same for coupling views, while canonical `types`, `via`, and `byRelation` stay available for graph-key callers. The UI semantic coupling matrix and CLI node deep dive can be rerun from Claude Code, Codex, or terminal fallbacks with the same user-facing names. `agent_brief` returns Claude Code/Codex handoff readiness, a copyable `handoffPrompt` (also printable via `ontology-atlas agent-brief --prompt`), graph entrypoints, first MCP calls, structured `graphDbQueryPack` (`facets` / `schema` / `query_plan(match_nodes)` / `match_nodes` / `query_plan(match_edges)` / `match_edges` / `domain_matrix` / `query_plan(centrality)` / `centrality` / `query_plan(all_paths)` / `all_paths` / `explain_relation` / `business_questions` outcome, domain-boundary, capability-claim, and implementation-evidence scans), investigation playbooks including `graph_traversal` (`schema` → `query_plan(all_paths)` → `all_paths` → `pattern_walk` / `project_map`), `traversalStrategy` (`plan_before_enumeration` → `bounded_path_evidence` → `containment_cross_check`) for plan-first bounded traversal, per-playbook `evidence[]` and `stopWhen[]` checklists, write guardrails for `add_relation` / rename-merge / post-change sync, relation preflight before `add_relation`, a `relationDecisionGuide` for the `skip_existing` / `review_inverse` / `safe_to_add` / `review_new_schema` outcomes, `resultContracts` requiring `all_paths` callers to report completeness fields and requiring `match_nodes` / `match_edges` callers to report `totalMatches`, `limited`, and `followUp` details before treating scan rows as evidence, and read-first write policy. The CLI companion `ontology-atlas agent-brief [vault] --graph-db-pack` turns that pack into a shell-pasteable graph scan script for sessions without MCP. `relation_check` validates relation `type` before endpoint slug resolution, so relation typos such as `depend_on` still return nearest-value hints even in empty or project-less vaults, and returns `matchingEdges`, reverse-direction `inverseEdges`, and a recommendation decision (`skip_existing`, `review_inverse`, `safe_to_add`, or `review_new_schema`) before exposing an `add_relation` `proposedAction`. `maintenance_plan` actions include stable `id`, cursor resume via `afterActionId`, explicit `cursor.reason` metadata, executable graph-array canonicalization, count-safe summary fields, `byPhase` / `bySeverity` / `byKind` remaining-queue buckets, `executable`, current-page `nextExecutableAction`, current-page `nextReviewAction`, plus `executableOnly` / `phases` / `severities` / `kinds` filters; ready pages report `cursor.found=true` with `cursor.reason=null`, while unknown cursors return an empty page with `cursor.found=false`, zero remaining actions, and no next actions. `phases`, `severities`, and `kinds` are enum-validated so typoed work-queue filters fail instead of returning an empty plan.
13. **validate_vault** — whole-vault health check with per-file issues and grouped summary, including schema-bound 8 issue codes for non-canonical graph arrays and dangling graph references
14. **analyze_repo_structure** `{ rootPath?, maxDepth?, ignore? }` — side-effect-free bootstrap candidates from package / README / source layout
15. **infer_imports** `{ rootPath?, sourceFolders?, ignore?, maxFiles? }` — side-effect-free TS/JS import graph → file/module dependency edge candidates. Use after `analyze_repo_structure` to pull real `depends_on` candidates from code rather than only layout heuristics; the agent reviews `moduleEdges` with `count` + `kindCounts` and lands accepted edges via `add_relation` / `add_relations`, so the vault is not modified by analysis. Unresolved import `reason` is schema-bound to `empty`, `relative-not-found`, or `alias-not-found`; `kindCounts` is schema-bound to positive integer `static`, `dynamic`, `require`, `reexport`, and `side` keys. Resolves relative imports, `tsconfig.json` paths, and fallback common `@/*` aliases when the target exists; `maxFiles` defaults to 5000 and caps at 50000 to stop pathological monorepo walks.

16. **index_project** `{ rootPath?, maxFiles?, threshold?, skipImports? }` — side-effect-free project indexing checkpoint that combines repo structure analysis, import-edge indexing, and vault validation into a plan for long-running ontology creation.

`query_ontology({operation:"cycles"})` returns each cycle as the canonical slug
path plus aligned `nodeSummaries[]`, so dependency-cycle diagnostics are readable
without extra node lookups.

#### Write tools (8)
1. **add_concept** `{ slug, kind, title, domain?, capabilities?, elements?, body? }` — create new `.md`; graph arrays are trimmed, deduped, and sorted on write (throws on existing slug); changed writes return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers
   - **R6 validation**: title must be non-empty trimmed string (`isValidVaultTitle`)
2. **add_concepts** `{ concepts }` — batch create nodes (max 50), order-preserving partial results; non-object row shape / unknown row field errors are isolated as `{ok:false, error}` rows, single unknown-field rows include `receivedField` plus one-row `unknownFields`, multi unknown-field rows report every offending field with nearest hints, and duplicate input slugs report both the failing `concepts[n]` row and first-seen `concepts[m]` via text plus structured `rowName` / `firstSeenAt`; changed batches return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers for the final graph
3. **patch_concept** `{ slug, frontmatter?, body?, expected_mtime? }` — update existing (`null` value deletes key); graph arrays are trimmed, deduped, and sorted on patch; changed writes return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers
    - **R6 validation**: rejects `title: null` and `title: ""`
    - **R11 conflict guard**: optional `expected_mtime` (from get_concept response). Throws `VaultConflictError` if file mtime differs at write time — caller re-reads and retries.
4. **add_relation** `{ from, to, type }` — append to source frontmatter graph key; invalid relation `type` is rejected before endpoint slug resolution with a closest-value hint plus structured `valueName` / `receivedValue` / `suggestion` / `allowedValues`; changed writes return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers
    - type enum: `depends_on` (→ `dependencies`) / `relates` / `contains` / `describes` / `domains` / `capabilities` / `elements` / `domain`
    - **R7 validation**: both `from` AND `to` slug must exist in vault (`vaultSlugExists`)
    - Unique tail aliases and frontmatter `slug:` aliases are resolved to canonical file slugs before write
    - Idempotent: duplicate returns `{ alreadyExists: true }`
5. **add_relations** `{ relations }` — batch edge writer (max 50), idempotent per row; non-object row shape / unknown row field errors are isolated as `{ok:false, error}` rows, single unknown-field rows include `receivedField` plus one-row `unknownFields`, multi unknown-field rows report every offending field with nearest hints plus structured `rowName` / `allowedFields` / `receivedFields`, and relation type typos include structured `valueName` / `receivedValue` / `suggestion` / `allowedValues`; stored relation arrays are deduped and sorted as canonical graph sets; changed batches return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers for the final graph
6. **delete_concept** `{ slug, confirm?, force?, expected_mtime? }` — permanent delete; confirmed deletes return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers
    - `confirm: false` (dry-run with backlinks preview) / `true` (actual)
    - `force: false` (throw if backlinks exist) / `true` (delete anyway)
    - **R11 conflict guard**: optional `expected_mtime`
7. **rename_concept** `{ oldSlug, newSlug, confirm?, overwrite? }` — **R11** atomic graph-level rename
    - Moves the .md file, updates the moved file's `slug:` key, rewrites every backlink (frontmatter array entries, inline string keys like `domain`, body links `[[oldSlug]]` / `(oldSlug.md)`)
    - Tail-only references (`mcp-server` for `capabilities/mcp-server`) also redirected to the new tail
    - `confirm: false` (dry-run with full update preview) / `true` (actual)
    - Confirmed renames return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers
    - Replaces the manual `find_backlinks` + N `patch_concept` loop
8. **merge_concepts** `{ fromSlug, intoSlug, confirm? }` — **R11** atomic graph-level merge
    - Redirects every backlink `fromSlug` → `intoSlug`, then deletes `fromSlug.md`
    - `intoSlug` node preserved as-is (frontmatter / body not auto-merged — use `patch_concept` after to combine)
    - `confirm: false` (dry-run) / `true` (actual)
    - Confirmed merges return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers

---

## 4. Cross-cutting UI

**feat/rail-rollout** collapsed the old 3-tier nav (`OperationsNav` top tabs +
`OntologySubNav` inline sub-tabs + `BottomTabBar`) into one system: a
persistent left rail on desktop, `BottomTabBar` on mobile, both agreeing on
the exact same 5 destinations and active-item rule. `OperationsNav` and
`OntologySubNav` are retired (deleted, not just unmounted).

### `AppNavRail` (desktop, `lg:` and up — left side, on every page)
- 5 destinations: Map (`/`, `/topology`) · Docs (`/docs`) · Builder
  (`/ontology/edit`) · Insights (`/ontology/insights`) · Projects (`/projects`
  or `/project/*`)
- Bottom of rail: agent-activity status dot + an optional `settingsSlot`
  (only `HomePage` passes one — `TopologyV2SettingsGear`)
- Active-item detection: shared `resolveActiveNavDestination`
  (`src/shared/lib/nav-destination.ts`) — the SAME function `BottomTabBar`
  uses, so desktop and mobile can never disagree on which destination is lit

### `AppSettingsMenu` (per-page header — Projects list, Builder, Insights)
- The old `OperationsNav` gear-triggered settings modal, extracted into its
  own widget (`src/widgets/app-settings-menu`) because the rail is too narrow
  (`--app-nav-rail-width`) to host its popover. Same 5 tabs as before:
  General / MCP+Agents / Vault / Appearance / Verification — `ThemeToggle`
  and `LocaleSwitch` live inside the Appearance tab; Verification surfaces the
  MCP connection-state ladder and proof-decision order; MCP+Agents exposes a
  copyable first-contact MCP proof prompt
- `LiveActivityIndicator` (agent activity heartbeat status, unchanged) mounts
  next to it on the same three pages — this pairing is the "zero feature
  loss" replacement for what `OperationsNav`'s right-hand cluster used to show
- Pages the rail reaches directly with no prior top nav (Docs, Project
  detail/editor, Download) never had this cluster and still don't — only the
  three pages that used to mount `OperationsNav` keep it

### `BottomTabBar` (mobile only, `lg:` hidden)
- Same 5 destinations/labels/icons as `AppNavRail`: Map · Docs · Builder ·
  Insights · Projects
- Min height 56 px (safe-area)
- Hidden on public marketing/download surfaces: `/` while no local vault is
  loaded, and `/download/`

### Search palettes (separate by design — R5 skip merge)
- **`⌘K` `SearchPalette`** — projects-focused fuzzy search + top vault docs match (3) + recent (5) + Layer filter (All / Hub / Node)
- **`⇧⌘K` `MountedGlobalSearch`** — ontology nodes + projects unified (`cmdk`-based, kind/project filter chips, virtualized)
- Both palettes share keyboard: `↑↓` navigate · `↵` select · `Esc` close

### `ShortcutSheet` (`?` to open)
- 10 sections grouped: navigation · topology · search palette · hub rail · workspace palette · workspace graph · workspace files · workspace actions · tour · portfolio
- 2-column grid on sm+, focus trap, `Esc` closes

### `LocaleSwitch`
- Two-button toggle EN / KO
- Replaces locale prefix in pathname; preserves rest (NOT query params — Scenario 9 finding, R9 deferred)
- localStorage `ontology-atlas:locale`

### `ThemeToggle`
- Moon / Sun icon toggle
- SSR-safe (mount-state placeholder until first useEffect)
- `html[data-theme]` attribute

---

## 5. Keyboard shortcuts (consolidated)

| Key | Surface | Action |
|---|---|---|
| `⌘K` | Home / Topology / Ontology / Projects / Docs | Project / node search palette |
| `⇧⌘K` | Home / Topology / Ontology | Global search (nodes + projects) |
| `D` | Home / Topology | Toggle docs drawer |
| `?` | Home / Topology / Builder | Toggle shortcut sheet |
| `/` | Sigma controls (when controls expanded) | Focus search input |
| `0`–`6` | Sigma controls | Set depth filter |
| `Esc` | All | Layered close (drawer / palette / local graph) |
| `P` / `N` | Builder | Add Project node |
| `D` | Builder | Add Domain node |
| `C` | Builder | Add Capability node |
| `E` | Builder | Add Element node |
| `F` | Builder | Toggle fullscreen |
| `Del` / `Backspace` | Builder | Delete selected ephemeral |
| `Enter` | Builder inspector | Save ephemeral / commit vault rename |
| `↑↓` | Hub rail | Cycle hubs |
| `Home` / `End` | Hub rail | First / last hub |
| `Tab` (in palette) | Workspace palette | Cycle mode (`""` → `>` → `#`) |
| `⌘S` | Docs editor | Save |
| `⌘B` / `⌘I` | Docs editor | Bold / italic wrap |
| `⌘K` (in editor, no `Shift`) | Docs editor | Insert link |

---

## 6. What was removed / added (Rounds 1–18+)

For full reasoning see `docs/CHANGELOG.md`. High-level:

- **Round 1-9** (2026-04~05 surface diet + robustness) — presentation mode · Relationship Radar · audience toggle · `/ontology/relations` route · landing CTA swap · `LocalVaultProvider` SSoT · vault error banner · permission state sync. Earlier auth (R10) and cloud (R10b) surface permanently removed.
- **Round 10 / 10b** — `/login` / `/signup` / `/account` / `/reset-password` / `/settings/*` / `/admin/*` / `/review/*` / `/diagnostics/*` / `/knowledge/*` 모두 제거. Firebase / Firestore / Auth / Storage SDKs, screenshot uploader, manual node/edge cloud modal — pure local-first 회귀.
- **Round 11** — `pnpm vault:validate` / `vault:migrate` 신규. MCP v0.7.0 — 14 tools (8 read + 6 write, `rename_concept` / `merge_concepts` 추가). 3-way frontmatter parser contract. mtime 기반 conflict guard.
- **Round 12** — primary audience = developer + AI agent (PM-primary 결정 reverted). CLI 4 명령 추가 (`list / validate / add / find` — `init` 외). Cross-package contract 4-way. dogfood orphan 8 → 1.
- **Round 13** — AI agent quality 첫 측정 (Claude Code + Codex, n=2). MCP `instructions` field (v0.7.1). VSCode plugin v0.1.0 → v0.9.0 (R15 에서 제거).
- **Round 14** — *AI agent ↔ vault 자동 sync*. Web 즉시 반영 4 단계 (5s polling / graph pulse / added toast / modified toast). Frontmatter schema 양식 (3 진입점 동기화). CLI `import` 명령 (외부 .md 정규화). `/ontology-sync` skill + AGENTS read-while-coding 룰. SessionStart hook (vault census 자동 inject).
- **Round 15** — VSCode plugin 제거 (4 surface → 3). CLI `init` 의 mcp 등록 마찰 1 step 제거 (`.mcp.json` 자체 생성, cwd + vault 양쪽). Later follow-up extends this to Codex by writing repo-local `.codex/config.toml` in cwd + vault and by making the app starter write vault-local `.mcp.json` / `.codex/config.toml`. `add` / `import` 의 `--auto-prefix` default on (starter layout 일관). `--raw-slug` opt-out.
- **Round 16** — fresh repo bootstrap path. `analyze_repo_structure` / CLI `analyze` propose project/domain/capability/element candidates from package metadata, README headings, and source layout with side effect 0.
- **Round 17** — import-derived dependency evidence. `infer_imports` / CLI `infer-imports` parse TS/JS imports, resolve relative and tsconfig alias paths, and propose `depends_on` edges without mutating the vault.
- **Round 18+** — workbench loop consolidation. `/ontology` now frames Tree as Browse and immediately hands selected slugs to Builder (Write), Topology (visual focus), and Insights (Query). `/ontology/edit` is kept as a constrained relation write-review surface with source-file patch preview, preflight, post-save proof packets, and focused Insights handoff. `/ontology/insights` exposes the graph DB query pack as an executable local markdown graph cockpit, and `pnpm dogfood:graph-db` now fail-closes on setup self-check, `health --json`, graph scan follow-ups, public relation-name parity, structural `pattern-walk` / `project-map` traversal, bounded path completeness, relation preflight, and relation explanation contracts.
- **전 페이지 시안-우선 재구성 웨이브 (2026-07-18, PR #355~#366)** — `docs/prototypes/` 승인 시안 기반 전면 현행화. Removed: `/ontology/insights`의 구 4탭 reader-persona 시스템(proof/collaboration/agent/census 프리셋, 세션 증빙 스트립, collaborator brief, query-recipe cockpit, ~6,200줄) — 개요/관계/신선도 3탭으로 대체; `/projects`의 검색·필터·페이지네이션 카드 리스트 — engraved census 헤더 + 최근 활동 스트립 + 풀폭 카드 + dashed 다음 프로젝트 슬롯으로 대체(`ProjectQuickCreatePanel`은 컴포넌트로는 남지만 이 페이지에서 더 이상 노출 안 됨); `/project/[slug]`의 "More info" 접이식 섹션과 태그/스택/링크 인라인 노출 — quick-edit/전체 편집으로 이동. Added: topology 데이터시트 288→352px 스케일업 + 근거(evidence) 그룹 승격, `TopologyV2SettingsGear`(우측 유틸리티 레일), `/ontology/edit` 3-pane(240·캔버스·340, xl+ 상주) + `BuilderWriteConfirmBar`, `/docs`의 상시 Pinned/Vault/Recent 사이드바(280px, lg+) + `DocFrontmatterBlock` + 하단 backlinks 스트립, `/download`의 정직한 fact strip(size/checksum "게시 시 기록" placeholder) + spctl 신뢰 패널 + changelog 프리뷰.

---

## 7. Deferred (future rounds — wait-for-signal)

- `/ontology/edit` builder reconsideration — **closed as a constrained workbench surface, not a general diagram editor**. The builder stays because it now has a narrow job: focus a saved slug, preview source-file frontmatter writes, run relation preflight before save, and hand off to Insights/Topology for graph proof after save. Users who prefer direct markdown can still edit frontmatter in `/docs` or CLI/MCP; the builder exists for visual relation repair and write review, not as the primary authoring path.
- ~~Phase 4 PM polish~~ — **dropped** (R11 #25, PRODUCT-DIRECTION v3). PM-primary 결정 reverted.
- Search palette unification (`⌘K` + `⇧⌘K`) — R5 skip: not duplicates, would require ranking/section redesign.
- LocalVaultPicker hoist out of dropdown — R5 skip: dead-end already closed by R4 J.
- WebGL context-loss `ErrorBoundary` (Scenario 10) — R9 defer: theoretical, no reports.
- Locale switch query-param preservation (Scenario 9) — R9 defer: low frequency.
- MCP `add_concept` project minimal-input parity with `ProjectForm` — R6 skip: AI agent incremental stub by-design.
- folder-topology project scaffold without description — R6 skip: scaffold ≠ canonical authoring (different contract).

---

## 8. Source-of-truth files

When this doc and code disagree, code wins. Trust:
- `package.json`
- `next.config.ts`
- `app/[locale]/layout.tsx`

For per-route truth: open the corresponding `src/views/*` file. Each route has comments explaining mode-aware fallbacks, deep-link sync, and edge cases.
