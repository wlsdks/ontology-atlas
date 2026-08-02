# FEATURES — ontology-atlas

> Complete inventory of features users can **actually use right now**.
> Last updated: 2026-08-02 (현재 route와 installed-app 계약 및 project meaning
> receipt 계약 재검증 —
> `/ontology`은 `/topology?index=expanded`, `/ontology/edit`은
> `/ontology/studio` 호환 redirect이며, Insights는 할 일·구성·연결·경계·신선도
> 5개 질문 탭의 maintenance board다. desktop static smoke와 installed-app
> verifier/Computer Use가 같은 계약을 확인함 — 세부는 §2 각 라우트 절 참고).
> Earlier (2026-07-18): 전 페이지 시안-우선 재구성 웨이브, PR #355~#366.
> Earlier
> (2026-05-31): real-time **adaptive** vault polling, `/docs` editor save-conflict data-loss guard, fresh-init starter ambiguous-alias fix, `find_evidence` relevance ranking, `validate_vault` vault→code `pathDrift`, `infer_imports` edge reconciliation. Earlier still (2026-05-28): graph DB health gate and the now-retired Browse / Builder / Query loop; those historical surfaces are not current route guidance.
> Routes section UI detail remains a maintained product snapshot. When route
> behavior changes, update this file alongside the PR body and CHANGELOG.
> Update trigger: reflect immediately when surfaces are added or removed. Update alongside the PR body and CHANGELOG.

---

## 0. At a glance

> **Mission v3**: "One product/system, one ontology, that people and their AI agents grow together."
> **Current framing**: an agent-native, human-sovereign meaning layer: typed enough for Claude Code, Cursor, and Codex; plain Markdown and Git diffs for human judgment.
> **Operating model**: single-user tool. Local-first vault. No login, no backend. **4 surfaces (desktop app · CLI · MCP · Website)** — daily heavy-lift ontology work happens in the installed app / CLI / MCP; the hosted website's root map lets anyone open their own local vault folder directly too (root-first-open, 2026-07), while `/download` stays the product intro + release download path.
> **Brand split**: **Ontology Atlas** is the user-facing desktop app / website brand and release asset identity. `ontology-atlas` remains the repo, CLI binary, and MCP package name.

The product should not feel like an ontology editor. The core user-visible loop
is `init -> bootstrap -> MCP-backed agent answer -> agent sync proposal -> git
diff review -> better next agent task`.

| Surface | Entry | Audience |
|---|---|---|
| **Desktop app** (macOS · Windows x64 beta) | signed/notarized macOS DMG or unsigned Windows beta NSIS → installed local workbench; first run opens `/docs/?intent=local` vault setup welcome; visual routes `/docs`, `/ontology`, `/topology`, `/projects`, `/ontology/studio`, `/ontology/insights` | daily visual ontology work — pick a local vault folder, edit markdown-backed nodes/relations, reopen recent vaults without visiting the hosted site |
| **CLI** (R12 / R14 / R15+ · 52 commands) | `init / agent-setup / agent-files / agent-activity / add / import / list / find / validate / mcp-verify / query / compile / export` (vault basics + existing-vault Claude/Codex config repair + read-only agent-file map/drift readout + explicit live activity heartbeat + installed MCP health/graph-query smoke + deterministic graph compile + standard-format interop export) · `index / analyze / infer-imports / bootstrap / preflight / snapshot` (autonomous ingest, project ontology indexing, commit preflight, and vault-scoped git snapshot commits) · `backlinks / orphans / path / explain / all-paths / reachability / relation-check / relate / rename / merge / delete` (graph CRUD + direct/path/common-neighbor explanation + bounded traversal + transitive closure + write preflight + write) · `match-nodes / match-edges / domain-matrix / facets / schema / pattern-walk / project-map / overview / hubs / blast-radius / cycles / components / topological-order / health / agent-brief / workspace-brief / growth / maintenance / node / similar` (graph deep dive — `query_ontology` ops, including graph DB-style node/edge scans, relation dashboard facets, relation schema patterns, explicit traversal and project maps, connected island checks, prerequisite ordering, relationship explanation, domain coupling matrix, agent handoff, and growth/maintenance queues) | developer terminal — vault scaffold, daily exploration, bulk import, MCP sanity check, live agent activity handoff, commit-time vault impact preview, graph deep dive (same authority as AI agent via MCP) |
| **MCP** (R5 / R7 / R11 / R14 / R16 / R17) | 33 tools (19 read · 14 write) over JSON-RPC | AI agent (Claude Code, Codex, Cursor) — explicit vault/repo root proof · read for context · write back findings · vault-scoped Git status/local snapshots · safe relation removal/replacement and concept reclassification · bootstrap/index projects · finalize project competency receipts · compile/query/validator-backed health and fresh categorical meaning assessment |
| **Website** | GitHub Pages static export / `/` + `/download` | `/` renders the topology map directly and lets you open your own local vault folder from the browser (File System Access API, no install); `/download` is the product intro + release download path. Only `/docs`'s own separate local-source *browsing* tab stays desktop-only. |

Multi-project vaults use explicit selection at the agent boundary:
`ontology-atlas agent-brief --project SLUG` forwards the same project identity
as `query_ontology({ operation: "agent_brief", project: SLUG })`.

```
input (humans + AI agents)     parse           store              output
        │                       │                │                │
        ▼                       ▼                ▼                ▼
  .md in vault  →          frontmatter   →  user disk      →  Topology (/, /topology) map + INDEX
  (frontmatter)                              (vault)           Workshop (/ontology/studio) write surface
  + AI agent (MCP)                                            Docs workspace (/docs)
                                                              Insights (/ontology/insights) maintenance board
                                                              compatibility redirects (/ontology, /ontology/edit)
```

### Web and app do not promise the same screens (2026-07-27)

Decided in `docs/DECISIONS.md`; the enforceable version is
`.claude/rules/surfaces.md`. It is one codebase and one build — the app loads
the same static export in a WebView — so this is a capability table, not a
feature-parity backlog. **Desktop capabilities ship without a web equivalent,
on purpose.** What the web owes instead is an honest degradation: why it cannot
work here, and where it can.

| Capability | Web (Chromium) | Desktop app (macOS · Windows x64 beta) | Why they differ |
|---|---|---|---|
| Open the map with no install | ✅ | ✅ | the web's first job — gateway |
| Open your own markdown folder | ✅ File System Access API | ✅ absolute path | Firefox and non-FSA browsers degrade to a notice + download link |
| Read / edit / create nodes in that folder | ✅ | ✅ | same parser, same schema, same files |
| Remember the folder between visits | ❌ pick it again | ✅ | web keeps an FSA handle in its own IndexedDB; a convenience cache, not the source of truth |
| Work offline | ❌ | ✅ | |
| Git history and snapshots | ❌ degraded card + `ontology-atlas snapshot` | ✅ | a browser has no right to run git on your machine |
| API keys / in-app 「에이전트」 chat | ❌ **and will not be built** | ✅ native credential store | keys in browser storage leak to a single XSS, and vendors name the direct-call header `…-dangerous-direct-browser-access` |
| Write agent config (`.mcp.json`) into the vault | ⚠️ folder writes work, but there is no absolute path to record | ✅ | MCP registration needs a real path |
| In-app updates | ❌ | ✅ | |

**Windows today**: an unsigned x64 beta carries the same local folder and MCP
surface as the desktop app. `/download` states the SmartScreen unknown-publisher
and managed-PC risk before the executable CTA. Chrome or Edge remains the
install-free fallback when that warning or an organization policy is a blocker;
the web still does not offer BYOK or MCP registration.

---

## 1. Mode branching (data source)

`useDataSourceMode()` resolves to one of two modes (R10b: cloud / auth surface permanently removed):

| Mode | Condition | Behavior |
|---|---|---|
| **local** | a vault folder is active — picked in the installed app, or in an FSA-capable browser | vault manifest is the source of truth |
| **static** | no active vault | build-time dogfood manifest (this project's own ontology) |

**Effect**: when a user opens a vault folder in the installed app, `/`, `/topology`, `/projects`, `/project/[slug]`, `/ontology`, `/ontology/insights`, and `/ontology/studio` all switch to vault data instantly. Mutations (create / edit / delete / connect) are mode-aware: local → write to vault `.md`; static → rejected with toast (read-only) and routed toward the desktop app download on hosted web.

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
  names. **Scope segment** — *this folder* (the app writes `.mcp.json` /
  `.codex/config.toml` / `.cursor/mcp.json` / `.agents/mcp_config.json`
  inside the vault, so a `git diff` shows it) or *this whole computer*
  (the app writes nothing outside the vault; it hands you a ready command
  or settings block with the absolute vault path already filled in, and
  says plainly that a home-folder change will not appear in `git diff`).
  Claude Code's global path is a `claude mcp add --scope user` command
  because `~/.claude.json` is a file Claude Code rewrites at runtime.
  Default is *this folder*; your pick is remembered.
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
  derivation (`computeCanonicalCensus`). Topology, Docs, Workshop, Insights,
  and Projects read the same file-backed scope; a surface-specific subset is
  labeled as a subset rather than silently presenting it as the vault total.
- **Docs library on the web** — the local-vault gate is capability-based
  (File System Access), not runtime-based: the same browser session that
  writes via Workshop or the document editor can read/edit in the docs
  library.
- **Relation vocabulary** — one dictionary (formal/plain × 7 types × ko/en)
  feeds the map legend, Insights, Workshop, and datasheet (contract-tested);
  the "?" sheet footer defines 도메인/역량/요소 in plain language.

**Single source of truth (R8)**: `LocalVaultProvider` mounts once in `app/[locale]/layout.tsx`. Its many `useLocalVault()` consumers (`RootEntryPage` / `AppNavRail` / `OntologyStudioPage` / `DocsVaultPage` / `useDataSourceMode` / `useProjects` / `useProjectMutations` / `useVaultOntology` and the persistent app shell) share one state instance, one IDB rehydrate, one filesystem walk.

**Desktop first-run (2026-07-18)**: in the installed app (Tauri — detected via
`isDesktopShell()`, `src/shared/lib/desktop-shell.ts`), `/` with no vault
renders an Obsidian-style **FirstRunPage** (`src/views/first-run/`): four
machined cards — **just start** (2026-07-23, Tauri runtime only — no folder
picker at all: creates `~/Documents/Ontology Atlas/<name>` on real disk
automatically, numbering `-2`/`-3` on a name clash, connects it, then reuses
the same `scaffoldOntology()` seed as "create new vault", and the success
toast names the exact path — real disk, not OPFS, so an AI agent/MCP can
still read it; hidden when the real Tauri invoke bridge is absent, e.g. a dev
`?shell=desktop` browser override) / open vault folder / create new vault
(existing `scaffoldOntology()` when the picked folder is empty — 5 markdown
seeds + agent configs) / browse the built-in demo vault — plus a local-first
trust line. No download CTA inside the installed app.

**Web root-first-open (2026-07-18)**: on hosted web, `/` no longer shows a
marketing landing page at all — with no vault selected it renders `HomePage`
(the same topology hub `/topology` uses) drawing this project's own dogfood
sample, read-only, plus a **first-run starter module** integrated into the
INDEX panel itself (no floating card/dock — `FirstRunStarterModule`,
`src/features/first-run-starter/`): census meters (concepts/relations/
domains, real data — ko 라벨 개념/관계/도메인) + "open my markdown folder" +
"create a new vault" + "just looking around" dismiss (sessionStorage —
reappears next session, not on reload). 2026-07-24 온보딩 라운드: 두 폴더
CTA 는 OS 선택창 직행 대신 **사전 안내 시트**(`VaultOpenGuideSheet`,
`src/features/docs-vault-local/`)를 먼저 연다 — 안심 3줄(아무 마크다운
폴더나 OK / 파일은 로컬 유지 / 빈 폴더면 시작 문서 자동 생성) + 기존
폴더 선택·빈 폴더로 새로 시작 분기. 카드에는 "2분 구경하기" 투어 CTA 와
"쉬운 말로 보기 켜기" 1클릭 토글(톱니 속 '일반' 모드 승격)도 추가.
빈 vault 를 연 직후에는 dead-end 문구 대신 **시작 체크리스트**
(`VaultStartChecklist`, `src/widgets/topology-controls/`)가 선다 —
소유자 지시(2026-07-24 2차)로 **에이전트-우선 3단계**: AI 에이전트
연결(heartbeat 실판정) → 첫 분석 맡기기(에이전트 붙여넣기용 지시
복사) → 직접 만들기(선택, project kind 프리셋 컴포저). 웹에서 macOS
설치를 권하던 오안내 브랜치 제거. 첫 방문에는 폴더 안내 시트가
자동으로 먼저 열리고(1회, 건너뛰기 제공), 이 세션에서 직접 폴더를
열면 AI 에이전트 연결 시트가 1회 자동으로 이어진다. A brand-pill
`SAMPLE` badge and a bottom-right map readout ("N project · N domains ·
Spine view · zoom in to reveal elements") stay visible for the whole static
session regardless of whether the starter module was dismissed. The former
`LandingPage` and its hero/value-chain/evidence-instrument content moved to
`/download` (see below) — a returning user whose vault handle restores from
IndexedDB goes straight to their own workspace, no starter surfaces at all.

---

## 2. Routes

> The route inventory itself is `docs/ARCHITECTURE.md` — this section describes what
> each surface *does for a user*, not how many there are. A count here rots on the next
> route and nothing gates it (it said 12 while listing 15, 2026-07-31).

### `/` — Smart entry

- **Hosted web, no vault** → the **gateway face** — headline, download, and "open it in the browser" — the same view `/download` renders (2026-07-30, root-first-open 뒤집기). Judged by `isGatewaySurface()`. A web user who *has* a vault still gets `HomePage` with the dogfood sample and the INDEX-panel first-run starter
- **Desktop app, no restored vault** → `FirstRunPage` (just start / open / create / browse demo), not the hosted intro
- **Recent desktop vaults** → the picker stores recently opened Tauri vault paths, can reopen them without another Finder selection, and can remove stale paths from the list
- **Vault loaded (web or desktop)** → `HomePage` — the topology hub (map + INDEX concept panel + node datasheet), same component `/topology` renders (B3 허브가 곧 지도 — the old tree/ego hub, `OntologyViewPage`, is retired; `/ontology` now redirects here with INDEX expanded). Restoring a previously-opened vault handle from IndexedDB goes straight here — no starter surfaces, no re-clicking through first-run every visit
- **Switch vault mid-session**: the topology settings gear (⚙, top-right utility rail) has a "switch vault" row → `/docs/?intent=local`, alongside the `/docs` vault pill's own "swap" control

### `/download` — the install decision (remade 2026-07-27)

**This screen's job, in one sentence**: *a first-time visitor chooses their
platform, understands its trust state, and gets the matching installer without
hunting for it.* Everything on the page earns its place against
that sentence; the remake removed what could not (a second landing hero, a
Korean-only changelog excerpt, 12 same-weight boxes, and the signing copy that
had become false).

- **Decision first, at full column width**: eyebrow → headline → one-paragraph lead → the macOS decision card. The card is the widest thing above the fold because it is the most important; it used to sit inside a half-width column under a taller figure.
- **One filled indigo button per state, and it is the one that works.** Published → the Apple Silicon DMG with its real size (most Macs sold since 2020), Intel beside it at ghost weight. **Unpublished** → the winner is "open the map in your browser" (`/`), because today the GitHub releases page has nothing on it; a filled button pointed at an empty page spends the page's one strongest promise on a dead end. The releases link stays, at lower weight.
- **Architecture help is on the page, not assumed**: "Apple menu → About This Mac; if *Chip* says Apple M1–M4 it's Apple Silicon". Naming both architectures and stopping there left the majority of visitors — who do not know which Mac they own — stuck in front of two buttons.
- **One release-state source**: everything the page may claim about a build comes from `src/views/download/model/macos-release.generated.ts`, written by `pnpm download:release-facts` out of the real GitHub Release. Published macOS → per-architecture DMGs; published Windows → the x64 NSIS installer; both carry real byte size, filename, direct URL, and copyable SHA-256. Unpublished → plain pending copy instead of placeholder facts. There is no state where the page shows a size or checksum that does not exist.
- **Trust is four facts with their proofs, not a paragraph**: Developer ID signing (`codesign verified`) · Apple notarization + stapling (`stapler validate passes`) · a published SHA-256 per file with the verify command built from the current version's real DMG name · and *what the app does not do* — no account, no server, the folder you pick never leaves your disk. Signing is stated as a property of the release path and drift-guarded by `release-facts.test.ts` against the real `desktop:release-artifact` chain (`desktop:sign` → `desktop:notarize` → `desktop:verify-release-dmg --require-signed --require-notarized`), so the claim cannot outlive the pipeline that backs it.
- **After-install path in three steps** — drag to Applications and launch · point it at a markdown folder · connect your AI assistant (tool and command counts derived from `mcp/src/index.js` and `cli/src/lib/cli-commands.mjs`, both drift-guarded) — plus the fact that makes this page a one-time visit: the installed app updates itself with one button (#726).
- **Windows x64 beta**: a published unsigned NSIS installer appears in its own platform section inside the same decision plate. The static warning precedes the outline CTA and names SmartScreen's unknown-publisher warning and managed-PC blocking. Native Windows CI requires dependency audits, Microsoft Defender scan, silent install, app launch, and the installed MCP sidecar smoke; it does not claim to have verified the Windows 11 SmartScreen UI.
- **Evidence figure**: the dogfood instrument (project hex + domain chips + hub capability circle, real `docs/ontology` census — `src/views/download/model/dogfood-census.generated.ts`, built by `scripts/build-docs-vault.mjs`) now sits beside step 02, the one place it is an answer rather than decoration, with its scope caption ("counts this repo's own vault, not yours").
- **Secondary CTA**: "Go to GitHub" → GitHub repo, as a visible medium outline button rather than a small source footnote.
- **Motion**: none on entrance (first painted frame is identical to the settled frame across every node in `#main`). The budget goes to the attention winner alone — the filled CTA eases on `--motion-base` + `--motion-ease` with a 6.1% first-frame share — and `prefers-reduced-motion` lands it instantly. The previous page inverted this: a staggered fade ran on background cards while the winner hard-cut.
- **Live deploy verification**: `pnpm desktop:verify-hosted` checks the deployed `wlsdks.github.io/ontology-atlas` root/download pages. It asserts only **server-rendered** text: the root map hydrates client-side, so its in-app CTAs never reach the static HTML — expecting them is what kept this gate failing on every Pages deploy while the site itself was fine (5/5 runs red, 2026-07-26~27). Expected download copy is read from `messages/ko.json` instead of duplicated in the checker, so the contract is "the page renders its own copy" and cannot drift: title, source-code CTA, both platform headings, the Windows beta trust state, the hosted-site scope note, a stable GitHub Releases href, and no `/releases/latest` dependency.
- **Privacy note**: the installed app and vault data use local disk as the source of truth; `/docs`'s own local-source *browsing* tab stays desktop-only (unrelated to opening your primary vault from `/`)
- **Footer**: license · GitHub · stack chips · `LocaleSwitch`

### `/` and `/topology` — canvas-2D topology hub

Both routes render the same `HomePage` (R3 keep-both decision: `/` = home/back-link target, `/topology` = explicit deep-link namespace).

#### Analysis modes + workflow entry points
- **개요 (overview, default)** — the canvas-2D Topology map with deterministic
  project/domain/hub structure and bounded ForceAtlas2 settling: the read-first
  decision surface.
- 초점/경로/상태 are **not separate canvases**:
  - **초점 (focus)** — enters via node click on the map (selection state); `mode=focus` deep links preserved
  - **경로 (path)** — enters via shift-click of 2 nodes or `mode=path` deep links
  - **상태 (health)** — enters via the 정리 queue count chip on the view rail; `mode=health` deep links preserved

#### Canvas (`topology-map-v2` — custom canvas-2D engine + Graphology ForceAtlas2 physics)
- **Click node** → right-side panel opens (`ProjectDrawer` for project nodes, the 352px node datasheet for domain/capability/element nodes — see "Node datasheet" below)
- **Drag node** → reposition (releases back to physics)
- **Double-click node** → "local graph" mode (2-hop neighbors only, breadcrumb: `Local · Root · slugA · slugB`, click to backtrack, Esc to exit)
- **Right-click node** → context menu (Focus / Local graph / Copy detail URL)
- **Shift-click 2 nodes** → highlight shortest path
- **Dense-group cluster chips** → a parent with more than 12 direct children (e.g. a domain with 108 capabilities) folds its whole subtree into a single `+N` chip instead of spilling hundreds of overlapping nodes/labels. Click the chip to expand just that parent (nodes fan out as a bounded phyllotaxis disk); click the `−` chip to collapse again. Expanded parents live in the URL (`?open=slug1,slug2`) so a shared link or an AI agent reproduces the same expansion. Nested dense children get their own chips once their parent is expanded.
- **How the chip looks and where children land is a setting** (설정 › 확장, 2026-08-01 — ported from the `.qa-scratch/proto-expand.html` measurement prototype). Five values: the open control (`뜬 알약` · **`머리 위 막대`, default** · `어깨 배지`), the child layout (`나선 원반`, default · `부챗살` · `고리` · `기둥`), and three numbers — how many open at once (4–24, default 24), how many names are attempted per parent (3–40, default 8), and how many parents stay open at once (1–6, default 3). The default control is the bar docked directly above the **selected** node: nothing shows until you select a node, and the folded count keeps living on the node body. Rationale and the observation that would reverse it: `docs/DECISIONS.md`.
- **Expand realm (영역 전개)** → focus a node (click) and an orbital **Expand realm** button appears just outside its ring (also offered as an action in the node datasheet, for container nodes). Activating it transforms the map into *that node's world*: only its containment subtree remains, re-laid-out with the node as a temporary root at the origin (children map to rings by **depth**, not kind), and everything outside unmounts behind a 1px indigo warding circle. Relations crossing the boundary fade to a stub at the ring. The transition is a 600ms choreography — outside nodes fling out along curved "gravity" trajectories, inside nodes FLIP to their new spots, the camera dollies in to fit the realm (`prefers-reduced-motion` snaps instantly). The active realm lives in the URL (`?realm=slug`) so a shared link or an AI agent reproduces the same world; a top-center **영역: {title} ✕** chip and **Esc** (highest ladder priority) return to the full map. Click, `?open` density gating, selective ego, and top-K labels all still work inside a realm.
- **Ontology block exchange** → INDEX의 **블록 가져오기**는 `.md` 폴더와 선택적
  `block-manifest.json`을 읽어 신규/충돌 dry-run을 먼저 보여주고, 사람이
  승인한 파일만 현재 vault의 기존 `createDoc` 경로로 쓴다. 영역 전개 화면의
  **이 영역의 원본 .md 를 블록 폴더로 내보내기**는 containment 서브트리의
  원본만 복사한다. 웹은 `showDirectoryPicker()`, 설치 앱은 같은
  `FileSystemDirectoryHandle` 계약의 native Tauri picker를 사용한다.
  picker 취소는 오류나 쓰기가 아니며, CLI-only 대체 경로는
  `ontology-atlas import <path...>`이다.
- **Tab** → keyboard cycle to neighbor hub
- **Empty state** (0–1 nodes) → `TopologyEmptyState` explains whether the
  vault lacks projects or relations, then offers the applicable next actions:
  bootstrap from found docs, create a node, open Topology INDEX, open Workshop,
  or choose a vault.
- **Filter active** → bottom-left "filter · N / TOTAL" badge

#### `TopologyFitControl` (top-right, desktop-only)
- Single **Fit Map** tile — fits the camera to the graph bounds. Desktop-only (mobile uses pinch-zoom).
- The old "map controls" panel (search · "Hubs only" · overlays · depth/force sliders · in-panel shortcuts help) was a dead control board — the v2 canvas engine never read those focus/overlay/force fields — and was demolished (2026-07-21). Physics (force) tuning may return later as a real, wired feature (see BACKLOG).

#### `SigmaHubRail` (left, collapsed default)
- Hub list sorted by degree, click to select
- Keyboard: `↑/↓` cycle hubs · `Home/End` jump to first/last
- Suppressed when hero panel expanded (avoid overlap)

#### Top-right buttons
- **Source button** (`D`) → `DocsQuickDrawer` overlay with pinned/recent markdown source preview
- **Shortcuts button** (`?`) → `ShortcutSheet`
- **Settings gear** (`TopologyV2SettingsGear`, 2026-07-18) → compact anchored popover (228px), no scrim: 언어 (`LocaleSwitch`) · 테마 (`ThemeToggle`) · INDEX 기본 상태 (expanded/collapsed default, writes the same localStorage key the INDEX panel reads). Self-closes; owns its own Escape so the global topology Esc ladder doesn't double-fire. Desktop-only (1512/1920 scope)

#### 에이전트 패널 — 첫 마디와 이어지는 루프 (2026-07-27, desktop-only)
- 상단 유틸 레인의 **「에이전트」** 칩이 지도 오른쪽에 세로 도크를 연다(폭 하나가 두 컬럼을 함께 움직이는 리플로우). 데스크톱 앱 전용 — 브라우저에는 키를 둘 곳도 보낼 경로도 없어 열리지 않을 문을 그리지 않는다
- **첫 마디 칩 3슬롯** (`buildFirstWords`) — 빈 대화에 이 폴더의 실제 상태에서 뽑은 문장이 최대 3개 앉는다: ① **화면 슬롯** 지금 보고 있는 개념의 가장 큰 틈 ② **큐 슬롯** 「할 일」 큐가 지목하는 첫 개념(같은 판정 함수 `detectMeaningGaps`) ③ **상비 슬롯** 「이 지도에서 지금 제일 이상한 곳이 어디야?」
- **모델 호출 0이 계약이다** — 칩은 사용자가 [보내기]를 누르기 전에 그려지므로, 칩을 만들려고 나가는 호출은 곧 동의 없는 전송이자 남의 돈(BYOK 요금) 무단 사용이다. 생성기는 순수 함수이고 전송 경로를 import 하지 않는다 (`tests/contract/agent-first-words-local.contract.test.ts`)
- **칩 = 프리필, 전송 아님** — 누르면 입력칸에 문장이 앉고 전체 선택 + 포커스. 고쳐 보내도 되고 지워도 된다. 칩은 눌린 뒤에도 남는다(상태 없는 컨트롤)
- **억지로 셋을 채우지 않는다** — 빈 폴더는 칩 1개(「무엇을 만드는 제품인지부터 같이 정리해 줘」), 보고 있는 개념이 없으면 화면 슬롯 없음, 결함 0 폴더는 상비 슬롯만. 칩 **하나의 높이**는 문장 길이와 무관하게 같다(실측 1512×950: 칩 1~3개 전부 44px, 입력칸 자리 불변)
- **키/폴더가 없는 상태의 「이런 걸 시킬 수 있어요」도 같은 생성기** — 문장은 같고 옷만 다르다(평문 목록). 완결할 수 없는 순간에 누를 수 있는 컨트롤을 그리지 않는다
- **다음 한 걸음** — 쓰기를 제안한 턴의 **같은 응답 안**에서 모델이 다음 빈 곳 하나를 말하고(시스템 프롬프트의 `NEXT:` 한 줄), 그 줄이 칩 하나가 된다. **추가 LLM 호출 0** · 프리필이라 살아 있는 제안이 둘이 되지 않는다
- **세션 사이의 이어짐** — 새 대화의 화면 문맥에 이 폴더의 **최근 적용된 변경**(git 이력 최대 5줄, 줄당 120자 상한)이 실린다. 대화는 저장하지 않는다 — 쓰기는 frontmatter + git 에 남고 그것이 다음 대화의 문맥이 된다
- **세션 요약** — 헤더 부제 자리 한 줄이 「이 대화에서 개념 N개 · 연결 M개」로 바뀐다(적용에 성공한 변경만 센다). 같은 줄의 글자만 치환 — 자리·크기 불변
- **S7 이음새** — 노드 상세의 **「말로 시키기」** 타일과 인사이트 큐 행 케밥의 **「에이전트에게 말로 시키기」** 가 칩과 **같은 생성기·같은 문장**을 쓴다. 큐에서 건너올 때 주소(`?ask=missing-definition|missing-domain|missing-relations`)가 나르는 것은 **의도의 종류**뿐이고 문장은 도착지가 화면 언어로 짓는다. 주소가 곧 상태라 뒤로가기로 같은 문맥이 되살아나고, 패널을 닫으면 그 요청도 함께 거둬진다
- **겹침** — 패널이 열려 있는 동안 선택-노드 인스펙터는 패널 폭만큼 안쪽에 선다(둘은 함께 읽어야 하는 한 쌍). 이동은 패널 리플로우와 같은 duration·같은 곡선
- **세로 리듬 (2026-07-28)** — 이 패널의 여백은 양끝에 닻이 있다. 잠긴 상태는 **위** = 무엇을 시킬 수 있나, **아래** = 무엇이 필요한가 + 그 문, **가운데** = 대화가 생길 자리다(보내면 실제로 거기에 답이 앉는다). 대화·동의 상태는 아래에서 자라 답과 손이 붙는다. 실측 1512×950: 뜻 없는 두 여백(위 361 · 아래 361px)이 뜻 있는 하나로, 대화 상태 여백 639 → 512px
- **바닥은 입력칸 하나가 주인공 (2026-07-28)** — 지침 열람 · 터미널 인계는 상주하지 않고 입력칸 아래 **한 줄**이 여닫는다(열리는 영역은 한 번에 하나 — 임시 표면을 겹쳐 쌓지 않는다). 경계 문장("코드까지 봐야 하는 일은 터미널의 AI 가 낫다")은 넘기는 자리 안으로 내려갔다. 바닥 크롬 176 → 104px
- **쓰기 동의 약속이 결정하는 자리에서 읽힌다 (2026-07-28)** — "문서를 고칠 일이 생기면 바뀔 내용을 먼저 보여주고, 확인해야 저장돼요" 가 키를 맡길지 정하는 화면과 동의 시트 **둘 다**에 선다. 이전에는 제안 카드가 뜨기 전까지 화면 어디에도 없었다
- **강등 경고는 턴의 결론에만 (2026-07-28)** — 도구 호출 전 중간 서술("먼저 읽어볼게요")은 볼트에 대한 주장이 아니다. 한 턴에 세 번 반복되던 최고 경고가 한 번으로
- **멎은 턴의 되돌아갈 길 (2026-07-28)** — 실패 알림은 본문 무게로 서고(구: 화면에서 가장 조용한 줄), 같은 말을 입력칸에 다시 앉히는 칩이 붙는다. 프리필이지 전송이 아니다

#### 어권별 노드 이름 (`display_<locale>`, 2026-07-24)
- frontmatter `display_ko` / `display_en` → 화면 언어에 맞는 이름을 지도 라벨·INDEX·팝오버가 그린다. 폴백 사다리: `display_<screen locale>` → `display` → `title`. 검색/매칭은 항상 `title` 전체(라벨이 검색 범위를 좁히지 않는다)
- 쓰기 3경로: MCP `add_concept`/`add_concepts` 의 `labels: { ko, en }` · `patch_concept` 의 직접 키 · 지도 컴포저의 어권별 이름 칸
- 한쪽만 채우는 사고 방지 — MCP 는 단일 로케일 입력에 advisory warning, 사람 폼은 **현재 화면 언어 칸이 필수**이며 다른 언어만 채우면 저장을 막고 이유를 인라인으로 설명한다(모달 없음)

#### Guided tour (`topology-tour-button`, 2026-07-23, `src/features/guided-tour`)
- **Compass** tile, "?" 타일 바로 위 — 지도 화면 전담 의미 문해 투어. md+ 전용(`hidden md:flex`, 폰은 제외)
- **첫 방문 자동 시작 (2026-07-24 온보딩 라운드)** — 샘플 모드 정착 + `guided-tour:v1` 미기록이면 900ms 뒤 1회 자동 시작. skip 이 `skipped` 를 기록해 재방문엔 다시 안 뜨고, 로컬 vault 사용자에게는 발화하지 않는다. 발화 순간 모달(`aria-modal`)이 열려 있거나 문서 포커스가 나가 있거나 투어가 이미 열려 있으면 조용히 건너뛴다(`canAutoStartGuidedTour` — stacked-transient 가드). 수동 진입은 컴퍼스 타일 + 첫 실행 카드의 "2분 구경하기" CTA 두 경로
- 8 declarative steps, plain-language copy, no jargon even for "ontology" itself: 지도=문서(1) · 점의 크기/모양(2, 캔버스 노드 앵커) · 관계 범례(3) · 직접 눌러보기(4, 인터랙티브 — 실제 클릭을 기다렸다가 자동 진행) · 데이터시트(5, 4단계 선택 성공 시에만 노출) · INDEX(6) · 최근 변경 렌즈(7, 여기서 "구경 끝" 또는 "저는 개발자예요" 로 분기) · 에이전트 다리(8, dev 분기 — `FirstRunStarterModule` 하이라이트)
- Each step's anchor auto-skips (and the `N/M` progress-dot denominator shrinks) when its target isn't resolvable — missing element, `display:none`, or off-viewport
- Highlight technique: a `box-shadow: 0 0 0 9999px` scrim-and-cutout paint (not a glow ring — `blur 0`), CSS-transitioned (180ms) between DOM-anchored steps, and a per-frame `worldToScreen` canvas projection (same technique as the realm "전개" button) for the two canvas-node steps — both painted on the same z-70 overlay layer so every step dims the surrounding chrome identically
- The interactive step 4 is a click **funnel**, not a free-for-all: a 4-strip transparent blocker leaves only the spotlit domain dot's cutout clickable (chrome — the tour tile itself, search, "?" — stays blocked), and the anchored dot is a spine-visible domain whose click deterministically opens the datasheet
- Opening the tour demotes other transient surfaces (shortcuts sheet, docs drawer, create-node composer, search palette) and temporarily hides `SampleNodeHint`; `Esc` closes only the tour (ladder tier between the context menu and the create-node composer — the first-run starter's capture-phase Esc yields while the tour overlay is open)
- Focus follows the dialog card on open/step change and returns to the launcher tile on close; the "I'm a developer →" branch button only renders when its step-8 anchor (the first-run starter card) is still present
- Completion/skip status persists to `localStorage` (`guided-tour:v1`) but never blocks re-running the tour from the same tile

#### 목적지 안내 (`DestinationGuide`, 2026-07-26, `src/features/guided-tour`)
소유자 요청: *"각 LNB탭 들어갔을때 가이드는 다 각각 있으면 좋겠네? 지금은
지도쪽만 있어서!"* — 지도에만 있던 안내를 나머지 다섯 목적지로 넓혔다.

- **두 번째 가이드 체계를 만들지 않았다.** 지도가 쓰던 투어 기제(`useGuidedTour`
  상태기계 · 스크림/컷아웃 오버레이 · 카드 · 진행 점 · 건너뛰기)를 그대로 쓰고,
  `useGuidedTour({ steps })` 로 목적지별 스텝 배열만 갈아 끼운다. 지도의
  8단계 여정(캔버스 노드 앵커 · 인터랙티브 클릭 · 개발자 분기)은 그대로 HomePage 소유
- **문서함 · 공방 · 인사이트 · 프로젝트 · 기록** 각각 2장 — ① 이 화면이 무엇을
  하는 곳인지(앵커 없는 중앙 카드) ② 여기서 처음 볼 것 하나(실제 요소 스포트라이트:
  `docs-vault-doc-list` · `studio-entry-choice` · `do-next-touchups` ·
  `project-selector-card` · `atlas-git-panel`). 기능 나열이 아니라 "여기서 무엇을
  할 수 있는가" 한 질문에만 답한다. 둘째 장의 앵커가 그 순간 화면에 없으면
  (예: 문서 목록 접힘) 자동으로 한 장짜리로 접힌다
- 셸(`AppShell`)이 소유하고 목적지마다 `key` 로 remount — 페이지가 각자 마운트하면
  하나가 빠져도 아무도 모른다(#65 계열 drift). 지도에서는 렌더하지 않는다
- **방해 금지** — "봤음"은 목적지마다 따로 기록한다(`guided-tour:<id>:v1`). 한 화면을
  봤다고 나머지 다섯이 삼켜지지 않고, 본 화면은 다시 자동으로 뜨지 않는다. 자동
  시작은 지도와 같은 가드(`canAutoStartGuidedTour`)를 통과할 때만
- **먼저 움직인 사람에게는 아예 안 뜬다 (2026-07-28)** — 자동 발화는 700ms 뒤에
  열리되 화면이 가려져 있으면 최대 30초까지 기다리는데, 그 대기 중 사용자가 먼저
  실질 상호작용(클릭·키 입력)을 하면 **발화 자체를 취소**한다(지도가 쓰던
  `watchGuidedTourAutoStartCancel` 이식). 스스로 탐색을 시작한 사람 위로 뒤늦게
  뜨는 카드는 안내가 아니라 방해다. 취소는 "봤음"으로 기록되지 않으므로 다음
  방문에 다시 기회가 온다. 정직 강등 카드가 선 화면(예: `<lg` 의 공방)에도
  뜨지 않는다 — 없는 표면을 소개하는 안내는 거짓말이다
- **다시 보기** — 설정 메뉴 › 화면 › "화면 안내". 여섯 목적지 전부에서 같은 자리다
  (지도는 우상단 컴퍼스 타일이 계속 주 진입점, 이 행은 보조). 화면마다 도움말 버튼을
  새로 만들면 화면별 크롬 수가 갈리므로 상시 표면 한 곳으로 모았다
- 마지막 장의 버튼은 `[다음]` 이 아니라 `[완료]` — 없는 다음 장을 약속하지 않는다
  (지도 투어에도 같은 규칙 적용)

#### Top-left brand pill (`HeroCollapsed`, compact-only since 2026-06-11)
- One pill, no expanded hero state (removed — it competed with the map for attention): selected project name, or workspace subtitle (concept/relation counts + weekly growth signal when > 0)
- Docs (`/docs`) and Topology INDEX (`/ontology` compatibility entry) quick
  links inline
- Chevron toggles the selected-node inspector support rail when a node is focused, or closes the drawer/datasheet otherwise

#### Node datasheet — two variants by node kind
- **Project node click** → the same right-side datasheet shell, with a project-only
  **code-evidence receipt** in place of the generic stats row. The receipt reports
  a categorical state, measurement time, currentness, the first evidence gap, and
  one next action; it is not a numeric confidence score or a claim that the whole
  repository is correct. In the installed app, **Connect code folder** binds one
  Git worktree or ordinary folder and measures declared capability/element code
  paths. The receipt labels the detected source honestly as **Git repository** or
  **Local folder**; it does not imply a GitHub account or remote integration.
  **Measure again** reuses that saved binding rather than asking for a new
  folder. Cancelling the picker or failing to inspect/save preserves the previous
  binding and receipt. The web can read the saved category but cannot bind or
  remeasure a private local folder.
- **Receipt privacy/currentness** → the private absolute folder path lives only in
  the vault-local `.ontology-atlas/project-sources.json` sidecar, never in graph
  Markdown, copied handoff text, or MCP output. A new sidecar write also creates
  `.ontology-atlas/.gitignore` when it is absent (an existing ignore file is left
  untouched). The installed app may show `current` only after it re-inspects the
  bound folder and matches its source identity, revision, and fingerprint to the
  receipt. If that recheck cannot run, the saved receipt remains visible but
  currentness is `unavailable`; an observed source or ontology change is `stale`.
- **Domain / capability / element node click** → `TopologyV2DetailPanel`, the 352px datasheet (scaled up from 288px, 2026-07-18): single engraved metric line ("사용하는 항목 N · 필요한 항목 N · 근거 문서 N"), typed groups for **하위 항목**, **상위 항목**, **사용하는 항목**, and **필요한 항목**, each capped with a "+N more" overflow; a promoted **근거 문서** group listing `evidenceIds` rows; an **AI에게 줄 항목 정보 복사** action with MCP/CLI-style context; **자세히 보기** opens the full detail panel. Relation role stays explicit so the same edge is not counted twice.

#### Mobile-only
- `BottomTabBar` (4 tabs: Map / Docs / Insights / Projects) at safe-area bottom
- `GestureHint` overlay (dismissible, not persisted)

#### Global keyboard shortcuts (all `useTypingShortcuts`-gated)
| Key | Action |
|---|---|
| `⌘K` / `⇧⌘K` | Unified ontology-node + project search |
| `D` | Toggle source drawer |
| `?` | Toggle shortcut sheet |
| `⌘O` | Open a local Markdown folder from the static sample |
| `Esc` | Close the highest-priority open layer or addressed map state |

---

### `/docs` — Ontology workspace (reader + editor + palette)

#### Crumbs row (2026-07-18, engraved vault census — always visible, above header)
- Back-to-workspace link · `Workspace` label · right-aligned engraved census (`concepts · relations`, mono numerals, sm+)

#### Header (always visible)
- Mobile tree-open button (<lg) · title · **vault pill**: vault path (md+) + doc count + top-level folder count (sm+) + swap/re-pick action · `Local` badge (when source=local)
- **Source toggle** (R3 cut C — radio: Sample / Local). Clicking Local opens the native folder picker when no vault is loaded (B2 2026-07 — the vault tools dropdown was retired; folder management now lives in App Settings → Workspace)
- **Palette button** (`⌘K`)
- **Inspector button**: opens the document outline, share/print actions, file actions, and backlinks only when requested, keeping the reading canvas quiet by default
- **App settings entry**: Workspace owns open/change/refresh/permission recovery
  and starter setup; Agent owns MCP/CLI connection guidance. New doc stays a
  document action rather than a settings action. The old docs-header vault
  tools dropdown and folder-topology toggle are retired.

#### Status banner (R9 cut, below header)
- Visible when `source=local && (status='error' || status='permission-needed')`
- Shows error message · "Open picker" button to reauth/re-pick
- Stops the silent server-fallback that was confusing users

#### Sidebar (`DocsSidebarBody`, persistent 280px pane on lg+, docs-vault-final spec)
- Three sections always visible (2026-07-18 — previously Pinned/Recent were tucked inside a collapsible "filter & saved" disclosure; an Obsidian-style vault workspace uses pinned/recent as often as the tree itself):
  - **Pinned** — pinned docs, unpin action
  - **Vault** (`DocsVaultTree`) — full folder hierarchy, kind glyphs + per-folder engraved counts, click to select, local search, tag-filter auto-expands folders
  - **Recent** — recently opened docs
- **List order** (2026-07-26, icon-row menu next to search) — two independent axes, both carried in the URL so a link and an agent handoff reproduce the same list:
  - `?sort=` — `name` (default, omitted) · `recent` (most recently edited first; a folder inherits the newest edit inside it)
  - `?group=` — `folders` (default, omitted; folders before documents, as in Finder / VS Code / Obsidian) · `docs` (documents before folders)
  - Unknown values fall back to the default instead of erroring — shared links get edited by other hands
- Tag filter stays its own collapsible disclosure (not this screen's primary purpose); active tag keeps it open

#### Mobile drawer (<lg)
- Hamburger button → overlay drawer with the same `DocsSidebarBody` contents

#### Content area
- **view=doc** (only view — folder-topology retired, P5a): editor (when editing) or viewer + `DocMetaBar` (word count, reading minutes, tags, updated date) + `DocFrontmatterBlock` (2026-07-18 — renders `kind`/`slug`/`domain`/`depends_on`/`evidence` directly on the page, only when the doc has a `kind:`; the visible proof that "frontmatter is the graph". In a writable local vault, an inline "Edit kind / domain / title" action turns this into a quick-patch: kind/domain are typed `<select>`s, title an inline input, saved through the same conflict-guarded `updateFrontmatter` path Workshop and other vault writers use — no raw YAML hand-editing for the three most-corrected fields) + optional inspector (`DocsVaultDocOutlinePanel`) + bottom **backlinks strip** (2026-07-18, full pane width, dedup'd single source — replaces the earlier duplicate backlinks surfaces)

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

#### Commands (~14 in palette, P5a cut 6 — daily note / folder-topology view / scaffold topology / create project / export vault / import vault)
view-doc · pin · unpin · copy URL · print · edit · new doc · rename · delete · insert TOC · export doc HTML · source-server · source-local · find tags

#### New document (P5c — kind-first, `NewDocKindDialog`)
"New doc" no longer opens a bare filename prompt with a generic `title:`-only template. It first asks which kind the document is (domain / capability / element / document — the same four current write flows recognize), then prompts for a title. `buildNewNodeDoc` (shared with Workshop and Topology's "create node" flow) places the file under the kind's vault folder (`domains/`, `capabilities/`, `elements/`, `documents/`) and writes normalized `slug`/`kind`/`domain`/`title` frontmatter — so every document created through the palette is a graph node from the moment it exists, not an orphan the growth queue has to catch later.

#### Visual / behavioral details
- Indigo accent (`rgba(139,151,255,…)`) for active, gold star for pinned
- Markdown: GFM tables/lists/blockquotes/code · callout blocks (`> [!tip]` etc.) · wikilinks (`[[slug]]`, `[[slug|label]]`, `[[slug#anchor]]`, `[[project:slug]]`) · heading anchor copy buttons
- Local images: relative paths resolved to blob URLs via `resolveImage` callback
- Recent + pinned per-vault localStorage (key prefix includes vault folder name)
- Sample/Local source toggle persisted to localStorage

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

`/ontology/studio` (공방 / Compass Stage) is the write surface and
`/ontology/insights` is the five-question maintenance board. The old
Browse/Write/Query labels are historical shorthand, not current navigation or
surface chrome.

---

### `/ontology/insights` — Insights (5-tab maintenance board, 질문 단위 재편 2026-07-26)

Every number on this page derives from the data source the page already used
(`useOntologyInsight`, `shared/lib/ontology-tree`) — no separate persona or
store layer. **One tab answers one question**: the old `구조` tab stacked three
different questions and grew to 2.2× the 14-inch viewport, so it was split into
구성 / 연결 / 경계. Scroll contract: every tab stays ≤ 1.3× viewport.

#### Header (always visible)
- Title + subtitle + right-aligned engraved census (`N concepts · N relations · N domains`)
- `TabBar` — 할 일 Do next (default) / 구성 Inventory / 연결 Connections / 경계 Boundaries / 신선도 Freshness. Tab state in `?tab=`; each tab badge counts what that tab is about (verdict total / nodes / edges / cross-domain relations / freshness window). Legacy `?tab=structure|overview` → 구성, `?tab=relations` → 연결, so bookmarks and agent return-chip links stay alive.

#### Tab 1 — 할 일 Do next
- Today's touch-ups, agent readiness gauge, repair queue, and the growth queue (see `DoNextTab`); the badge is the single verdict model (`insights-verdict`) shared with the body.
- **「내 몫 먼저」 two work groups** — the queue is split by the *nature of the work*, not by who you are. **의미 작업 / You can fix these right now** (meaning: missing definition · missing area · similar names · promotion candidates — answered by product knowledge) and **코드 작업 / Hand these to a developer or an AI** (neglected hubs · unlinked concepts · dependency cycles — answered by reading the implementation or a dependency direction). With your own folder open the meaning group is **first on screen**, so "83 items, none of them mine" becomes "N mine + M to hand off". Same data, only the order is in human language. Group headings render only when that group has visible rows.
- **Session-ability translation, not role gating** — there are no accounts (local-first, permanent). Three facts the app already knows drive the row actions: ① can this session write to the vault ② has an agent been observed in this folder (heartbeat) ③ does this concept own a document (`hasOwnDocument`). Read-only sample → 「공방에서 수정」 becomes 「공방에서 보기」 plus a copyable command, and the group order flips (hand-off work first, since hand-off is the only completion this session has). No agent observed → 「에이전트로 검증」 becomes 「넘길 명령 복사」. **No greyed-out disabled buttons** — a disabled control that does not say why is the same dead end.
- **한 문장 바로 쓰기 / inline one-field write** (`MeaningGapSection`) — rows for **뜻이 안 적혀 있어요** (no `description` *and* no body prose) and **어느 영역인지 안 적혀 있어요** (capability/element with no `domain:`) expand in place: a one-line input, or area chips built from the domains that actually exist in the vault. No new route, no modal, no trip to the workshop. Safety contract: the confirm line names the exact file and key before you press ("고칠 파일 `capabilities/pay.md` · 이 문장이 description 에 적혀요"), **cancel changes 0 files** (and a second press is required when you have typed something), the save locks in the pressed frame so double-clicks write once, and `expected_mtime` means a concurrent human/agent edit is never silently overwritten — the row says so and reloads, and the retry merges (their keys survive, only this one line is added). The write target is `resolveNodeDocument(node).ownSlug` — the same single source of truth the workshop uses, so a concept without its own document never gets someone else's file written to.
- **비슷한 이름 — 같은 걸까요?** (duplicate suspects) — concept pairs whose names/slug/kind/domain/neighbours overlap heavily, top 3 with the shared words as evidence, the overlap percent, a map deeplink to the node worth keeping, and a per-pair `merge_concepts` dry-run handoff. The score is a mirror of the MCP engine's `similar_nodes`, locked by `tests/contract/duplicate-pairs.contract.test.ts`, so screen and agent never name a different pair. Only nodes that own a vault document are considered (a node born from another doc's `elements:` ref has no file to merge). **0 suspects renders no section** — an empty "no duplicates" card is ink without a decision.
- Queue sections show 3 rows each plus their total; the rest is the agent handoff's job (scroll contract).

#### Tab 2 — 구성 Inventory
- **Hero census** (`InsightsHeroCensus`) — concepts / relations / health facts (orphan count, cycle count, domain-membership rate, evidence-linked rate)
- **Kind census** card — kind → glyph + bar + count, tallest bar highlighted
- **Domain capacity** card — domain → bar (capability/element sub-counts), hidden when there are no domains

#### Tab 3 — 연결 Connections
- **Relation breakdown** — every edge type as a bar row with a `TopologyV2TraceMark` (solid=containment, dashed=depends/relates) + count + percent of total; empty vault gets a "connect them in the workshop" hint
- **Hubs** — top nodes by degree: kind glyph + title + relative bar + degree, map deeplink per row, "top N / M total" folded into the single footnote line

#### Tab 4 — 경계 Boundaries
- **Domain coupling** — a domain×domain **heat grid** (rows send, columns receive; the diagonal is inside-one-domain connections in neutral). Cell shade is a 4-step indigo alpha ladder and every non-zero cell keeps its number, so the card never speaks in colour alone. Picking a cell opens that pair's relation-type counts and real example edges (map deeplinks) in a slot that is reserved whether or not anything is selected. Top 6 domains by cross activity; beyond that the footnote says "top N of M domains" and how many cross links fall outside the grid. Same `computeDomainCouplingMatrix` output as MCP `domain_matrix` — no new calculation.
- **Boundary pressure** — per-domain inside vs cross ratio; a high cross share signals a leaking boundary
- Cold start (fewer than 2 domains or no cross edges) shows one explicit empty state **with a next step** (workshop link) instead of a misleading table

#### Tab 5 — 신선도 Freshness
- **Domain freshness heatstrip** — one row per domain, a week-by-week heat strip (neutral ramp, current week in indigo) built from real vault `updatedAt` values (`FRESHNESS_WINDOW_WEEKS`); domains with no dated docs are excluded from the stale count rather than counted as stale ("unknown" ≠ "old"); stale domains get a dashed "stale" tag
- **Recent updates** — most recently touched nodes with kind glyph, domain, and ISO date; footer shows total stale-domain count

#### Bottom handoff row (`InsightsHandoffRow`, always visible)
- One copyable `query_ontology(...)` chain per active tab — the tab's question translated into the agent's execution order (연결 → `centrality` then `blast_radius`; 경계 → `domain_matrix` then `match_edges`)

Empty state (0 nodes): link to `/docs` (open vault).

---

### `/ontology/studio` — 공방 (Compass Stage), the vault write surface
- 노드의 **의미를 완성**하는 쓰기 표면. focal 노드를 중앙 hero 로 놓고, 관계 종류를 고정 방위에 못박는다 — 위=상위개념(is_a)·아래=담는것(contains)·오른쪽=기대는곳(depends)·왼쪽=비슷한것(relates). 레일 LNB "공방"에서 진입. **한 표면, 두 채움상태, 모드 탭 없음.**
- **강화(enhance)**: 기존 노드를 열어(`?node=<id>` 딥링크, 없으면 가장 연결 많은 역량 자동 선택) 빠진 관계를 채운다. 채워진 관계=실선 인디고 지지대 + 위성 카드, 빠진 관계=파선 **라인아트 소켓**(보석 아님). 하나만 "여기부터 채워요" 로 안내.
- **만들기(create, `?mode=create`)**: 같은 무대를 전부 빈 상태로 — kind/이름/도메인/정의 draft 카드 + 4방위 빈 소켓. 저장 예고는 새 노드 1개와 relation N개를 분리해 말한다. 근접중복은 기존 노드 열기/계속 만들기를 고를 수 있지만, 같은 kind·이름이 결정적 slug까지 충돌하면 기존 노드 열기만 남기고 저장·저장 예고·delta preview를 함께 막는다. 이름 input은 경고와 접근성으로 연결된다. 라이브 미리보기 포함.
- **진짜 쓰기**: 소켓을 채우면 실제 frontmatter 관계 배열에 쓴다(`localVault.updateFrontmatter`). 읽기 전용 vault 면 AI 에이전트 위임용 **MCP 명령 패킷**을 클립보드로. 인라인 앵커 피커에서 후보 선택 or "새로 만들기".
- **문서 없는 개념은 묻고 나서 실체화한다**: 볼트의 상당수 개념은 다른 문서의 관계 키에서 이름만 불린 파생 개념이라 자기 `.md` 가 없다(도그푸드 294 중 198). 관계는 개념에 속하므로 그런 개념에 이으려면 문서를 만들어야 하는데, 사용자 디스크의 파일 생성은 요청받은 적 없는 일이라 저장 순간 **만들 파일 경로까지 밝히고 한 번 묻는다**. 취소하면 파일 0개 변경(변경은 초안으로 남음), 확인하면 **기존 인용이 이미 가리키는 경로**에 관계를 실은 문서가 한 번의 쓰기로 생긴다. 종류를 특정할 수 없으면 지어내지 않고 사용자가 고른다. 읽기 전용 볼트면 `add_concept` 까지 포함한 MCP 패킷.
- **is_a 진짜 추가**: 상위개념(is_a)은 vault 최상위 갭이었다 — `broader`(SKOS) frontmatter 키로 파생·스키마(mcp/cli)·validator 까지 진짜 추가. 채우면 실선으로 닫힌다.
- **완성도**: 중앙 카드 4변 테두리(빈=파선·찬=실선) + 평문 캡션("4개 중 2개 채웠어요") + 좌상단 플로우 큐(미니 나침반). % 링·레벨·레어도 없음.
- **두 질문을 갈라 세운다 (2026-07-28)**: 칩 줄은 **스키마 종류**(프로젝트/도메인/역량/요소 넷 중 무엇), 위(↑) 소켓은 **`broader` 관계**(어느 개념의 하위인가) — 다른 사실 둘이다. 칩 줄에 한 단어 라벨(종류 / Kind)이 시각·`aria-labelledby` 둘 다로 서고, 영문 소켓 질문은 `What is this node a kind of?` 다(어순이 뒤집혀 있던 `What kind of thing is this node?` 를 정정 — 문자 그대로 "이 노드의 kind" 로 읽혔다).
- **1024px 미만은 정직하게 강등한다 (2026-07-28)**: 나침 무대는 고정 폭 카드 + 위성 기하라 좁은 화면에서 성립하지 않는다(설치 앱은 `minWidth 1040` 이라 이 폭이 아예 없고, 하단 탭바도 공방 탭을 뺐다). `<lg` 로 오는 딥링크 세 갈래(데이터시트 「관계 편집」·인사이트·문서함 frontmatter)는 이제 **왜**(가로 1024px 필요 · 창을 넓히면 바로 열림)와 **어디로**(지도 · 데스크톱 앱)를 함께 말하는 카드 한 장이 받는다. 무대는 렌더되지 않고, 없는 표면을 소개하는 첫 방문 안내도 그 위에서는 뜨지 않는다.
- **디자인**: 앱 전역과 동일한 **절제 헌장** — 무채색 + 단일 인디고 + `--color-*` 토큰. amber 는 "빈(강하게 기대되는) 소켓" 신호로만. **glow/gradient/gem/particle/gold 금지**(구 게임 예외는 2026-07-24 폐기). 모션은 소켓 채움 200ms opacity/color 하나, `prefers-reduced-motion` 정지. 평문 질문("이 노드는 무엇의 한 종류인가요?")으로 은어 0.

### `/ontology/edit` — RETIRED (2026-07-24) → redirects to `/ontology/studio`

The xyflow ERD canvas builder was removed once the 공방(Compass Stage,
`/ontology/studio`) covered node assembly (CREATE mode), relation connecting
(inline picker + real frontmatter writes), and live preview. `/ontology/edit`
is now a thin client redirect to `/ontology/studio` that forwards any `?node=`
deep-link (normalized to the canonical `<kind>:<slug>` id) into the workshop's
ENHANCE mode — old bookmarks and agent-handoff links land in the workshop, not a
404. The `@xyflow/react` dependency, the builder view, its keyboard shortcuts,
and the builder-only i18n strings were all removed. See `/ontology/studio`
above for the surviving write surface.


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

### `/project/[slug]/edit` — Full editor

`ProjectForm` in `mode="edit"` (640px centered form column + 260px companion column, RATIO-SYSTEM; 4 sections + sticky save bar). **Create and edit no longer share one layout** (2026-07-27) — see `/project/new` below.

1. **Basics** (always open) — slug (disabled in edit) · name · nameEn · category (taxonomy select) · status (taxonomy select)
2. **Story** (collapsible) — description (required) · detail (markdown) · tags CSV · stack CSV · linksText (multiline `label|URL`)
3. **Network** (collapsible) — dependencies picker with cycle check (suggestions from description/detail text)
4. **Operations** (collapsible) — startedAt · launchedAt (date order validated) · owner · icon · progress · `isHub` checkbox

Section labels are engraved (mono uppercase caption + hairline), matching the census styling used elsewhere in this wave.

#### Validation (`schema.ts`)
- slug: `/^[\p{L}\p{N}-]+$/u` (Unicode letters/numbers/hyphen)
- name + description required (min 1)
- linksText: each line `label|https://…`, http(s) only
- dates: ISO 8601 YYYY-MM-DD, `launchedAt >= startedAt`

#### Actions
- Save & continue · Save & return · Cancel (with dirty-state guard via `beforeunload` + router intercept)
- **Delete** (edit-only) — isolated in a single dashed-border danger row at the bottom of the form (2026-07-18; dashed border is the destructive-action category signal, matching the design system rule); no other delete affordance on this page
- Form nav pills jump to sections (edit only)
- Top sticky + bottom save bar (edit only — create has the bottom row only)

#### Companion column (260px, sidebar, collapsible <lg)
- Live preview `ProjectCard` · completeness % · public status · change summary (max 4 items)

#### Note
- `screenshots` field exists in schema but no uploader UI (markdown/vault assets only — codex Round 6 finding)

---

### `/project/new` — Create (restructured 2026-07-27)

Create is a **different screen from edit**, not the same one with fewer values. Creating asks for one thing — make a project — so the screen asks for exactly the four fields that make one, and nothing else is on top of them.

- **Four essential fields, first screen, no scroll** — name · category · status · short description. Measured at 1512×950: name at y=292, category/status at y=395, description at y=472, primary action at y=698; the whole screen fits without scrolling (also verified at 1024 and 768).
- **The document address (slug) is a caption, not a field.** It is derived from the name; "Set it myself" opens the real input inline (validation errors targeting it open it automatically).
- **Everything else is folded into "Fill in more"** — nameEn, detail, tags, stack, links, dependencies, dates, owner, icon, progress, hub flag. The user opens it; a validation error inside it opens it too.
- **Actions come after the form** — Create & continue / Create & return / Cancel. The old top save cluster is gone in create mode (it let you press "create" before seeing a single input); edit mode keeps its sticky bar.
- **One place teaches.** The four teaching surfaces that used to stack above the form (two tip cards on the page, one header help line, one "1-minute tip" disclosure) all said the same sentence and pushed the actual fields off screen. They are replaced by one subtitle line directly above the fields, plus per-field captions.
- `ProjectQuickCreatePanel` still exists as a component but is no longer surfaced from `/projects` (2026-07-18); this full form remains the canonical create path.

### `/project/fallback` — Static-export fallback

Used when a non-existent slug is hit in static export. Redirects or shows "not found" panel.

---

### `/download` — desktop app download (rebuilt 2026-07-18, Windows beta 2026-08-01)

RATIO-SYSTEM 1600px container / 960px centered utility column.

#### Header
- Back link · eyebrow · right-aligned "macOS · DMG · GitHub Release" caption · `LocaleSwitch`
- Title + subtitle · primary CTA (the Apple Silicon DMG once published, otherwise an honestly labelled link to GitHub Releases) + secondary CTA (view source on GitHub)

#### Engraved fact strip (repo facts that hold before any build exists)
- Version (`RELEASE_VERSION`, from `package.json`/`tauri.conf.json`) · format (DMG) · architecture · min macOS (`RELEASE_MIN_MACOS`) · channel
- Size and checksum are **not** here: they exist only once a build is published, so they live in the platform block and are read from the generated release facts

#### Platform block (macOS + Windows)
- **macOS** — published: one row per architecture with a direct download link, the real byte size, the DMG filename, and a copyable SHA-256. Unpublished: a single "not out yet" sentence, no placeholder facts
- **Windows** — unpublished: one honest beta-pending line. Published: one unsigned x64 NSIS installer CTA derived from its real release URL and byte size, with a warning immediately before it; GitHub Release carries the sibling SHA-256 asset. Native CI proves build/scan/install/launch/MCP behavior; Windows 11 SmartScreen UI remains unverified
- Source of truth: `src/views/download/model/macos-release.generated.ts`, written by `pnpm download:release-facts` from the real GitHub Release

#### "Includes" cards (3, sm+)
- Topology map · MCP server (tool count) · CLI (command count)

#### Install steps (4, numbered 01–04, sm+ 2-col grid)

#### Trust panel + changelog preview (2-col on lg+)
- **Trust panel** — "Developer ID signed" / "Notarized by Apple" / "checksums published" stated as facts about published builds (never as a gate that "requires" them) + a `spctl --assess --type open --context context:primary-signature ...` verify command built from the current version's DMG filename + the policy note that a build failing a gate is never published
- **Changelog preview** (`CHANGELOG_PREVIEW_ENTRIES`, sourced from `docs/CHANGELOG.md`) — version + a handful of recent entry titles + "as of DATE" caption

#### GitHub row + release-gate note + footer
- GitHub repo link row · the hosted-site scope note (the website never opens or edits vault folders) · footer (license / GitHub / stack)

---

### `/git` — 기록 (record destination, 작업대 재설계 2026-07-27)

**이 화면의 일 한 문장**: 바뀐 내 개념을 확인하고, 지금 걸음으로 남길지 정한다.
그래서 주목 승자는 **바뀐 개념 목록 + 남기기** 한 쌍이고, 나머지는 근거이거나
크롬 단 상태다.

모양은 **화면이 자기 일을 할 수 있는가**로 먼저 갈리고(`data-stage`), 할 수
있으면 **판단할 것이 있는가**로 다시 갈린다(`data-shape`).

#### 셋업 (`web` · `no-vault` · `not-initialized` · `loading` · `error`)
- 세 상태가 **같은 몸**(`--git-setup-measure` 520px 단일 기둥, 프레임 정중앙).
  걸음마다 폭이 달라지면 매번 다른 페이지로 튕긴 것처럼 읽힌다
- 연결 사다리 한 줄(앱에서 열기 · 폴더 고르기 · 기록 시작) — 원격 등록은 선택
  이라 걸음이 아니다. 크롬 0, 커넥터 0
- 브라우저에서는 `앱 받기` 가 주 버튼, 터미널(CLI 복사)은 보조 탈출구

#### 작업대 · `decide` (남기지 않은 변경 있음)
- 좌: 상태별 합계 한 줄 → **kind 로 묶인 항목 행**(상태 글리프 `+ ~ − →` ·
  자리/이름 위계 · 줄 증감). 행을 누르면 그 문서의 바뀐 줄이 우측에 온다
- 개념이 아닌 파일(`.gitignore` 등)은 **기본 접힘** — 함께 남지만 판단 대상이
  아니다. 접힌 줄이 개수를 말한다(숨기는 게 아니다)
- 하단 도크: 채운 인디고 `N개 남기기` → 확인 스텝(실제 커밋 한 줄 미리보기 +
  보내기 opt-in, 기본 off) · 기록 범위 고지가 여기 있다(쓰기가 일어나는 자리)
- 우: 증거 열 — `바뀐 줄`(git 배관을 걷어낸 파일별 +/− 줄) / `지난 걸음`.
  **보여줄 것이 있을 때만 렌더한다**
- 2열 게이트는 `xl`(1280) — 1024 에서 켜면 목록이 눌려 개념 이름이 잘린다

#### 작업대 · `recall` (모두 남겼음)
- 열을 만들지 않는다. **지난 걸음이 본문**인 단일 기둥(`--git-single-measure`)
- 걸음 행: 상대 시각 · 평문 요약(`추가 3 · 수정 2`) · 이름 · 짧은 해시.
  펼치면 전체 해시 · ISO 시각 · **커밋 제목 원문**(감사 흔적)
- 주 동작 자리는 비활성으로 남는다(`모두 남겼어요`) — 동사의 집이 상태에 따라
  없어지면 다음에 어디를 볼지 매번 다시 배워야 한다

#### 평문 계약
- 우리가 만든 커밋 제목(`ontology snapshot: +3 concepts, …`)은 화면에서 사람
  말로 되읽는다. 손으로 쓴 커밋과 다른 도구의 커밋은 원문이 곧 사람의 말이라
  건드리지 않는다 (`describeSnapshotSubject`)
- `diff --git` · `index <sha>..<sha>` · `@@ -a,b +c,d @@` 는 화면에 오지 않는다.
  단, 생략된 구간은 파선 한 줄로 **남는다** — 생략을 숨기면 diff 가 거짓말이 된다

#### 신뢰 헌장
마운트 시 호출은 읽기 전용(`git_status`/`git_diff`/`git_history`)뿐.
`git_init` · `git_set_remote` · `git_snapshot` 은 각 버튼의 onClick 에서만.

---

## 3. MCP server (33 tools)

AI agents read/write the same vault as humans. Two ways to get the server running, and only two:

| Channel | How the agent starts it | What the user does |
|---|---|---|
| **Installed desktop app** (primary; macOS 2026-07-27, Windows beta 2026-08-01) | The app ships a compiled MCP server inside its own bundle (`Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp` on macOS, `ontology-atlas-mcp.exe` beside the Windows executable). The agent client spawns that binary directly, so it keeps serving while the app is closed. | Open the vault folder in the app and press **에이전트 연결 / Connect agent**. The app writes `.mcp.json` / `.codex/config.toml` with the bundled binary's absolute path and the vault's real path already filled in — no terminal, no Node, no install step. |
| **Source checkout** (fallback) | `node <checkout>/mcp/src/index.js` with `OATLAS_VAULT` set. | Clone the repo, then either paste the config or let `node <checkout>/cli/src/index.mjs init` / `agent-setup --write` write it. |

npm publishing is retired (`docs/DECISIONS.md`, 2026-07-27) — there is no `npx` channel.

**R14 — workflow automation** (Claude Code + Codex):

| Trigger | What | Where |
|---|---|---|
| **SessionStart hook** (implicit) | Compact vault census auto-injected into agent context on session start: total nodes, kind distribution, and only an actionable drift warning when needed. The hook deliberately avoids domains, hub lists, and full node tables to keep token use low. | `.claude/hooks/inject-ontology-summary.sh` / `.codex/hooks/inject-ontology-summary.sh` — silent in repos without a vault |
| **Explicit live activity CLI** | Agents or humans can still publish `.ontology-atlas/agent-activity.json` through `ontology-atlas agent-activity` when a handoff needs it. The automatic PreToolUse heartbeat hooks were removed during the token-budget pass; routine shell commands no longer update the sidecar implicitly. | `cli/src/commands/agent-activity.mjs` · `src/features/docs-vault-local/model/agent-activity-status.ts` |
| **`/ontology-bootstrap` skill** (cold start) | Empty vault → evidence-earned first graph from code structure. `analyze_repo_structure` side-effect-zero → typed competency answers retain resolved witnesses and honest gaps → user picks candidates → land via batch writers. Node count is an observation, never a target or cap. | `.claude/skills/ontology-bootstrap/SKILL.md` / `.agents/skills/ontology-bootstrap/SKILL.md` |
| **`/ontology-sync` skill** (code change) | "I'm done with this task — please sync the ontology now" loop. git diff + context → MCP write tools | `.claude/skills/ontology-sync/SKILL.md` / `.agents/skills/ontology-sync/SKILL.md` |
| **`/ontology-extract` skill** (prose ingress, R+) | User shares prose (meeting note / PR / RFC / Notion paragraph) → `find_evidence` + `similar_nodes` cross-check → candidate table → user picks → land. LLM hallucination guard via prose-source citation in body | `.claude/skills/ontology-extract/SKILL.md` / `.agents/skills/ontology-extract/SKILL.md` |
| **`/ontology-absorb-confluence` skill** (wiki ingress, agent-mediated) | User already has a third-party wiki MCP (e.g. Atlassian's official Confluence MCP) registered in the session. That MCP reads the page (read-only); this skill feeds the returned markdown into the existing `absorb_document` tool (dry-run → user approval → `confirm:true`), then cites the source page URL in each landed node's body. Not a Confluence integration this repo ships — an *agent-mediated* path that reuses Slice 0's absorption pipeline for any structured wiki export (Confluence, Notion, on-prem wikis) once the user has wired the read side themselves. | `.claude/skills/ontology-absorb-confluence/SKILL.md` / `.agents/skills/ontology-absorb-confluence/SKILL.md` |
| **Agent config scaffold** | CLI `init` and the installed app starter write ready-to-use `.mcp.json` and `.codex/config.toml` files into the vault folder, so opening that folder in Claude Code / Cursor / Codex is enough to attach MCP. The empty-vault CTA previews the agent verification path before creation, both empty and existing-vault CTAs include a copyable prompt for Claude Code/Codex that falls back to the CLI setup gate when MCP is unavailable, CLI proof packet, and automation JSON gate, the Workspace palette exposes the same prompt whenever a local vault is loaded, and the local vault tools menu shows whether `.mcp.json`, `.codex/config.toml`, and `.mcp.json.example` are present, summarizes how many setup files are ready, names the next missing or invalid config, shows a three-step non-developer checklist (config files → agent restart → JSON gate before edits), and offers a repair action that creates only missing agent config files plus grouped copy buttons for a complete setup packet (preferred `agent-setup <vault> --root <codebase> --write` repair command + MCP/Codex templates + restart guidance + verification prompt + CLI fallback + automation JSON gate), the same read-first verification prompt (this whole setup panel is now the `VaultAgentSetupPanel` merged into **App Settings → MCP/Agents**, B2 2026-07 — the old docs-header vault tools dropdown was retired to remove the duplicate surface; the local vault picker moved to **App Settings → Workspace**), matching installed-CLI graph runbook (`validate` → `workspace-brief` → `agent-brief --prompt` → `agent-brief --graph-db-pack` → `agent-brief --verify-fallbacks` → `cycles` → `growth` → `maintenance` → `hubs --plan` → `hubs` → `mcp-verify`), a separate one-click automation gate (`agent-brief --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`) with visible command preview, the visible first-contact proof contract (`config_state` → `mcp_verify` → `json_gate` → `graph_briefs`), a separate codebase-root `agent-setup` repair command copy button, codebase-root `.mcp.json.example` template, codebase-root Codex `.codex/config.toml` template, and a one-line `codex mcp add ...` command for users who prefer Codex CLI registration; the starter README gives the same first-contact verification loop plus the `agent-setup /absolute/path/to/this-vault --root . --write` existing-vault repair path before any agent edit. `agent-setup --json` includes `docs.modeComparison` for the CLI-only, MCP-connected, graph DB pack, and setup gate modes, so AI tools can explain the right setup path without scraping Markdown. `agent-brief --verify-fallbacks` runs fallback commands through a bounded parallel queue, prints a human setup-gate line (`ok`, `performanceOk`, wall time, slow count, failed count) before per-command elapsed time plus the slowest fallback, and `agent-brief --verify-fallbacks --json` emits the same check as a compact machine-readable timing report for Claude Code/Codex automation with output samples only on failed rows, so local graph query latency is visible without flooding connector-less setup checks. Each fallback command has a 15s default timeout, configurable with `--fallback-timeout-ms N` or `OATLAS_AGENT_FALLBACK_TIMEOUT_MS=N`, and timeout rows report `timedOut:true` for fail-closed setup automation. Passing-but-slow rows are counted under `slow`, marked with `slow:true`, and summarized by `performanceOk:false` when they exceed the 5s default `slowThresholdMs`, tunable with `--fallback-slow-ms N` or `OATLAS_AGENT_FALLBACK_SLOW_MS=N`; fallback concurrency defaults to 4 and is tunable with `--fallback-concurrency N` or `OATLAS_AGENT_FALLBACK_CONCURRENCY=N`, so automation can distinguish broken setup from local graph latency drift without making the setup gate unnecessarily slow. Root-level CLI init writes matching cwd configs for codebase-root sessions. | `cli/src/index.mjs` · `src/features/docs-vault-local/lib/ontology-starter.ts` · `src/features/docs-vault-local/model/use-local-vault.ts` · `src/widgets/app-settings-menu/ui/VaultAgentSetupPanel.tsx` · `src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx` · `src/views/docs-vault/ui/DocsVaultPage.tsx` |
| **10-minute memory loop smoke** | Fresh repo `init -> bootstrap -> validate -> workspace_brief -> agent_brief -> node_profile -> sync proposal` path is executable as a release-readiness gate, including git diff alignment before any side-effecting sync write. | `scripts/smoke-memory-loop.mjs` · `pnpm smoke:memory-loop` |
| **`mcp__ontology-atlas__*` `instructions` field** (R13 v0.7.1) | Server's initialize response carries kind hierarchy, first-time workflow, write safety patterns — every connecting agent gets the discipline without trial-and-error | `mcp/src/index.js` |
| **`.ontology-atlasignore`** (R+) | Vault-root gitignore-style file. Patterns match `materialize_external_element` refs in `growth_plan` / `maintenance_plan` and skip them. Intentional external code (e.g. `src/**`, `cli/**`) stops surfacing as noise. `externalElementRefsIgnored` count exposed for transparency | `docs/ontology/.ontology-atlasignore` (dogfood example) · `mcp/src/ontology-atlas-ignore.mjs` |

R14 also unified `add_concept` / CLI `add` / CLI `import` to a single per-kind frontmatter schema (`mcp/src/schema.mjs` ↔ `cli/src/lib/schema.mjs`) — three entry points, one shape.

#### Prose / wiki absorption

Three ingress paths land the same vault, differing only by input source and
approval granularity — none of them let an agent write unreviewed nodes:

| Input | Path | Approval unit |
|---|---|---|
| Pasted prose (meeting note / PR / RFC paragraph) | `/ontology-extract` skill — `find_evidence` + `similar_nodes` cross-check → candidate table | Per candidate node/edge |
| Local CLAUDE.md/AGENTS.md-style file | `absorb_document` MCP tool / CLI `ontology-atlas absorb` — splits by `##` section, classifies policy vs. architecture, Tier 1 injection filter. MCP canonical paths outside `repoRoot` (including symlink escapes) need explicit `allowOutsideRepo:true` after preview | Per section (dry-run first, `confirm:true` to write) |
| Confluence/Notion/wiki page, via a third-party wiki MCP the user already registered (e.g. Atlassian's official Confluence MCP) | `/ontology-absorb-confluence` skill — that MCP reads the page (read-only), the returned markdown is fed into the same `absorb_document` pipeline, and the source page URL is cited in each landed node's body | Per section (dry-run first, `confirm:true` to write) |

The wiki path works identically for on-premise Confluence/wiki instances — the
absorption tool only ever reads a local markdown file; whatever gets it there
(cloud MCP, on-prem export, `curl` to a file) is out of scope for this repo.
This project does not ship a Confluence integration; it ships an absorption
pipeline that a second, user-owned MCP can feed.

### Interop — export to a standard graph format

Data flows *out* the same way it flows in: as portable files, no backend. The
CLI `ontology-atlas export [vault] --format jsonld|graphml|json` compiles the
vault (the deterministic `compile_ontology` artifact) and writes a standard
interchange format to stdout (status to stderr, so it pipes cleanly):

- `jsonld` — RDF 1.1 JSON-LD; loads in rdflib / Protégé / any triplestore
  (`g.parse('atlas.jsonld', format='json-ld')`).
- `graphml` — XML graph; opens in Gephi / Cytoscape, loads via NetworkX
  (`nx.read_graphml`) or Neo4j APOC (`apoc.import.graphml`).
- `json` — the raw compile artifact unchanged (nodes/edges/`graphHash`).

The CLI `export` command emits JSON-LD/GraphML from this *same* serializer, kept
byte-identical by a contract test. (The web ERD builder that also consumed it was
retired 2026-07-24 with the rest of `/ontology/edit`.) Node identity is the stable URN
`urn:ontology-atlas:<kind>:<slug>` (both the JSON-LD `@id` and the GraphML node
id). Contract: **an export is a snapshot**, the compiler `graphHash` is its
**version**, a `rename_concept` mints a *new* URN and does not rewrite URNs
already emitted into a prior snapshot, and external/dangling refs are omitted
(never phantom nodes). Full loading recipes live in `mcp/README.md` → *Interop*.
Read-only MCP registration for external read consumers: set `OATLAS_READ_ONLY=1`
(tools/list drops the 14 write tools; write calls are rejected).

Staying file-only here is deliberate and matches the Obsidian precedent
(files + offline core, servers behind an opt-in localhost plugin). A live HTTP
transport is out of scope until two concrete external-tool requests prove that
file export + the local stdio MCP genuinely can't serve them.

**R14 — vault live updates** (`/topology` + all pages):

- **Adaptive polling** (visible-only) — `useLocalVault` fingerprint check while the tab is visible; bursts to ~1.5s right after a detected change and decays to ~5s when idle, so agent / CLI writes surface fast without idle churn (generation-token poller avoids orphaned timers across hide/show)
- **Graph diff pulse** — newly appearing slugs amber-pulse for 5s on `/topology`
- **Toasts** — `Added: <slug>` (info) / `Edited: <slug>` (success, mtime change) on every page
- **Save-conflict guard** — if a file changed on disk between read and write, `/docs` editor save surfaces a localized conflict notice and keeps the buffer dirty instead of silently overwriting unsaved edits
- Effect: IDE / AI agent / CLI 변경이 웹 탭 *focus 안 해도* ~1.5–5s 안에 그래프 + toast.

#### Read tools (19)
1. **connection_info** — active vault/repo roots plus the actually advertised `readOnly`, `toolCount`, `toolNames`, and `toolsetHash`; explicit `OATLAS_REPO_ROOT` wins, otherwise repo root is auto-discovered from the active vault's Git top-level before falling back to process cwd
2. **git_status** — vault-scoped working-tree state and risk; no writes or remote transport
3. **git_history** `{ limit? }` — newest-first commits that touched the active vault pathspec only (default 20, max 100), with `limited` / `hasMore`, shallow-repository state, and `historyComplete` so truncated evidence is not mistaken for complete history
4. **list_concepts** `{ kind?, domain?, since?, summary?, limit? }` — every node, optional filters, mtime, and summary preview
5. **get_concept** `{ slug }` — full detail: frontmatter + prose excerpt + graph neighbors / `outgoingEdges[]` + `mtime` (ms; **R11** caller가 후속 patch/delete 의 `expected_mtime` 으로 전달하면 외부 변경 감지); warnings include frontmatter issues and dangling outgoing graph references
6. **get_concepts** `{ slugs }` — batch read (max 50), order-preserving partial results with the same per-node warnings
7. **find_evidence** `{ title }` — partial-match across title / capabilities / elements / body, with `domain`, `mtime`, and prose excerpt
8. **find_backlinks** `{ slug }` — every node referencing target (frontmatter arrays + wikilinks/markdown)
9. **find_neighbors** `{ slug, direction?, types?, includeNodes?, limit? }` — one-hop local graph around a node, with canonical incoming/outgoing `edges[]` and neighbor summaries (`includeNodes` defaults true, `limit` defaults 100/max 500); public relation type aliases like `depends_on` are normalized to stored graph keys
10. **find_path** `{ from, to, maxHops? }` — shortest undirected BFS across graph frontmatter, including `domains` / `domain` containment (default 5 hops, includes aligned `nodes[]` summaries plus `edges[via]`)
11. **list_kinds** — vault kind census `{ total, byKind: { capability: N, … } }`
12. **find_orphans** `{ kind?, excludeKinds? }` — isolated nodes across graph frontmatter, including `domains` / `domain` containment (defaults exclude `project` and `vault-readme`; pass `excludeKinds: []` to include every kind)
13. **query_concepts** `{ filter, limit? }` — typed filter DSL with AND/OR/NOT on `kind` / `domain` / `slug` / `title` / `has(arrayKey)`
14. **compile_ontology** `{ includeIndexes?, summary?, nodesLimit?, nodesOffset?, edgesLimit?, edgesOffset? }` — deterministic graph artifact with canonical `nodes[]`, `edges[]`, aliases, issues, graph-array canonicalization actions, stable semantic `graphHash`, `maxMtime`, optional query indexes, cheap `summary:true` polling, and node/edge pagination for large vaults
15. **query_ontology** `{ operation, ... }` — graph-engine query over the compiled artifact (`neighbors`, `path` with aligned `nodes[]`, `all_paths` with per-path `nodes[]` plus `limit` / `searchBudget` / `exhaustive` / `truncatedByBudget` / `totalPathsExact` metadata and `evidence` guidance, `query_plan` with executable run/narrow advice, filter-preserving `suggestedQuery`, and filter-aware `estimate.totalMatches` for `match_nodes` / `match_edges`, `centrality`, `communities`, `similar_nodes`, `explain_relation`, `reachability`, `pattern_walk`, `impact`, `blast_radius`, `subgraph`, `builder_context`, `overview`, `schema`, `facets`, `match_nodes`, `match_edges`, `node_profile`, `domain_profile`, `domain_matrix`, `project_scope`, `project_map`, `relation_check`, `components`, `lineage`, `containment_tree`, `cycles`, `topological_order`, `recommend_relations`, `growth_plan`, `maintenance_plan`, `agent_brief`, `workspace_brief`, `health`) for graph-database-like answers without pulling the full compile payload. `builder_context` keeps its compatibility operation/response name but emits the current Workshop focus URL, persisted bounded neighborhood, `canvasPosition`, `expected_mtime`, and safe low-level write handoff while declaring that unsaved UI drafts are not included. Repeated read calls inside one MCP server session reuse the compiled artifact while the vault document signature is unchanged, so first-contact agent run orders do not pay the full compile cost for every graph query. `match_nodes` returns a `followUp` packet for the first returned row with ready-to-run `node_profile`, incoming/outgoing `match_edges`, and `blast_radius` MCP calls plus CLI fallback commands, so a graph scan can become focused evidence without another round of tool-selection guesswork. `match_edges` returns a `followUp` packet for the first returned real edge with ready-to-run `explain_relation`, `path`, and `relation_check` MCP calls plus CLI fallback commands, so edge scans move directly into evidence and write-preflight instead of being treated as raw proof. `match_edges.filters`, `match_edges.edges[].relationType`, `followUp.focusEdge.relationType`, and `query_plan(match_edges).normalized` expose public names such as `depends_on` next to canonical frontmatter `types` or `via` values such as `dependencies`, so terminal and MCP clients can show the relation name users typed while keeping executable graph keys. `node_profile.edges.incoming/outgoing.byRelationType` and edge `relationType` expose public names such as `depends_on` for node detail views; `domain_matrix.filters.relationTypes`, `connections.rows[].byRelationType`, and connection examples do the same for coupling views, while canonical `types`, `via`, and `byRelation` stay available for graph-key callers. The UI semantic coupling matrix and CLI node deep dive can be rerun from Claude Code, Codex, or terminal fallbacks with the same user-facing names. `agent_brief` returns Claude Code/Codex handoff readiness, a copyable `handoffPrompt` (also printable via `ontology-atlas agent-brief --prompt`), graph entrypoints, first MCP calls, structured `graphDbQueryPack` (`facets` / `schema` / `query_plan(match_nodes)` / `match_nodes` / `query_plan(match_edges)` / `match_edges` / `domain_matrix` / `query_plan(centrality)` / `centrality` / `query_plan(all_paths)` / `all_paths` / `explain_relation` / `business_questions` outcome, domain-boundary, capability-claim, and implementation-evidence scans), investigation playbooks including `graph_traversal` (`schema` → `query_plan(all_paths)` → `all_paths` → `pattern_walk` / `project_map`), `traversalStrategy` (`plan_before_enumeration` → `bounded_path_evidence` → `containment_cross_check`) for plan-first bounded traversal, per-playbook `evidence[]` and `stopWhen[]` checklists, write guardrails for `add_relation` / rename-merge / post-change sync, relation preflight before `add_relation`, a `relationDecisionGuide` for the `skip_existing` / `review_inverse` / `safe_to_add` / `review_new_schema` outcomes, `resultContracts` requiring `all_paths` callers to report completeness fields and requiring `match_nodes` / `match_edges` callers to report `totalMatches`, `limited`, and `followUp` details before treating scan rows as evidence, and read-first write policy. The CLI companion `ontology-atlas agent-brief [vault] --graph-db-pack` turns that pack into a shell-pasteable graph scan script for sessions without MCP. `relation_check` validates relation `type` before endpoint slug resolution, so relation typos such as `depend_on` still return nearest-value hints even in empty or project-less vaults, and returns `matchingEdges`, reverse-direction `inverseEdges`, and a recommendation decision (`skip_existing`, `review_inverse`, `safe_to_add`, or `review_new_schema`) before exposing an `add_relation` `proposedAction`. `maintenance_plan` actions include stable `id`, cursor resume via `afterActionId`, explicit `cursor.reason` metadata, executable graph-array canonicalization, count-safe summary fields, `byPhase` / `bySeverity` / `byKind` remaining-queue buckets, `executable`, current-page `nextExecutableAction`, current-page `nextReviewAction`, plus `executableOnly` / `phases` / `severities` / `kinds` filters; ready pages report `cursor.found=true` with `cursor.reason=null`, while unknown cursors return an empty page with `cursor.found=false`, zero remaining actions, and no next actions. `phases`, `severities`, and `kinds` are enum-validated so typoed work-queue filters fail instead of returning an empty plan.
16. **validate_vault** — whole-vault health check with per-file issues and grouped summary, including schema-bound 8 issue codes for non-canonical graph arrays and dangling graph references
17. **analyze_repo_structure** `{ rootPath?, maxDepth?, ignore?, proposal? }` — side-effect-free bootstrap candidates from package / README / source layout. A second call can preflight a complete project/domain/capability/element/relation proposal. Its five typed competency answers carry `answered` / `partial` / `visible-gap` status plus concept, relation, evidence, and path witnesses: unsupported `answered` claims fail closed, while honest gaps remain visible in findings, quality gates, the deterministic write plan, and the project document body. `canWrite:true` therefore means the submitted graph is writable, not that every competency is settled. A root Rust package `Cargo.toml` contributes one bounded `package-contract` semantic-evidence row from allowlisted `[package]` and `[features]` fields; it never creates manifest/feature nodes, and unsafe, oversized, malformed, or virtual-workspace-only manifests are reported as skipped.
18. **infer_imports** `{ rootPath?, sourceFolders?, ignore?, maxFiles? }` — side-effect-free TS/JS import graph → file/module dependency edge candidates. Use after `analyze_repo_structure` to pull real `depends_on` candidates from code rather than only layout heuristics; the agent reviews `moduleEdges` with `count` + `kindCounts` and lands accepted edges via `add_relation` / `add_relations`, so the vault is not modified by analysis. Unresolved import `reason` is schema-bound to `empty`, `relative-not-found`, or `alias-not-found`; `kindCounts` is schema-bound to positive integer `static`, `dynamic`, `require`, `reexport`, and `side` keys. Resolves relative imports, `tsconfig.json` paths, and fallback common `@/*` aliases when the target exists; `maxFiles` defaults to 5000 and caps at 50000 to stop pathological monorepo walks.
19. **index_project** `{ rootPath?, maxFiles?, threshold?, skipImports? }` — side-effect-free project indexing checkpoint that combines repo structure analysis, import-edge indexing, and vault validation. `plan.conceptDelta` separates raw candidates into existing, ambiguous-alias review, and genuinely new buckets, and `next.reviewCalls` gives exact calls for retrieving full rows before applying anything.

For `agent_brief`, structural readiness is not meaning confidence. A fresh call
for an explicit project derives `meaningAssessment:v1` from three independent
dimensions: the current graph structure, the versioned competency receipt and
its typed witness inventory, and project-source provenance/currentness. The
overall result is categorical (`verified_current`, `needs_evidence`,
`review_required`, or `invalid`); Atlas emits no combined score or percentage
that could hide a stale source or unresolved witness.

`query_ontology({operation:"cycles"})` returns each cycle as the canonical slug
path plus aligned `nodeSummaries[]`, so dependency-cycle diagnostics are readable
without extra node lookups.

#### Write tools (14)

All destructive dry-runs (`git_snapshot`, relation remove/replace,
rename/reclassify/merge/delete, and absorb) expose the same agent decision
contract: `previewReady`, `canConfirm`, `wouldChange`, and
`blockedReasons[]`. Tool-specific legacy `ok` is not the confirmation signal.

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
9. **remove_relation** `{ from, to, type, confirm?, expected_mtime? }` — one exact typed relation and its rationale, dry-run first; an absent relation is an explicit no-op blocker
10. **replace_relation** `{ from, oldTo, oldType, newTo, newType, why?, confirm?, expected_mtime? }` — relation target/type/rationale replacement in one source-file write
11. **reclassify_concept** `{ slug, newKind, newSlug?, domain?, body?, confirm?, expected_mtime? }` — kind/slug/domain transition with backlink redirect and generated-starter handling
12. **absorb_document** `{ filePath, confirm?, allowOutsideRepo? }` — classifies a local agent-instruction document, writes accepted policy nodes, backs up the source, then rewrites it as a slim pointer. Canonical paths outside `repoRoot`, including symlink escapes, are blocked until a reviewed dry-run is repeated with `allowOutsideRepo:true`
13. **git_snapshot** `{ confirm?, expectedHead?, message? }` — validates and commits only the active vault pathspec locally; blocks stale HEAD, detached HEAD, Git operations in progress, and validator errors; never pushes
14. **finalize_project_meaning** `{ projectSlug, expected_mtime }` — post-write finalization for one explicit project. It reads the five competency answers from the current project Markdown; after current vault validation and a complete project scope, it resolves every typed witness against the current graph/source inventory and stores a versioned receipt with optimistic-concurrency protection. It stores no raw answers or private source coordinates. `ok: true` means the receipt write succeeded, not that the ontology or source is verified; callers read the returned categorical `meaningAssessment` or a fresh explicit-project `agent_brief`.

---

## 4. Cross-cutting UI

**feat/rail-rollout** collapsed the old 3-tier nav (`OperationsNav` top tabs +
`OntologySubNav` inline sub-tabs + `BottomTabBar`) into one ownership model: a
persistent left rail on desktop and `BottomTabBar` on mobile. They share the
same active-destination resolver while exposing inventories appropriate to
their viewport. `OperationsNav` and `OntologySubNav` are retired (deleted, not
just unmounted).

### `AppNavRail` (desktop, `lg:` and up — left side, on every page)
- 6 destinations: Map (`/`, `/topology`) · Docs (`/docs`) · Workshop
  (`/ontology/studio`, 공방 / Compass Stage) · Insights
  (`/ontology/insights`) · Projects (`/projects` or `/project/*`) · Git
  (`/git`)
- Bottom of rail: agent-activity status tile + `settingsSlot`. `AppShell`
  supplies the app-wide settings trigger by default; a page can override the
  slot for a surface-specific control.
- Active-item detection: shared `resolveActiveNavDestination`
  (`src/shared/lib/nav-destination.ts`) — `BottomTabBar` uses the same semantic
  resolver, so a route has one destination even when mobile intentionally
  omits its button.

### `AppSettingsMenu` (app shell + contextual page headers)
- The old 5-tab settings modal is now one compact settings sheet
  (`src/widgets/app-settings-menu`): screen controls, workspace, and the AI
  agent entry are scanned in one column. `LocaleSwitch` is an immediate screen
  control; the long MCP connection proof stays behind the AI agent drill-in.
- **AI 연결** (`AiConnectionPanel`, 2026-07-26) — a second drill-in row for
  your own API key: store it in the operating-system credential store (desktop only), check the
  connection with a request that carries **0 vault characters**, and read the
  tail of `.ontology-atlas/llm-audit.jsonl` where every call is recorded. The
  key is written once and never readable back (only its last 4 characters);
  the Rust side refuses to send at all when the audit line cannot be appended
  (log-before-send). In the browser the key field is not rendered — the card
  explains why storage is desktop-only and links to `/download`. There is no
  chat surface: the panel says in plain words that asking your vault is still
  being shaped.
  - **Named vendors: Anthropic · OpenAI · Google Gemini — frozen at three.**
    All three share one concept (paste a key → OS credential store → last 4 → check), so
    the third costs the reader nothing new. A fourth is admitted only when it
    both (a) uses an auth protocol that a Bearer-compatible arm cannot absorb
    and (b) has demand evidence; every other vendor is meant for the
    user-typed-address arm, which ships together with the feature that
    consumes it. Gemini authenticates through the `x-goog-api-key` header —
    never the documented `?key=` query form, because a URL is a place that
    gets logged.
  - **주소로 연결 — 로컬/오픈소스 러너 (2026-08-01).** 명명 벤더 아래 네
    번째 행은 벤더가 아니라 **문**이다: 러너 주소(기본 `http://localhost:11434`)
    를 적고 [연결 확인] 을 누르면 그 한 번의 요청이 「살아 있나 · OpenAI 호환
    인가 · 어떤 모델을 고를 수 있나」 셋을 함께 답하고, 설치된 모델이 목록으로
    와서 **고르는 것만** 하면 된다(이름을 타이핑하지 않으므로 오타로 실패할
    자리가 없다). 키는 필요 없다 — 이 갈래는 키체인을 지나가지 않는다.
    Ollama · LM Studio · llama.cpp server · vLLM 이 같은 문으로 들어온다
    (엔드포인트는 OpenAI 호환 `/v1/*`; 네이티브 API 를 골랐다면 러너마다
    어댑터가 하나씩 늘었을 것이다).
    - **실패는 이유별로 다른 문장을 받는다** — 러너가 꺼져 있음(연결 자체
      실패) · 그 포트에 다른 프로그램(404) · 설치된 모델 0개가 서로 구별되고,
      각각 다음에 할 일을 함께 적는다.
    - **평문 `http` 는 이 컴퓨터(loopback)에서만.** 밖으로 나가려면 `https`
      이고, 주소에 아이디·비밀번호를 담으면 거절한다(URL 은 기록에 남는
      자리다).
    - **전송 범위 문구가 참인 자리에서만 강한 말을 한다.** 루프백이면
      "이 컴퓨터 밖으로 나가지 않고, 기록에도 목적지가 `localhost:11434` 로
      남아요 — 그게 나가지 않았다는 증거예요"; 사용자가 https 로 다른 기계를
      가리키면 그 문장 대신 "이 주소는 이 컴퓨터 밖" 이라고 쓴다.
    - 웹에서는 이 갈래도 안 된다(브라우저 페이지가 localhost 로 못 간다) —
      강등 카드가 키 보관과 **따로** 그 이유를 적고 `/download` 로 보낸다.
  - **Every recorded call names its destination host.** The audit line carries
    `host` (e.g. `generativelanguage.googleapis.com`), and the screen states
    that host before you press check — the strongest claim we can prove for a
    named vendor is "it only goes to the official address compiled into the
    code". `host` was added without bumping the schema `v`, so lines written
    before it exist read back fine with a `null` destination.
  - Unregistered vendors collapse to a one-line `name · [Add key]` row that
    expands in place, one at a time — three always-open password fields would
    turn a settings sheet into a form gate.
- The persistent shell mounts the rail settings trigger. Contextual
  `LiveActivityIndicator` and header controls remain on the pages whose
  workflow needs richer status or screen controls; they are not additional
  navigation destinations.

### `BottomTabBar` (mobile only, `lg:` hidden)
- 4 core destinations: Map · Docs · Insights · Projects. Workshop is the
  immersive desktop write surface, Git is a desktop workbench, and the retired
  ERD builder tab was removed 2026-07-24.
- Min height 56 px (safe-area)
- Hidden only on the standalone `/download/` surface. Root is the Topology hub
  even without a loaded vault, so mobile first-run users keep global
  navigation.

### Search palettes (separate by design — R5 skip merge)
- **`⌘K` `SearchPalette`** — projects-focused fuzzy search + top vault docs match (3) + recent (5) + Layer filter (All / Hub / Node)
- **`⇧⌘K` `MountedGlobalSearch`** — ontology nodes + projects unified (`cmdk`-based, kind/project filter chips, virtualized)
- Both palettes share keyboard: `↑↓` navigate · `↵` select · `Esc` close

### `ShortcutSheet` (`?` to open)
- 10 sections grouped: navigation · topology · search palette · hub rail · workspace palette · workspace graph · workspace files · workspace actions · tour · portfolio
- 2-column grid on sm+, focus trap, `Esc` closes

### `LocaleSwitch`
- Two-button toggle EN / KO
- Replaces only the locale prefix while preserving the raw query and hash,
  including duplicate-key order and existing encoding. Uses
  `router.replace(..., {scroll: false})`, so changing the language does not add
  browser history or reset URL-addressed task state such as the selected
  Insights tab.
- localStorage `ontology-atlas:locale`

### `ThemeToggle`
- Moon / Sun icon toggle
- SSR-safe (mount-state placeholder until first useEffect)
- `html[data-theme]` attribute

---

## 5. Keyboard shortcuts (consolidated)

| Key | Surface | Action |
|---|---|---|
| `⌘K` / `⇧⌘K` | Home / Topology | Unified node + project search |
| `D` | Home / Topology | Toggle docs drawer |
| `?` | Home / Topology | Toggle shortcut sheet |
| `⌘O` | Home / Topology static sample | Open a local Markdown folder |
| `Esc` | All | Close the highest-priority open dialog, picker, preview, or map state |
| `Enter` | Workshop relation picker | Choose the first filtered relation candidate |
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
- **Agent-loop vault freshness (R+)** — CLI `preflight` 신규: git staged 파일을 vault `path:`/`elements:` frontmatter로 역매칭해 이 커밋이 닿는 노드의 blast-radius 요약을 커밋 *전에* 보여준다(정보 제공 전용, 항상 exit 0, 매치 0건이면 조용히 skip). `agent-setup --install-pre-commit-hook`로 pre-commit hook 설치(기존 hook 있으면 append, idempotent, `--no-verify` 우회 그대로 존중). `.github/workflows/vault-freshness.yml`(재사용 가능한 workflow, 이 repo 자체 PR에도 적용): PR 변경 파일 중 vault 노드가 참조하는 소스가 바뀌었는데 그 노드의 `.md`는 이번 PR에서 안 바뀐 경우를 `scripts/vault-freshness-drift.mjs`(순수 node 스크립트)로 감지, 감지 0건이면 코멘트 없이 종료하고 1건 이상이면 PR에 코멘트 하나(스팸 방지 — 기존 코멘트 업데이트/제거 방식)를 남긴다.

---

## 7. Deferred (future rounds — wait-for-signal)

- `/ontology/edit` builder reconsideration — **SUPERSEDED 2026-07-24: the ERD builder was retired.** It had been kept as a constrained workbench surface (focus a saved slug, preview source-file frontmatter writes, run relation preflight, hand off to Insights/Topology). Once the 공방(`/ontology/studio`) covered assemble/connect/preview/write, the xyflow builder was removed and `/ontology/edit` became a redirect to the workshop. Users who prefer direct markdown still edit frontmatter in `/docs` or CLI/MCP; the workshop is the visual relation-repair / write-review surface.
- ~~Phase 4 PM polish~~ — **dropped** (R11 #25, PRODUCT-DIRECTION v3). PM-primary 결정 reverted.
- Search palette unification (`⌘K` + `⇧⌘K`) — R5 skip: not duplicates, would require ranking/section redesign.
- LocalVaultPicker hoist out of dropdown — R5 skip: dead-end already closed by R4 J.
- WebGL context-loss `ErrorBoundary` (Scenario 10) — R9 defer: theoretical, no reports.
- Locale switch query-param preservation (Scenario 9) — R9 defer: low frequency.
- MCP `add_concept` project minimal-input parity with `ProjectForm` — R6 skip: AI agent incremental stub by-design.

---

## 8. Source-of-truth files

When this doc and code disagree, code wins. Trust:
- `package.json`
- `next.config.ts`
- `app/[locale]/layout.tsx`

For per-route truth: open the corresponding `src/views/*` file. Each route has comments explaining mode-aware fallbacks, deep-link sync, and edge cases.
