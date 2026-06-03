# FEATURES — oh-my-ontology

> Complete inventory of features users can **actually use right now**.
> Last updated: 2026-05-31 (real-time **adaptive** vault polling, `/docs` editor save-conflict data-loss guard, fresh-init starter ambiguous-alias fix, `find_evidence` relevance ranking, `validate_vault` vault→code `pathDrift`, `infer_imports` edge reconciliation). Earlier (2026-05-28): graph DB health gate, `/ontology` Browse / Write / Query loop, Builder proof handoff role, desktop route smoke.
> Routes section UI detail remains a maintained product snapshot. When route
> behavior changes, update this file alongside the PR body and CHANGELOG.
> Update trigger: reflect immediately when surfaces are added or removed. Update alongside the PR body and CHANGELOG.

---

## 0. At a glance

> **Mission v3**: "One codebase, one ontology, that the developer and their AI agent grow together."
> **Launch framing v4**: "A repo-native memory layer for Claude Code, Cursor, and Codex."
> **Operating model**: single-user tool. Local-first vault. No login, no backend. **4 surfaces (macOS app · CLI · MCP · Website)** — real ontology work happens in the installed app / CLI / MCP; the hosted website is promo/download plus read-only demo.
> **Brand split**: **Context Atlas** is the user-facing macOS app / website brand and macOS release asset identity. `oh-my-ontology` remains the repo, CLI binary, and MCP package name.

The product should not feel like an ontology editor. The core user-visible loop
is `init -> bootstrap -> MCP-backed agent answer -> agent sync proposal -> git
diff review -> better next agent task`.

| Surface | Entry | Audience |
|---|---|---|
| **macOS app** (Context Atlas desktop distribution track) | signed DMG → installed local workbench; first run opens `/docs/?intent=local` vault setup welcome; visual routes `/docs`, `/ontology`, `/topology`, `/projects`, `/ontology/edit`, `/ontology/insights` | daily visual ontology work — pick a local vault folder, edit markdown-backed nodes/relations, reopen recent vaults without visiting the hosted site |
| **CLI** (R12 / R14 / R15+ · 43 commands) | `init / agent-setup / add / import / list / find / validate / mcp-verify / query / compile` (vault basics + existing-vault Claude/Codex config repair + installed MCP health/graph-query smoke + deterministic graph compile) · `analyze / infer-imports / bootstrap` (autonomous ingest) · `backlinks / orphans / path / explain / all-paths / reachability / relation-check / rename / merge / delete` (graph CRUD + direct/path/common-neighbor explanation + bounded traversal + transitive closure + write preflight) · `match-nodes / match-edges / domain-matrix / facets / schema / pattern-walk / project-map / overview / hubs / blast-radius / cycles / components / topological-order / health / agent-brief / workspace-brief / growth / maintenance / node / similar` (graph deep dive — `query_ontology` ops, including graph DB-style node/edge scans, relation dashboard facets, relation schema patterns, explicit traversal and project maps, connected island checks, prerequisite ordering, relationship explanation, domain coupling matrix, agent handoff, and growth/maintenance queues) | developer terminal — vault scaffold, daily exploration, bulk import, MCP sanity check, graph deep dive (same authority as AI agent via MCP) |
| **MCP** (R5 / R7 / R11 / R14 / R16 / R17) | 23 tools (15 read · 8 write) over JSON-RPC | AI agent (Claude Code, Codex, Cursor) — read for context · write back findings · bootstrap empty vault (R16 `analyze_repo_structure` · R17 `infer_imports`) · compile/query/health/agent-brief/workspace-brief as graph-engine memory access |
| **Website** | Firebase static hosting / `/download` | product introduction, release download path, and read-only demo. Hosted pages do not open or edit local vault folders. |

```
input (humans + AI agents)     parse           store              output
        │                       │                │                │
        ▼                       ▼                ▼                ▼
  .md in vault  →          frontmatter   →  user disk      →  Browse (/, /ontology) tree+ego
  (frontmatter)                              (vault)           Topology (/, /topology) Sigma WebGL
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

**Single source of truth (R8)**: `LocalVaultProvider` mounts once in `app/[locale]/layout.tsx`. All 8 consumers (`useLocalVault()` callsites: RootEntryPage / OperationsNav / OntologyEditPage / DocsVaultPage / useDataSourceMode / useProjects / useProjectMutations / useVaultOntology) share one state instance, one IDB rehydrate, one filesystem walk.

---

## 2. Routes (12 `[locale]`-prefixed routes)

### `/` — Smart entry

- **Hosted web, no vault** → `LandingPage`
- **macOS app, no restored vault** → local redirect state, then `/docs/?intent=local` shows a vault setup welcome with Files / Graph / Agent contract cells, the same 14-check graph DB proof gate, and open/create/sample/recent choices; the installed app does not render the hosted marketing page on first run
- **Recent desktop vaults** → the picker stores recently opened Tauri vault paths, can reopen them without another Finder selection, and can remove stale paths from the list
- **Vault loaded** → `OntologyViewPage` (tree + ego graph hub)

### `/` — Landing (no vault)

- **Hero**: Context Atlas brand header + macOS-first title + subtitle + 3-step value chain rail (01 / 02 / 03)
- **Mini topology** animation (14 nodes, 21 edges, SVG ForceAtlas2 — respects `prefers-reduced-motion`)
- **Primary CTA**: "Download macOS app" → GitHub Releases
- **Secondary CTA**: "Installation guide" → `/download/`
- **No hosted workbench CTA**: public web pages do not route new users into `/docs/?intent=local`; local vault work starts inside the installed app
- **First-release checklist**: `/download/` shows macOS app blockers (PR review, tag/package/Tauri/Cargo version alignment, Apple signing, v0.1.0 GitHub Release) separately from the Firebase Hosting `/ko/download/` website deploy gate; rebuild with `NEXT_PUBLIC_OMOT_FIRST_RELEASE_PENDING=0` after verified DMGs publish and the hosted download route is live to hide it.
- **Live deploy verification**: `pnpm desktop:verify-hosted` checks the deployed `oh-my-ontology.web.app` landing/download pages so a stale public site with the old browser-vault CTA, missing `/ko/download/` route, or unstable `/releases/latest` CTA cannot satisfy the desktop release goal.
- **Privacy note**: the installed app and vault data use local disk as the source of truth; the hosted site is product introduction + download entry
- **Footer**: license · GitHub · stack chips · `LocaleSwitch`

### `/` and `/topology` — Sigma WebGL hub

Both routes render the same `HomePage` (R3 keep-both decision: `/` = home/back-link target, `/topology` = explicit deep-link namespace).

#### Canvas (Sigma + Graphology + ForceAtlas2)
- **Click node** → right-side `ProjectDrawer` opens
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

#### Left workspace info panel
- Expanded: workspace title + project/hub counts + 3 nav links (Projects / Source / Ontology) + collapse button
- Collapsed: pill with selected project name or workspace summary

#### Right-side `ProjectDrawer` (when a node is selected)
- Project name + icon + category badge · description · tags · stack
- "View project" → `/project/[slug]/`
- "Open source vault" → `/docs/?slug=...`
- Connections summary (dependencies / referencedBy)
- Impact mode toggle (Default · Upstream · Downstream · Network)
- Integrity checks · screenshots (lazy top 2) · timeline · links
- Footer: "slug · updated DATE"

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

### `/docs` — Source Vault (reader + editor + palette)

#### Header (always visible)
- Back button · title + doc count · `Local` badge (when source=local)
- Pinned `Files` / `Graph` / `Agent` execution strip: source markdown count, compiled ontology node/relation counts, and the same 14-check graph DB proof gate used by the local dogfood runtime pack, with a direct graph-gate copy action on the Agent cell
- **Source toggle** (R3 cut C — radio: Sample / Local). Round 4 J: clicking Local auto-opens vault tools dropdown if no vault loaded yet
- **Palette button** (`⌘K`)
- **Vault tools dropdown** (gear icon, only when source=local + supported):
  - Folder-topology view toggle (button)
  - `LocalVaultPicker` (open / close / refresh / re-authorize / status display)
  - `OntologyStarterCta` (when vault is empty)
  - "New doc" button (when canEdit)

#### Status banner (R9 cut, below header)
- Visible when `source=local && (status='error' || status='permission-needed')`
- Shows error message · "Open picker" button to reauth/re-pick
- Stops the silent server-fallback that was confusing users

#### Sidebar (md+)
- **Pinned docs** (when count > 0): pin/unpin via hover button
- **Recent docs** (when count > 0): chronological
- **Tree** (`DocsVaultTree`): folder hierarchy, click to select, tag-filter auto-expands folders
- **Tags** (`DocsVaultTags`): `<details>` collapsible, top 12 tags + active even if > 12, click to toggle filter

#### Mobile drawer (<md)
- Hamburger button → overlay drawer with sidebar contents

#### Content area
- **view=doc** (default): editor (when editing) or viewer + `DocMetaBar` (word count, reading minutes, tags, updated date) + `DocsVaultBacklinks` + `DocsVaultProjectDepsBar` (in `projects/*` + local)
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

### `/ontology` — Browse (tree + ego + detail)

#### Sub-nav (R3 cut F — always visible, no toggle)
- **Browse** (`/ontology/`) — exact-match `''` and `/ontology`
- **Builder** (`/ontology/edit/`)
- **Insights** (`/ontology/insights/`)
- Caption: "ONTOLOGY · {N} nodes · {E} relations" (visual cue same data)

#### Page header
- Title + info tooltip · counts
- **Search button** (`⌘K`) — node-only `OntologyGlobalSearchAdapter`
- **All / 전체 button** (R4 cut H, `⇧⌘K`) — `MountedGlobalSearch`, nodes + projects unified
- **Builder CTA** (indigo solid) → `/ontology/edit/`
- Browse / Write / Query summary: active Browse card selects the concept slug, the selected canonical slug is repeated as the active concept handle, Builder keeps that slug focused for frontmatter writes, and Insights closes with graph DB-style proof
- Status strip: one-line hierarchy index · graph refs · evidence docs · projection notes, shown before the proof rail so the hierarchy reads as a browse index instead of the whole ontology without adding another card row
- Graph proof strip: compact MCP/CLI query pack counts, one sample `MATCH` intent, operation chips, and copy buttons for the full graph DB MCP pack, CLI fallback pack, runtime gate, and shared post-change sync gate
- Local frontmatter compile proof is below the tree, not above it, so the browse page starts from concept selection rather than a source inventory

#### Left: tree view (`OntologyTreeView`)
- Hierarchical project → domain → capability → element (document kind excluded as evidence)
- Click row → select the node graph handle (button labels include the canonical slug and Browse / Write / Query handoff), highlight the same handle in-row, and update URL `?node=…`
- Orphan rows are also selectable graph handles, so nodes outside the hierarchy projection still enter the same Browse / Write / Query handoff instead of becoming a read-only warning list.

#### Right: detail panel (`NodeDetailPanel`)
- Kind badge + title · `ManualSourceChip` (currently no-op — all sources `manual`)
- Copy node link button
- Agent context copy actions: canonical frontmatter nodes expose copyable MCP `node_profile`, CLI `oh-my-ontology node`, and a combined selected-node proof bundle with `node_profile`, incoming `blast_radius`, planned incoming/outgoing `match_edges`, planned public `depends_on` relation parity scans, reachability, `query_plan(all_paths)`, bounded `all_paths`, `relation_check`, `health`, evidence checklist, CLI fallbacks, and the shared post-change sync gate. The bundle checklist names the runtime graph DB check count before the embedded sync packet and requires `relationType` / `via` evidence for public relation scans, and the Query handoff opens `/ontology/insights?node=<vault-slug>`; Insights resolves both graph ids and canonical vault slugs so tree and builder handoffs focus the same concept.
- Stats: linked projects, evidence count
- Reachability summary: outgoing / incoming / both direction controls, 1-3 hop depth controls, layer counts, terminal count, top relation distribution, clickable reachable-node previews by BFS layer, copyable MCP/CLI reachability commands for canonical frontmatter nodes, and empty-state feedback when the current traversal has no reachable nodes
- Ego graph (1-hop default, 2-hop toggle radio), circular SVG
- Neighbors list (6 preview, expandable; missing stubs amber)
- Related docs list (6 preview, expandable)
- CTAs: link to `/project/<slug>` if project, amber stub warning if unknown kind

#### Empty state (no nodes)
- Mode-aware copy (local 2-step / static 3-step)
- Local: copyable frontmatter YAML snippet
- Buttons: Open Vault / Go to Builder

#### Keyboard
- `⌘K` toggle node search · `⇧⌘K` toggle global search · `Esc` close detail · `?` shortcut sheet

---

### `/ontology/insights` — Insights

Core panels (R3 cut E reordered + folded cross-project):

1. **Kind distribution** (kind → count bars)
2. **Edge type distribution** (canonical order — contains, belongs_to, depends_on, …) + inline caption with cross-project edge count + ratio (folded from removed Cross-project Panel)
3. **Per-project distribution** (top 12 by total nodes)
4. **Hub nodes** (top 10 by degree, click → `/ontology/?node=…`)
5. **Recent nodes** (vault sentinel preview, click → deeplink)
6. **Orphans** (R3 cut E made clickable Links, amber accent, top 10 + "+N more")

Collaborator reader lane:

- **Collaborator insight brief** — copyable workspace overview for planning, marketing, and domain review. It includes metrics, shared vocabulary hubs, review vocabulary rows, focus-specific review questions, a `Decision lane`, a `Decision record` checkpoint, graph handoff links, impact handoffs, open-question handoffs, workspace CLI/MCP checks, and a compact vocabulary-only copy action when reviewers do not need agent commands.

Agent panels:

- **Agent graph readiness** — score, graph facts, blockers, next actions, a copyable MCP repair prompt, and local terminal fallback checks (`agent-brief`, `agent-brief --graph-db-pack`, `agent-brief --verify-fallbacks --json`, `workspace-brief`, `health`, `cycles`, `growth`, `maintenance`, `pnpm dogfood:graph-db`, `validate`, plus action-specific commands) for connector-less Claude Code/Codex sessions. The copied CLI packet now includes the same setup automation gate plus dashboard facet/schema scans, dependency-cycle, growth-candidate, maintenance-queue, and 14-check runtime graph DB gates as the starter flow, so agents can parse `ok` vs `performanceOk` before trusting local graph fallback speed or proposing writes.
- **Focused node proof** — `/ontology/insights?node=…` accepts either `kind:slug` graph ids or canonical vault slugs such as `capabilities/agent-graph-readiness`. The focused proof panel now copies `node_profile`, incoming `blast_radius`, planned incoming/outgoing `match_edges`, planned public `depends_on` relation parity scans, `query_plan(all_paths)`, bounded `all_paths`, `relation_check`, `health`, shell-safe CLI fallbacks, scan/path evidence rules, and the shared post-change sync gate, starting with the 14-check runtime graph DB gate, for that exact vault slug.
- **Agent query recipes** — first-contact run order with a one-click copyable runbook, a graph DB query pack (`MATCH`-style node scan / edge scan / graph facets / domain coupling / bounded path evidence) with visible MCP and CLI fallback counts, concrete high-degree slug entrypoints, investigation playbooks with evidence checklists and stop conditions plus CLI fallbacks for graph scans such as `match-nodes`, `match-edges`, `domain-matrix`, disconnected islands via the dedicated `components` command, prerequisite ordering via the dedicated `topological-order` command, duplicate checks via `similar`, and relationship explanation via `explain_relation`, a one-click graph traversal packet (`query_plan` → bounded `all_paths` → `pattern_walk` / `project_map`) with visible MCP/CLI fallback counts and embedded execution gates, exact `query_ontology` JSON payloads, copyable CLI commands such as `oh-my-ontology all-paths ... --plan`, `oh-my-ontology similar ...`, and `oh-my-ontology explain ...`, MCP handoff prompts that include the same graph DB query pack plus CLI fallback commands for connector-less Codex/Claude Code sessions, and an inline mode guide in the graph DB pack panel that explains CLI-only, MCP-connected, Graph DB pack, and setup gate choices before users copy commands. UI `Copy CLI pack` starts with the same mode guide plus the machine-readable setup/performance self-check (`agent-brief --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`), immediately adds the repo runtime gate (`pnpm dogfood:graph-db`), names the runtime replay (`health --json`, `focused_blast_radius`, scan follow-ups, `relation_name_parity`, `pattern_walk` / `project_map` containment, bounded `all_paths` evidence, `relation_check`, and relation explanation), then prints the graph DB scan queue as shell comments plus executable commands, intent comments, an evidence rule that scan rows are candidates until follow-up detail is cited, and a proof checklist covering `totalMatches`/`limited`/row count, `relationType`/`via` parity for public relation names, node detail or blast-radius inspection, `health.status`, edge explain/path/relation-check inspection, and `evidence.pathsComplete`, plus write safety gates for `add_relation`, rename/merge, and post-change sync. Terminal-only `agent-brief --graph-db-pack` keeps the selected-vault self-check and scan queue portable for arbitrary vault paths.
- **Agent graph workflow guide** — `docs/AGENT-GRAPH-WORKFLOW.md` explains the CLI-only path, MCP-connected path, graph DB differences, graph-DB-style query pack, and current dogfood verification evidence so non-developers can understand what works before and after Claude Code/Codex MCP registration. Normal `agent-brief` terminal output and `agent-brief --graph-db-pack` now print the same mode guide before graph commands, while `agent-brief --json` and MCP `query_ontology(agent_brief)` expose the guide as `docs.workflowGuide`, the mode chooser as `docs.modeComparison`, and the scan-to-proof rules as `docs.graphScanProofChecklist`, so humans and agents read the same mode and proof contracts.

Empty state: blue link to `/docs` (open vault).

---

### `/ontology/edit` — Builder (xyflow ERD canvas)

#### Layout (md+)
- Left palette (280 px, collapsible) · Center canvas (flex-1) · Right inspector (360 px, collapsible)
- Mobile (<md): fallback alert + links to `/ontology` and `/topology`

#### Left palette (`OntologyKindPalette`)
- 4 kind buttons: Project / Domain / Capability / Element
- Click or `P` `D` `C` `E` → add ephemeral node
- Collapsed state: 44 px, icon-only (localStorage)

#### Center canvas (`ReactFlow` + dagre/force layout)
- Graph anchor rail: flat full-width canvas status strip with degree-ranked persisted project/domain/capability/element anchors, visible slug labels on every anchor, explicit `focus saved slug` contract, active focused-slug chip, and highlighted current anchor so inspector, relation writes, and proof handoffs stay on the same vault slug before drawing
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

### `/projects` — Project list

#### Header
- Eyebrow + H1 with dynamic count badge `{filtered}/{total}`

#### Filters (URL-synced: `?q`, `?cat`, `?st`, `?limit`)
- Full-text search (name / slug / description / tags / stack), Esc clears
- Phase chips (category, with live counts) — toggle
- Status chips (with live counts) — toggle
- "Clear all filters" button

#### Cards (3 col lg / 2 col md / 1 col sm, sorted by `updatedAt` desc, 60-page paginated)
- Title + 2-line description clamp · 3 quick facts (Phase / Status / Dependency count) · slug · ontology count badge (when > 0)
- "See details" + "View topology" buttons (overlay over stretched card link)

#### Empty states
- No projects at all → `ProjectQuickCreatePanel` inline + fallback buttons
- No results after filter → "Clear search" + "View full topology" link
- Static mode (no vault) → "To workspace map" instead of create

---

### `/project/[slug]` — Project detail (with inline edit)

#### Header
- Breadcrumb: Home → Projects → `{Name|Slug}`
- Right actions: source vault link · copy link · quick-edit menu (mobile)

#### Inline-editable fields (when `canManageProject`)
- name · description · dependencies (picker with cycle check) · tags · stack · links (label|URL multiline)

#### Read-only display
- nameEn · status (with dot color) · category · owner (fallback "Shared internal system") · progress % · slug · updatedAt
- "uncategorized" / "active" fallback labels via taxonomy

#### Featured sections
- **Local topology** — Sigma 1-hop neighbors graph (520 px, minimal mode)
- **Project info card** (when `project.detail` markdown exists)
- **Integrity issues** card (yellow border, only when issues > 0)
- **Screenshots** collapsible (only when count > 0)
- **Linked projects** card (next-project + neighbors map, dedup'd)
- **Ontology overview** card (client-only fetch)

#### "More info" collapsible
- Links · Tags · Stack · Basic info (category / slug / updatedAt)

#### Mobile
- Quick-edit panel (`ProjectQuickEditPanel`, hamburger menu)
- Copy link + topology view buttons in bottom bar

#### Empty / not-found
- Invalid slug → "Project not found" panel + back-to-workspace button
- Loading → "Loading project data" gray panel

---

### `/project/[slug]/edit` and `/project/new` — Full editor

`ProjectForm` (4 collapsible sections + sticky save bar):

1. **Basics** (always open) — slug (disabled in edit, auto-slugify in create) · name · nameEn · category (taxonomy select) · status (taxonomy select)
2. **Story** (collapsible) — description (required) · detail (markdown) · tags CSV · stack CSV · linksText (multiline `label|URL`)
3. **Network** (collapsible, collapsed in create) — dependencies picker with cycle check (suggestions from description/detail text)
4. **Operations** (collapsible, collapsed in create) — startedAt · launchedAt (date order validated) · owner · icon · progress · `isHub` checkbox

#### Validation (`schema.ts`)
- slug: `/^[\p{L}\p{N}-]+$/u` (Unicode letters/numbers/hyphen)
- name + description required (min 1)
- linksText: each line `label|https://…`, http(s) only
- dates: ISO 8601 YYYY-MM-DD, `launchedAt >= startedAt`

#### Actions
- Save & continue · Save & return · Cancel (with dirty-state guard via `beforeunload` + router intercept)
- Delete (edit-only, bottom-left)
- Form nav pills jump to sections
- Top + bottom sticky save bar

#### Mobile preview panel (sidebar, collapsible <lg)
- Live preview `ProjectCard` · completeness % · public status · change summary (max 4 items)

#### Note
- `screenshots` field exists in schema but no uploader UI (markdown/vault assets only — codex Round 6 finding)
- Folder-topology scaffold path (`/docs view: folder-topology`) creates `projects/{slug}.md` without `description` (different contract from this canonical form, by-design — Round 6 skip)

---

### `/project/new` — Create

Same `ProjectForm` minus existing-project context.
- Submit buttons: "Create & continue" / "Create & return"
- Tips panel (easiest path: name → category/status → description, then save)
- Quick-create modal also available in `/projects` list (`ProjectQuickCreatePanel`, reused)

### `/project/fallback` — Static-export fallback

Used when a non-existent slug is hit in static export. Redirects or shows "not found" panel.

---

## 3. MCP server (23 tools)

Run via `pnpm exec node mcp/src/index.js` (registered in user's `.mcp.json`). AI agents read/write the same vault as humans.

**R14 — workflow automation** (Claude Code + Codex):

| Trigger | What | Where |
|---|---|---|
| **SessionStart hook** (implicit) | Vault census (kind counts + domain distribution + top connected hubs) auto-injected into agent's system context on session start | `.claude/hooks/inject-ontology-summary.sh` / `.codex/hooks/inject-ontology-summary.sh` — silent in repos without a vault |
| **`/ontology-bootstrap` skill** (cold start) | Empty vault → first 5–15 nodes from code structure. `analyze_repo_structure` side-effect-zero → user picks candidates → land via batch writers | `.claude/skills/ontology-bootstrap/SKILL.md` / `.agents/skills/ontology-bootstrap/SKILL.md` |
| **`/ontology-sync` skill** (code change) | "I'm done with this task — please sync the ontology now" loop. git diff + context → MCP write tools | `.claude/skills/ontology-sync/SKILL.md` / `.agents/skills/ontology-sync/SKILL.md` |
| **`/ontology-extract` skill** (prose ingress, R+) | User shares prose (meeting note / PR / RFC / Notion paragraph) → `find_evidence` + `similar_nodes` cross-check → candidate table → user picks → land. LLM hallucination guard via prose-source citation in body | `.claude/skills/ontology-extract/SKILL.md` / `.agents/skills/ontology-extract/SKILL.md` |
| **Agent config scaffold** | CLI `init` and the installed app starter write ready-to-use `.mcp.json` and `.codex/config.toml` files into the vault folder, so opening that folder in Claude Code / Cursor / Codex is enough to attach MCP. The empty-vault CTA previews the agent verification path before creation, both empty and existing-vault CTAs include a copyable prompt for Claude Code/Codex that falls back to the CLI setup gate when MCP is unavailable, CLI proof packet, and automation JSON gate, the Source Vault palette exposes the same prompt whenever a local vault is loaded, and the local vault tools menu shows whether `.mcp.json`, `.codex/config.toml`, and `.mcp.json.example` are present, summarizes how many setup files are ready, names the next missing or invalid config, shows a three-step non-developer checklist (config files → agent restart → JSON gate before edits), and offers a repair action that creates only missing agent config files plus grouped copy buttons for a complete setup packet (preferred `agent-setup <vault> --root <codebase> --write` repair command + MCP/Codex templates + restart guidance + verification prompt + CLI fallback + automation JSON gate), the same read-first verification prompt, matching installed-CLI graph runbook (`validate` → `workspace-brief` → `agent-brief --prompt` → `agent-brief --graph-db-pack` → `agent-brief --verify-fallbacks` → `cycles` → `growth` → `maintenance` → `hubs --plan` → `hubs` → `mcp-verify`), a separate one-click automation gate (`agent-brief --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`) with visible command preview, the visible first-contact proof contract (`config_state` → `mcp_verify` → `json_gate` → `graph_briefs`), a separate codebase-root `agent-setup` repair command copy button, codebase-root `.mcp.json.example` template, codebase-root Codex `.codex/config.toml` template, and a one-line `codex mcp add ...` command for users who prefer Codex CLI registration; the starter README gives the same first-contact verification loop plus the `agent-setup /absolute/path/to/this-vault --root . --write` existing-vault repair path before any agent edit. `agent-setup --json` includes `docs.modeComparison` for the CLI-only, MCP-connected, graph DB pack, and setup gate modes, so AI tools can explain the right setup path without scraping Markdown. `agent-brief --verify-fallbacks` runs fallback commands through a bounded parallel queue, prints a human setup-gate line (`ok`, `performanceOk`, wall time, slow count, failed count) before per-command elapsed time plus the slowest fallback, and `agent-brief --verify-fallbacks --json` emits the same check as a compact machine-readable timing report for Claude Code/Codex automation with output samples only on failed rows, so local graph query latency is visible without flooding connector-less setup checks. Each fallback command has a 15s default timeout, configurable with `--fallback-timeout-ms N` or `OMOT_AGENT_FALLBACK_TIMEOUT_MS=N`, and timeout rows report `timedOut:true` for fail-closed setup automation. Passing-but-slow rows are counted under `slow`, marked with `slow:true`, and summarized by `performanceOk:false` when they exceed the 5s default `slowThresholdMs`, tunable with `--fallback-slow-ms N` or `OMOT_AGENT_FALLBACK_SLOW_MS=N`; fallback concurrency defaults to 4 and is tunable with `--fallback-concurrency N` or `OMOT_AGENT_FALLBACK_CONCURRENCY=N`, so automation can distinguish broken setup from local graph latency drift without making the setup gate unnecessarily slow. Root-level CLI init writes matching cwd configs for codebase-root sessions. | `cli/src/index.mjs` · `src/features/docs-vault-local/lib/ontology-starter.ts` · `src/features/docs-vault-local/model/use-local-vault.ts` · `src/features/docs-vault-local/ui/OntologyStarterCta.tsx` · `src/widgets/docs-vault/ui/VaultToolsMenu.tsx` · `src/views/docs-vault/ui/DocsVaultPage.tsx` |
| **10-minute memory loop smoke** | Fresh repo `init -> bootstrap -> validate -> workspace_brief -> agent_brief -> node_profile -> sync proposal` path is executable as a release-readiness gate, including git diff alignment before any side-effecting sync write. | `scripts/smoke-memory-loop.mjs` · `pnpm smoke:memory-loop` |
| **`/firebase-deploy` skill** (static Hosting deploy) | Reads local `.env.prod`, runs docs/type/build/bundle gates, deploys only Firebase Hosting, then verifies the live `web.app` URL. Keeps Firebase as static hosting, not backend. | `.claude/skills/firebase-deploy/SKILL.md` |
| **`mcp__oh-my-ontology__*` `instructions` field** (R13 v0.7.1) | Server's initialize response carries kind hierarchy, first-time workflow, write safety patterns — every connecting agent gets the discipline without trial-and-error | `mcp/src/index.js` |
| **`.omotignore`** (R+) | Vault-root gitignore-style file. Patterns match `materialize_external_element` refs in `growth_plan` / `maintenance_plan` and skip them. Intentional external code (e.g. `src/**`, `cli/**`) stops surfacing as noise. `externalElementRefsIgnored` count exposed for transparency | `docs/ontology/.omotignore` (dogfood example) · `mcp/src/omot-ignore.mjs` |

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
12. **query_ontology** `{ operation, ... }` — graph-engine query over the compiled artifact (`neighbors`, `path` with aligned `nodes[]`, `all_paths` with per-path `nodes[]` plus `limit` / `searchBudget` / `exhaustive` / `truncatedByBudget` / `totalPathsExact` metadata and `evidence` guidance, `query_plan` with executable run/narrow advice, filter-preserving `suggestedQuery`, and filter-aware `estimate.totalMatches` for `match_nodes` / `match_edges`, `centrality`, `communities`, `similar_nodes`, `explain_relation`, `reachability`, `pattern_walk`, `impact`, `blast_radius`, `subgraph`, `overview`, `schema`, `facets`, `match_nodes`, `match_edges`, `node_profile`, `domain_profile`, `domain_matrix`, `project_scope`, `project_map`, `relation_check`, `components`, `lineage`, `containment_tree`, `cycles`, `topological_order`, `recommend_relations`, `growth_plan`, `maintenance_plan`, `agent_brief`, `workspace_brief`, `health`) for graph-database-like answers without pulling the full compile payload. Repeated read calls inside one MCP server session reuse the compiled artifact while the vault document signature is unchanged, so first-contact agent run orders do not pay the full compile cost for every graph query. `match_nodes` returns a `followUp` packet for the first returned row with ready-to-run `node_profile`, incoming/outgoing `match_edges`, and `blast_radius` MCP calls plus CLI fallback commands, so a graph scan can become focused evidence without another round of tool-selection guesswork. `match_edges` returns a `followUp` packet for the first returned real edge with ready-to-run `explain_relation`, `path`, and `relation_check` MCP calls plus CLI fallback commands, so edge scans move directly into evidence and write-preflight instead of being treated as raw proof. `match_edges.filters`, `match_edges.edges[].relationType`, `followUp.focusEdge.relationType`, and `query_plan(match_edges).normalized` expose public names such as `depends_on` next to canonical frontmatter `types` or `via` values such as `dependencies`, so terminal and MCP clients can show the relation name users typed while keeping executable graph keys. `node_profile.edges.incoming/outgoing.byRelationType` and edge `relationType` expose public names such as `depends_on` for node detail views; `domain_matrix.filters.relationTypes`, `connections.rows[].byRelationType`, and connection examples do the same for coupling views, while canonical `types`, `via`, and `byRelation` stay available for graph-key callers. The UI semantic coupling matrix and CLI node deep dive can be rerun from Claude Code, Codex, or terminal fallbacks with the same user-facing names. `agent_brief` returns Claude Code/Codex handoff readiness, a copyable `handoffPrompt` (also printable via `oh-my-ontology agent-brief --prompt`), graph entrypoints, first MCP calls, structured `graphDbQueryPack` (`facets` / `schema` / `query_plan(match_nodes)` / `match_nodes` / `query_plan(match_edges)` / `match_edges` / `domain_matrix` / `query_plan(centrality)` / `centrality` / `query_plan(all_paths)` / `all_paths` / `explain_relation`), investigation playbooks including `graph_traversal` (`schema` → `query_plan(all_paths)` → `all_paths` → `pattern_walk` / `project_map`), `traversalStrategy` (`plan_before_enumeration` → `bounded_path_evidence` → `containment_cross_check`) for plan-first bounded traversal, per-playbook `evidence[]` and `stopWhen[]` checklists, write guardrails for `add_relation` / rename-merge / post-change sync, relation preflight before `add_relation`, a `relationDecisionGuide` for the `skip_existing` / `review_inverse` / `safe_to_add` / `review_new_schema` outcomes, `resultContracts` requiring `all_paths` callers to report completeness fields and requiring `match_nodes` / `match_edges` callers to report `totalMatches`, `limited`, and `followUp` details before treating scan rows as evidence, and read-first write policy. The CLI companion `oh-my-ontology agent-brief [vault] --graph-db-pack` turns that pack into a shell-pasteable graph scan script for sessions without MCP. `relation_check` validates relation `type` before endpoint slug resolution, so relation typos such as `depend_on` still return nearest-value hints even in empty or project-less vaults, and returns `matchingEdges`, reverse-direction `inverseEdges`, and a recommendation decision (`skip_existing`, `review_inverse`, `safe_to_add`, or `review_new_schema`) before exposing an `add_relation` `proposedAction`. `maintenance_plan` actions include stable `id`, cursor resume via `afterActionId`, explicit `cursor.reason` metadata, executable graph-array canonicalization, count-safe summary fields, `byPhase` / `bySeverity` / `byKind` remaining-queue buckets, `executable`, current-page `nextExecutableAction`, current-page `nextReviewAction`, plus `executableOnly` / `phases` / `severities` / `kinds` filters; ready pages report `cursor.found=true` with `cursor.reason=null`, while unknown cursors return an empty page with `cursor.found=false`, zero remaining actions, and no next actions. `phases`, `severities`, and `kinds` are enum-validated so typoed work-queue filters fail instead of returning an empty plan.
13. **validate_vault** — whole-vault health check with per-file issues and grouped summary, including schema-bound 8 issue codes for non-canonical graph arrays and dangling graph references
14. **analyze_repo_structure** `{ rootPath?, maxDepth?, ignore? }` — side-effect-free bootstrap candidates from package / README / source layout
15. **infer_imports** `{ rootPath?, sourceFolders?, ignore?, maxFiles? }` — side-effect-free TS/JS import graph → file/module dependency edge candidates. Use after `analyze_repo_structure` to pull real `depends_on` candidates from code rather than only layout heuristics; the agent reviews `moduleEdges` with `count` + `kindCounts` and lands accepted edges via `add_relation` / `add_relations`, so the vault is not modified by analysis. Unresolved import `reason` is schema-bound to `empty`, `relative-not-found`, or `alias-not-found`; `kindCounts` is schema-bound to positive integer `static`, `dynamic`, `require`, `reexport`, and `side` keys. Resolves relative imports, `tsconfig.json` paths, and fallback common `@/*` aliases when the target exists; `maxFiles` defaults to 5000 and caps at 50000 to stop pathological monorepo walks.

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

### `OperationsNav` (top, always visible)
- Sticky header: 3 nav items (Source / Ontology / Topology)
- Right: `ModeBadge` (vault folder name + doc count chip OR demo chip with picker link) · `LocaleSwitch` · `ThemeToggle`
- Active detection by pathname prefix
- Sub-nav row appears on `/ontology/*` (R3 always visible)

### `BottomTabBar` (mobile only, `md:` hidden)
- 4 tabs: Ontology (`/`, `/ontology`) · Topology (`/topology`) · Projects (`/projects` or `/project`) · Source (`/docs`)
- Min height 56 px (safe-area)
- Hidden on public marketing/download surfaces: `/` while no local vault is loaded, and `/download/`

### Search palettes (separate by design — R5 skip merge)
- **`⌘K` `SearchPalette`** — projects-focused fuzzy search + top vault docs match (3) + recent (5) + Layer filter (All / Hub / Node)
- **`⇧⌘K` `MountedGlobalSearch`** — ontology nodes + projects unified (`cmdk`-based, kind/project filter chips, virtualized)
- Both palettes share keyboard: `↑↓` navigate · `↵` select · `Esc` close

### `ShortcutSheet` (`?` to open)
- 10 sections grouped: navigation · topology · search palette · hub rail · source vault palette · source graph · source files · source actions · tour · portfolio
- 2-column grid on sm+, focus trap, `Esc` closes

### `LocaleSwitch`
- Two-button toggle EN / KO
- Replaces locale prefix in pathname; preserves rest (NOT query params — Scenario 9 finding, R9 deferred)
- localStorage `omot:locale`

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
| `Tab` (in palette) | Source Vault palette | Cycle mode (`""` → `>` → `#`) |
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
