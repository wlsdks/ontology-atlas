# FEATURES — ontology-atlas

> Complete inventory of features users can **actually use right now**.
> Last updated: 2026-08-22 (지금 있는 라우트, 설치한 앱이 지키기로 한 약속,
> 프로젝트가 무엇을 뜻하는지 확정한 기록(project meaning receipt)을 다시
> 확인했다 — `/ontology` 는 `/topology?index=expanded` 로, `/ontology/edit` 과
> `/ontology/studio` 는 지도 안 contextual writer로 보내는 호환 redirect 이고, Insights 는
> 할 일 · 구성 · 연결 · 경계 · 신선도 다섯 개 질문 탭으로 된 정비 화면이다.
> 데스크톱 정적 스모크 테스트와 설치한 앱 검증기/Computer Use 가 같은 것을
> 확인했다 — 자세한 것은 §2 의 각 라우트 절에).
> Earlier (2026-07-18): 승인된 시안을 기준으로 모든 페이지를 다시 만든 라운드,
> PR #355~#366.
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
| **Desktop app** (macOS · Windows x64 beta) | signed/notarized macOS DMG or unsigned Windows beta NSIS → installed local workbench; first run opens `/docs/?intent=local` vault setup welcome; visual routes `/docs`, `/ontology`, `/topology`, `/projects`, `/ontology/insights` | daily visual ontology work — pick a local vault folder, edit markdown-backed nodes/relations, reopen recent vaults without visiting the hosted site |
| **CLI** (R12 / R14 / R15+ · 54 commands) | `init / agent-setup / agent-files / agent-activity / add / import / list / find / validate / mcp-verify / query / compile / export` (vault basics + existing-vault Claude/Codex config repair + read-only agent-file map/drift readout + explicit live activity heartbeat + installed MCP health/graph-query smoke + deterministic graph compile + standard-format interop export) · `index / analyze / infer-imports / bootstrap / preflight / snapshot` (autonomous ingest, project ontology indexing, commit preflight, and vault-scoped git snapshot commits) · `backlinks / orphans / path / explain / all-paths / reachability / relation-check / relate / rename / merge / delete` (graph CRUD + direct/path/common-neighbor explanation + bounded traversal + transitive closure + write preflight + write) · `match-nodes / match-edges / domain-matrix / facets / schema / pattern-walk / project-map / overview / hubs / blast-radius / cycles / components / topological-order / health / agent-brief / workspace-brief / growth / maintenance / node / similar` (graph deep dive — `query_ontology` ops, including graph DB-style node/edge scans, relation dashboard facets, relation schema patterns, explicit traversal and project maps, connected island checks, prerequisite ordering, relationship explanation, domain coupling matrix, agent handoff, and growth/maintenance queues) | developer terminal — vault scaffold, daily exploration, bulk import, MCP sanity check, live agent activity handoff, commit-time vault impact preview, graph deep dive (same authority as AI agent via MCP) |
| **MCP** (R5 / R7 / R11 / R14 / R16 / R17) | current runtime read/write inventory over JSON-RPC (`tools/list`; prove with `mcp-verify`) | AI agent (Claude Code, Codex, Cursor) — explicit vault/repo root proof · read for context · write back findings · vault-scoped Git status/local snapshots · safe relation removal/replacement and concept reclassification · bootstrap/index projects · finalize project competency receipts · compile/query/validator-backed health and fresh categorical meaning assessment |
| **Website** | GitHub Pages static export / `/` + `/download` | `/` renders the topology map directly and lets you open your own local vault folder from the browser (File System Access API, no install); `/download` is the product intro + release download path. Only `/docs`'s own separate local-source *browsing* tab stays desktop-only. |

Multi-project vaults use explicit selection at the agent boundary:
`ontology-atlas agent-brief --project SLUG` forwards the same project identity
as `query_ontology({ operation: "agent_brief", project: SLUG })`.

When that brief finds incomplete `abilities` or implementation `evidence` against
a current source receipt, `meaningRepair:v2` gives the agent a compact human-review
manifest. The existing `query_ontology` tool's `meaning_repair_review` operation
then serves the complete typed candidates as provenance-bound pages of at most
20 targets and 5 KiB each, with matching full-body read calls and an opaque next
cursor. It stays read-only: every page and target mtime must be checked before
human approval, and Atlas still never patches or finalizes meaning automatically.

```
input (humans + AI agents)     parse           store              output
        │                       │                │                │
        ▼                       ▼                ▼                ▼
  .md in vault  →          frontmatter   →  user disk      →  Topology (/, /topology) map + INDEX
  (frontmatter)                              (vault)           Topology contextual write + review
  + AI agent (MCP)                                            Docs workspace (/docs)
                                                              Insights (/ontology/insights) maintenance board
                                                              compatibility redirects (/ontology, /ontology/edit, /ontology/studio)
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

**Effect**: when a user opens a vault folder in the installed app, `/`, `/topology`, `/projects`, `/project/[slug]`, `/ontology`, and `/ontology/insights` all switch to vault data instantly. Mutations (create / edit / connect) are mode-aware: local → show an exact change review, then write to vault `.md`; static → ask for a writable folder instead of presenting a dead editor.

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

**Single source of truth (R8)**: `LocalVaultProvider` mounts once in `app/[locale]/layout.tsx`. Its many `useLocalVault()` consumers (`RootEntryPage` / `AppNavRail` / `HomePage` / `DocsVaultPage` / `useDataSourceMode` / `useProjects` / `useProjectMutations` / `useVaultOntology` and the persistent app shell) share one state instance, one IDB rehydrate, one filesystem walk.

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
seeds + agent configs + the agent guide pair + 3 procedure skills) / browse the
built-in demo vault — plus a local-first trust line. No download CTA inside the
installed app.

**Vault-carried agent skills (2026-08-17)**: every scaffolded vault — CLI `init`
and the in-app/web starter alike — ships `.claude/skills/atlas-{review,grow,absorb}/SKILL.md`.
The app launches the coding agent with the vault as its working folder, so these
appear directly in the composer's `/` menu tagged `(project)`; measured on a
freshly initialized vault, they take the first three slots of the 50 commands an
app session offers. They encode order and stopping conditions the tool list
alone cannot: review reads `validate_vault` + `health` and writes nothing, grow
filters `growth_plan` candidates against evidence before proposing, absorb checks
for duplicates before extracting. All three refuse to write until a person picks.
Byte-parity between the CLI templates and the web starter constants is gated by
`tests/contract/starter-templates.contract.test.ts`.

**Web root-first-open (2026-07-18)**: on hosted web, `/` no longer shows a
marketing landing page at all — with no vault selected it renders `HomePage`
(the same topology hub `/topology` uses) drawing this project's own dogfood
sample, read-only, plus a **first-run starter module** integrated into the
INDEX panel itself (no floating card/dock — `FirstRunStarterModule`,
`src/features/first-run-starter/`): census meters (concepts/relations/
domains, real data — 화면 언어가 한국어면 라벨도 개념/관계/도메인) +
"open my markdown folder" + "create a new vault" + "just looking around"
dismiss (sessionStorage — reappears next session, not on reload).
2026-07-24 첫 사용 흐름 손질: 폴더를 여는 두 버튼은 OS 파일 선택창을 곧바로
띄우지 않고 **미리 알려 주는 시트**(`VaultOpenGuideSheet`,
`src/features/docs-vault-local/`)를 먼저 연다 — 걱정을 덜어 주는 세 줄(아무
마크다운 폴더나 괜찮다 / 파일은 이 컴퓨터에만 남는다 / 빈 폴더면 시작 문서를
자동으로 만들어 준다)과, 기존 폴더를 고를지 빈 폴더로 새로 시작할지 고르는
갈래가 들어 있다. 카드에는 "2분 구경하기" 투어 버튼과 "쉬운 말로 보기 켜기"
토글(톱니 메뉴 안에 있던 '일반' 모드를 카드로 끌어올린 것)도 넣었다.
빈 vault 를 연 직후에는 더 할 일이 없어 보이는 문구 대신 **시작 체크리스트**
(`VaultStartChecklist`, `src/widgets/topology-controls/`)가 선다 — 소유자
지시(2026-07-24 2차)에 따라 **AI 에이전트를 먼저 붙이는 3단계**다: AI 에이전트
연결(heartbeat 파일로 실제 연결됐는지 판정) → 첫 분석 맡기기(에이전트에
붙여넣을 지시문 복사) → 직접 만들기(선택 사항, project 종류 프리셋 작성기).
웹에서 macOS 설치를 권하던 잘못된 안내 갈래는 없앴다. 첫 방문에는 폴더 안내
시트가 자동으로 먼저 열리고(한 번만, 건너뛰기 있음), 이 세션에서 사용자가
직접 폴더를 열면 AI 에이전트 연결 시트가 한 번 자동으로 이어진다. A brand-pill
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

- **Hosted web, no vault** → the **gateway face** — headline, download, and "open it in the browser" — the same view `/download` renders (2026-07-30 — 루트에서 곧바로 지도를 열어 주던 이전 결정을 뒤집었다). Judged by `isGatewaySurface()`. A web user who *has* a vault still gets `HomePage` with the dogfood sample and the INDEX-panel first-run starter
- **Desktop app, no restored vault** → `FirstRunPage` (just start / open / create / browse demo), not the hosted intro
- **Recent desktop vaults** → the picker stores recently opened Tauri vault paths, can reopen them without another Finder selection, and can remove stale paths from the list
- **Vault loaded (web or desktop)** → `HomePage` — the topology hub (map + INDEX concept panel + node datasheet), same component `/topology` renders (B3 결정 「허브를 따로 두지 않고 지도가 그 자리를 한다」 — the old tree/ego hub, `OntologyViewPage`, is retired; `/ontology` now redirects here with INDEX expanded). Restoring a previously-opened vault handle from IndexedDB goes straight here — no starter surfaces, no re-clicking through first-run every visit
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
- **Ontology block exchange** — 개념 묶음을 폴더째 주고받는 기능이다. INDEX 의
  **블록 가져오기**는 `.md` 폴더와, 있으면 `block-manifest.json` 을 읽어 무엇이
  새로 들어오고 무엇이 기존 파일과 부딪히는지 **먼저 보여 주기만 한다**
  (dry-run — 시험 삼아 돌려 보되 아무것도 쓰지 않는 것). 그다음 사람이 승인한
  파일만 지금 vault 가 이미 쓰고 있는 `createDoc` 경로로 쓴다. 영역 전개 화면의
  **이 영역의 원본 .md 를 블록 폴더로 내보내기**는 그 영역이 담고 있는 하위
  노드들의 원본 파일만 복사한다. 폴더를 고르는 창은 웹에서는
  `showDirectoryPicker()`, 설치한 앱에서는 같은 `FileSystemDirectoryHandle`
  규약을 따르는 Tauri 자체 선택창이다. 사용자가 그 창을 취소한 것은 오류도
  아니고 쓰기도 아니다. 터미널에서만 하려면 `ontology-atlas import <path...>`
  를 쓴다.
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

#### 에이전트 패널 — 처음 무슨 말을 걸지부터 다음 할 일까지 (2026-07-27, 데스크톱 앱 전용)
- 화면 위쪽 도구 줄의 **「에이전트」** 버튼을 누르면 지도 오른쪽에 세로로 긴 패널이 열린다. 패널이 열리면 지도와 노드 정보 칸이 함께 밀려나며 폭을 다시 잡는다. 데스크톱 앱에서만 쓸 수 있다 — 브라우저에는 API 키를 안전하게 둘 곳도, 요청을 보낼 경로도 없어서, 눌러도 아무 일이 일어나지 않을 버튼은 아예 그리지 않는다
- 에이전트 패널이 열리는 동안 왼쪽 INDEX는 저장된 기본 상태를 바꾸지 않고 잠시 접혀 지도 폭을 내준다. 대화를 닫으면 원래 INDEX 선호가 복구되고, 접힌 INDEX 탭을 직접 열면 에이전트 패널이 닫혀 두 보조 패널이 동시에 지도를 압축하지 않는다
- 사용자의 말 한 차례에서 생긴 생각 조각과 도구 호출은 기본 접힌 **「작업 과정 · N단계」** 한 줄로 모인다. 실행 중에는 인디고 점과 단계 수만 갱신하고, 에이전트 답변은 별도 본문으로 읽힌다. 필요할 때 펼치면 기존 순서와 대상 노드를 모두 볼 수 있고, 생각의 Markdown도 실제 굵게·코드·목록으로 렌더된다
- **처음 걸 말 3개** (`buildFirstWords`) — 대화가 비어 있을 때, 이 폴더의 실제 상태에서 뽑은 문장이 최대 3개 뜬다: ① 지금 보고 있는 개념에서 가장 크게 빠진 것 ② 「할 일」 목록이 첫 번째로 지목한 개념(판정에 쓰는 함수는 같은 `detectMeaningGaps`) ③ 언제나 뜨는 「이 지도에서 지금 제일 이상한 곳이 어디야?」
- **이 문장을 만들 때 모델 호출은 0이다** — 이 문장들은 사용자가 [보내기]를 누르기 *전에* 이미 화면에 그려진다. 그러니 문장을 만들려고 밖으로 요청을 보내면 그것은 동의 없는 전송이고, 사용자 본인이 내는 API 요금(BYOK)을 허락 없이 쓰는 일이다. 문장을 만드는 코드는 순수 함수라서 전송 코드를 아예 import 하지 않는다 (`tests/contract/agent-first-words-local.contract.test.ts`)
- **누르면 입력칸에 채워질 뿐, 보내지지 않는다** — 누르면 그 문장이 입력칸에 들어가고 전체 선택 + 포커스가 된다. 고쳐서 보내도 되고 지워도 된다. 눌러도 그 버튼은 사라지지 않는다
- **억지로 3개를 채우지 않는다** — 빈 폴더에서는 1개(「무엇을 만드는 제품인지부터 같이 정리해 줘」), 보고 있는 개념이 없으면 ①번이 빠지고, 고칠 것이 없는 폴더에서는 ③번만 남는다. 문장 길이와 상관없이 **버튼 하나의 높이는 항상 같다**(1512×950 실측: 1개든 3개든 모두 44px, 입력칸 위치도 그대로)
- **키나 폴더가 없을 때 보여 주는 「이런 걸 시킬 수 있어요」도 같은 코드가 만든다** — 문장은 똑같고 겉모습만 다르다(버튼이 아니라 평범한 목록). 지금 끝까지 실행할 수 없는 일에 대해서는 누를 수 있는 버튼을 만들지 않는다
- **다음 한 걸음** — 모델이 문서를 고치자고 제안한 **바로 그 응답 안에서** 다음으로 빈 곳 하나를 같이 말하게 한다(시스템 프롬프트의 `NEXT:` 한 줄). 그 줄이 버튼 하나가 된다. **LLM 을 한 번 더 부르지 않고**, 입력칸에 채워 넣는 방식이라 진행 중인 제안이 둘로 늘어나지 않는다
- **대화가 끊겨도 이어진다** — 새 대화를 시작하면 이 폴더에 **최근 실제로 적용된 변경**(git 이력 최대 5줄, 한 줄 120자까지)을 문맥으로 같이 넣는다. 대화 내용 자체는 저장하지 않는다 — 바뀐 내용은 frontmatter 와 git 에 남고, 그것이 다음 대화의 문맥이 된다
- **이번 대화 요약** — 헤더 부제목 자리의 한 줄이 「이 대화에서 개념 N개 · 연결 M개」로 바뀐다(실제로 저장에 성공한 것만 센다). 글자만 바뀌고 줄의 위치와 크기는 그대로다
- **다른 화면에서 넘어와도 같은 문장** — 노드 상세의 **「말로 시키기」** 버튼과 인사이트 목록 행의 `⋮` 메뉴 안 **「에이전트에게 말로 시키기」** 는 위 버튼들과 **같은 코드로 만든 같은 문장**을 쓴다. 인사이트에서 넘어올 때 주소(`?ask=missing-definition|missing-domain|missing-relations`)가 나르는 것은 **어떤 종류의 요청인지**뿐이고, 실제 문장은 도착한 화면이 그 화면의 언어로 만든다. 주소가 곧 상태라서 뒤로가기를 누르면 같은 문맥이 되살아나고, 패널을 닫으면 그 요청도 함께 사라진다
- **겹치지 않게** — 패널이 열려 있는 동안 선택한 노드의 정보 칸은 패널 폭만큼 안쪽으로 옮겨 선다(둘은 같이 읽어야 하는 한 쌍이다). 옮겨 가는 시간과 가속 곡선은 패널이 열리는 것과 똑같이 맞춘다
- **위아래 여백에 뜻을 준다 (2026-07-28)** — 아직 키를 연결하지 않은 상태에서는 **위**가 "무엇을 시킬 수 있나", **아래**가 "무엇이 필요한가 + 그것을 하는 버튼", **가운데**가 대화가 생길 자리다(보내면 실제로 거기에 답이 나타난다). 대화 중이거나 동의를 묻는 중일 때는 아래쪽부터 내용이 자라서, 답과 누를 버튼이 가까이 붙는다. 1512×950 실측: 뜻 없이 비어 있던 두 여백(위 361px · 아래 361px)을 뜻 있는 하나로 합쳤고, 대화 중 여백은 639 → 512px 로 줄었다
- **바닥은 입력칸 하나만 남긴다 (2026-07-28)** — 지침 보기와 터미널로 넘기기는 항상 떠 있지 않고, 입력칸 아래 **한 줄**을 눌러 폈다 접었다 한다(펼쳐지는 영역은 한 번에 하나만 — 임시 화면을 여러 겹 쌓지 않는다). "코드까지 봐야 하는 일은 터미널의 AI 가 낫다" 는 안내 문장도 그 접히는 영역 안으로 내렸다. 바닥에 상시로 차지하던 높이가 176 → 104px 로 줄었다
- **저장 전에 물어본다는 약속을, 정하는 화면에서 읽게 한다 (2026-07-28)** — "문서를 고칠 일이 생기면 바뀔 내용을 먼저 보여주고, 확인해야 저장돼요" 라는 문장이 API 키를 맡길지 정하는 화면과 동의를 묻는 시트 **양쪽 모두**에 나온다. 예전에는 제안 카드가 뜨기 전까지 화면 어디에도 이 말이 없었다
- **"확인 안 된 말" 경고는 그 턴의 최종 답변에만 (2026-07-28)** — 도구를 부르기 전에 모델이 하는 중간 말("먼저 읽어볼게요")은 볼트 내용에 대한 주장이 아니다. 그래서 한 턴에 세 번씩 반복되던 최고 수위 경고를 한 번으로 줄였다
- **실패했을 때 돌아갈 길 (2026-07-28)** — 실패 알림을 본문과 같은 무게로 그린다(예전에는 화면에서 가장 눈에 안 띄는 줄이었다). 그리고 방금 보낸 말을 입력칸에 다시 넣어 주는 버튼이 함께 붙는다 — 넣어 주기만 하고 보내지는 않는다

#### Agent work visibility

- 지도 utility lane의 상태 줄은 raw transport 이름을 그대로 노출하지 않는다.
  감사용 `codex-mcp-client`/`codex-acp`는 로그에 보존하고 화면에서는 `Codex`로,
  Claude/Cursor/기타는 각 제품·에이전트 이름으로 표시한다.
- **fresh valid heartbeat만 live다.** live 상태는 planning/editing/verifying/blocked를
  계획 중/편집 중/검증 중/승인 기다림으로 보여 준다. 성공 쓰기 로그만 최근이면
  `변경 감지`, 작업이 닫혔으면 `마지막 작업`이므로 조용한 로그를 현재 실행으로
  추측하지 않는다.
- 상태 줄을 누르면 actor, phase, 요청 summary, 실재 target, next step, last tool을
  먼저 보여 주고 작업 단위 알림 기록을 그 아래에 둔다. 알림은 종전처럼 task와
  구조 변화 단위로 집계하며 raw tool-call stream을 그리지 않는다. anchored surface는
  오른쪽 지도 도구 열에서 `--chrome-tile-size + 8px`만큼 떨어져, 반투명 표면 뒤의
  도구 아이콘이 작업 행과 섞이지 않는다.
- 대상 링크는 `현재 대상:`/`마지막 변경:` 역할을 눈에 보이게 말하고
  이미 지도 위에서는 `HomePage`의 node selection을 직접 갱신한다. route remount로
  현재 볼트가 sample graph로 잠깐 바뀌지 않으며, 독립 소비처만
  `/topology?mode=focus&p=…` fallback을 쓴다. heartbeat/tool input이 현재 볼트의
  실재 slug를 밝힌 경우에만 기존 amber agent-focus ring을 그린다.
- `created_by`는 query 가능한 provenance 데이터지만 검토 상태가 아니다. 따라서
  사람 저작 INDEX lens와 red review ring은 없다. `vault-readme`는 Docs reader guide로
  읽히지만 topology adapter, INDEX, canonical concept census, editor target에서는
  제외된다.

#### 어권별 노드 이름 (`display_<locale>`, 2026-07-24)
- 한 노드에 언어마다 다른 이름을 달아 두는 기능이다. frontmatter 의 `display_ko` / `display_en` 에 적은 이름을 지도 라벨 · INDEX · 팝오버가 화면 언어에 맞춰 그린다. 그 언어의 이름이 없으면 다음 순서로 찾아 내려간다: `display_<화면 언어>` → `display` → `title`. 검색과 이름 대조는 언제나 `title` 전체를 쓴다 — 라벨을 붙였다고 검색되는 범위가 좁아지지는 않는다
- 이름을 적어 넣는 길은 셋이다: MCP `add_concept`/`add_concepts` 의 `labels: { ko, en }` · `patch_concept` 로 키를 직접 쓰기 · 지도의 노드 작성기에 있는 언어별 이름 칸
- 한쪽 언어만 채우는 사고를 막는다 — MCP 는 한 언어만 들어오면 경고를 함께 돌려주고(저장 자체를 막지는 않는다), 사람이 쓰는 폼은 **지금 화면 언어의 칸을 필수**로 두어 다른 언어만 채우면 저장을 막고 그 이유를 그 자리에 적는다(모달을 띄우지 않는다)

#### Guided tour (`topology-tour-button`, 2026-07-23, `src/features/guided-tour`)
- **Compass** 타일, "?" 타일 바로 위 — 지도 화면만 다루는 안내 투어로, 이 화면의 그림이 무엇을 뜻하는지 읽는 법을 알려 준다. `md` 폭 이상에서만 뜬다(`hidden md:flex`, 폰에서는 안 뜬다)
- **첫 방문에 저절로 시작한다 (2026-07-24 첫 사용 흐름 손질)** — 샘플 데이터 화면이 자리를 잡았고 `guided-tour:v1` 기록이 아직 없으면 900ms 뒤에 한 번 저절로 시작한다. 건너뛰기를 누르면 `skipped` 로 기록해 다시 와도 안 뜨고, 자기 vault 를 연 사용자에게는 아예 시작하지 않는다. 시작하려는 그 순간에 모달(`aria-modal`)이 떠 있거나, 브라우저 창이 포커스를 잃었거나, 투어가 이미 열려 있으면 조용히 건너뛴다(`canAutoStartGuidedTour` — 임시 화면이 겹쳐 뜨는 것을 막는 가드). 사용자가 직접 여는 길은 둘이다: 컴퍼스 타일, 그리고 첫 실행 카드의 "2분 구경하기" 버튼
- 8 declarative steps, plain-language copy, no jargon even for "ontology" itself: 지도=문서(1) · 점의 크기/모양(2, 캔버스의 노드에 붙는다) · 관계 범례(3) · 직접 눌러보기(4 — 사용자가 실제로 클릭할 때까지 기다렸다가 다음으로 넘어간다) · 데이터시트(5, 4단계에서 실제로 노드를 골랐을 때만 보여 준다) · INDEX(6) · 최근 바뀐 것만 보는 필터(7, 여기서 "구경 끝" 또는 "저는 개발자예요" 로 갈린다) · 에이전트로 건너가기(8, 개발자 쪽으로 갔을 때 — `FirstRunStarterModule` 을 강조한다)
- Each step's anchor auto-skips (and the `N/M` progress-dot denominator shrinks) when its target isn't resolvable — missing element, `display:none`, or off-viewport
- Highlight technique: a `box-shadow: 0 0 0 9999px` scrim-and-cutout paint (not a glow ring — `blur 0`), CSS-transitioned (180ms) between DOM-anchored steps, and a per-frame `worldToScreen` canvas projection (same technique as the realm "전개" button) for the two canvas-node steps — both painted on the same z-70 overlay layer so every step dims the surrounding chrome identically
- The interactive step 4 is a click **funnel**, not a free-for-all: a 4-strip transparent blocker leaves only the spotlit domain dot's cutout clickable (chrome — the tour tile itself, search, "?" — stays blocked), and the anchored dot is a spine-visible domain whose click deterministically opens the datasheet
- Opening the tour demotes other transient surfaces (shortcuts sheet, docs drawer, create-node composer, search palette) and temporarily hides `SampleNodeHint`; `Esc` closes only the tour (ladder tier between the context menu and the create-node composer — the first-run starter's capture-phase Esc yields while the tour overlay is open)
- Focus follows the dialog card on open/step change and returns to the launcher tile on close; the "I'm a developer →" branch button only renders when its step-8 anchor (the first-run starter card) is still present
- Completion/skip status persists to `localStorage` (`guided-tour:v1`) but never blocks re-running the tour from the same tile

#### 목적지 안내 (`DestinationGuide`, 2026-07-26, `src/features/guided-tour`)
소유자 요청: *"각 LNB탭 들어갔을때 가이드는 다 각각 있으면 좋겠네? 지금은
지도쪽만 있어서!"* — 지도에만 있던 안내를 나머지 다섯 목적지로 넓혔다.

- **안내 장치를 두 벌 만들지 않았다.** 지도가 쓰던 투어 장치(`useGuidedTour`
  상태 관리 · 화면을 어둡게 덮고 한 곳만 뚫어 보여 주는 오버레이 · 설명 카드 ·
  진행 점 · 건너뛰기)를 그대로 쓰고, `useGuidedTour({ steps })` 에 화면별 단계
  목록만 갈아 끼운다. 지도의 8단계 여정(캔버스 노드에 붙는 안내 · 실제 클릭을
  기다리는 단계 · 개발자용 갈래)은 예전처럼 HomePage 가 가진다
- **문서함 · 공방 · 인사이트 · 프로젝트 · 기록** 각각 카드 2장 — ① 이 화면이
  무엇을 하는 곳인지(무엇에도 붙지 않는 화면 중앙 카드) ② 여기서 가장 먼저 볼
  것 하나(화면에 실제로 있는 요소 하나를 밝혀 준다: `docs-vault-doc-list` ·
  `studio-entry-choice` · `do-next-touchups` · `project-selector-card` ·
  `atlas-git-panel`). 기능을 나열하지 않고 "여기서 무엇을 할 수 있는가" 한
  질문에만 답한다. 둘째 카드가 가리킬 요소가 그 순간 화면에 없으면(예: 문서
  목록이 접혀 있을 때) 자동으로 한 장짜리가 된다
- 이 안내는 앱 껍데기(`AppShell`)가 가지고 있고, 화면이 바뀔 때마다 `key` 로 다시
  띄운다 — 페이지마다 각자 띄우게 하면 어느 한 페이지가 빠뜨려도 아무도 모른다
  (#65 계열의 어긋남). 지도에서는 이 안내를 그리지 않는다
- **방해하지 않는다** — "봤음" 기록은 화면마다 따로 남긴다(`guided-tour:<id>:v1`).
  한 화면에서 봤다고 나머지 다섯 화면의 안내까지 사라지지 않고, 이미 본 화면은
  다시 저절로 뜨지 않는다. 저절로 시작하는 것은 지도와 같은 조건
  (`canAutoStartGuidedTour`)을 통과할 때뿐이다
- **먼저 움직인 사람에게는 아예 안 뜬다 (2026-07-28)** — 저절로 뜨는 안내는
  700ms 뒤에 열리고, 그때 화면이 가려져 있으면 최대 30초까지 기다린다. 그
  기다리는 동안 사용자가 먼저 클릭하거나 키를 누르면 **뜨는 것 자체를 취소**한다
  (지도가 쓰던 `watchGuidedTourAutoStartCancel` 을 그대로 가져왔다). 스스로
  둘러보기 시작한 사람 위로 뒤늦게 뜨는 카드는 안내가 아니라 방해다. 이렇게
  취소한 것은 "봤음" 으로 기록하지 않으므로 다음 방문에 다시 기회가 온다.
  "이 화면은 여기서 열 수 없다" 고 사정을 밝히는 카드가 대신 서 있는 화면
  (예: 폭이 `lg` 미만일 때의 공방)에서도 뜨지 않는다 — 없는 화면을 소개하는
  안내는 거짓말이기 때문이다
- **다시 보기** — 설정 메뉴 › 화면 › "화면 안내". 여섯 화면 모두에서 같은 자리에
  있다(지도에서는 오른쪽 위 컴퍼스 타일이 여전히 주된 입구이고, 이 메뉴 행은 보조
  수단이다). 화면마다 도움말 버튼을 따로 만들면 화면마다 버튼 개수가 달라지므로,
  언제나 같은 자리에 있는 설정 메뉴 한 곳으로 모았다
- 마지막 카드의 버튼은 `[다음]` 이 아니라 `[완료]` 다 — 있지도 않은 다음 장을
  약속하지 않는다(지도 투어에도 같은 규칙을 적용했다)

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

`/topology` is the read/write workbench and `/ontology/insights` is the
five-question maintenance board. The old
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
- **Relation breakdown** — every edge type as a bar row with a `TopologyV2TraceMark` (solid=containment, dashed=depends/relates) + count + percent of total; empty vault gets a "connect them on the map" hint
- **Hubs** — top nodes by degree: kind glyph + title + relative bar + degree, map deeplink per row, "top N / M total" folded into the single footnote line

#### Tab 4 — 경계 Boundaries
- **Domain coupling** — a domain×domain **heat grid** (rows send, columns receive; the diagonal is inside-one-domain connections in neutral). Cell shade is a 4-step indigo alpha ladder and every non-zero cell keeps its number, so the card never speaks in colour alone. Picking a cell opens that pair's relation-type counts and real example edges (map deeplinks) in a slot that is reserved whether or not anything is selected. Top 6 domains by cross activity; beyond that the footnote says "top N of M domains" and how many cross links fall outside the grid. Same `computeDomainCouplingMatrix` output as MCP `domain_matrix` — no new calculation.
- **Boundary pressure** — per-domain inside vs cross ratio; a high cross share signals a leaking boundary
- Cold start (fewer than 2 domains or no cross edges) shows one explicit empty state **with a next step** (map editor link) instead of a misleading table

#### Tab 5 — 신선도 Freshness
- **Domain freshness heatstrip** — one row per domain, a week-by-week heat strip (neutral ramp, current week in indigo) built from real vault `updatedAt` values (`FRESHNESS_WINDOW_WEEKS`); domains with no dated docs are excluded from the stale count rather than counted as stale ("unknown" ≠ "old"); stale domains get a dashed "stale" tag
- **Recent updates** — most recently touched nodes with kind glyph, domain, and ISO date; footer shows total stale-domain count

#### Bottom handoff row (`InsightsHandoffRow`, always visible)
- One copyable `query_ontology(...)` chain per active tab — the tab's question translated into the agent's execution order (연결 → `centrality` then `blast_radius`; 경계 → `domain_matrix` then `match_edges`)

Empty state (0 nodes): link to `/docs` (open vault).

---

### `/topology?workbench=edit` — contextual meaning editor and change review

- A selected node keeps its map context while its compact inspector swaps, at the
  same anchor, into `MeaningEditorPanel`. There is no second right dock and no
  separate review route.
- One edit handles **one relation**. The user chooses type, target, and rationale,
  or removes that existing relation from the same review path;
  `depends_on` requires a rationale. Invalid `is_a` and containment target kinds
  are filtered before selection.
- The real map draws a dashed directional preview between the live endpoint
  coordinates. This overlay never enters the force graph, so it cannot pull nodes
  or change graph statistics. A density-hidden target is temporarily rendered at
  its real coordinate and label. Confirming crossfades the same mark to solid,
  then the local writer applies the reviewed frontmatter arrays with `expectedMtime`.
- INDEX folds only during `workbench=edit` and restores after close. The responsive
  contract keeps at least 480px of map between left chrome and editor from 1024px
  upward; below `lg`, the editor is the single centered sheet above the tab bar.
- New concept creation uses `workbench=create`. It no longer calls `createDoc`
  from the first button press: the generated UID, slug, kind, display labels,
  domain, and authorship fields are shown in `OntologyChangeReview`, and only
  「확인하고 쓰기」 creates the file.
- ACP keeps read tools frictionless. Every Atlas write tool pauses the same
  conversation on a typed change card, hides `allow_always`, and resumes only on
  `allow_once`; rejection is `reject_once`. The tool-mode policy is checked against
  the generated `tools/list` surface so a new tool fails closed as a write.
- `/ontology/studio` and `/ontology/edit` remain only as compatibility addresses.
  `node/mode/edit/via/review` are translated to `p/workbench/edit` on `/topology`.

<details>
<summary>Retired Compass Stage details (historical reference)</summary>

The following behavior described the removed Studio UI. It is retained only to
explain old screenshots and decisions; none of it is a current destination.

- 개념 하나의 설명과 관계를 **채워 넣는 쓰기 화면**이다. 지금 작업 중인 노드를 화면 한가운데 크게 놓고, 관계 종류마다 방향을 고정해 둔다 — 위=상위 개념(is_a) · 아래=이 개념이 담는 것(contains) · 오른쪽=이 개념이 기대는 곳(depends) · 왼쪽=비슷한 것(relates). 방향이 늘 같아야 사용자가 매번 다시 읽지 않아도 된다. 왼쪽 세로 메뉴의 "공방" 으로 들어간다. **화면은 하나이고, 얼마나 채워졌는지만 두 가지이며, 모드를 고르는 탭은 없다.**
- **이미 있는 노드 채우기(enhance)**: 기존 노드를 열어(`?node=<id>` 링크로 지정하며, 지정이 없으면 관계가 가장 많은 역량을 자동으로 고른다) 빠진 관계를 채운다. 이미 채워진 관계는 인디고 실선과 그 끝의 작은 카드로 그리고, 아직 빈 관계는 파선으로 그린 **빈 자리**로 그린다(장식용 아이콘이 아니라 선만 있는 빈 칸이다). 그중 하나에만 "여기부터 채워요" 안내를 붙인다.
- **새로 만들기(create, `?mode=create`)**: 같은 화면을 전부 빈 상태로 연다 — 종류(kind)/이름/도메인/정의를 적는 초안 카드와, 네 방향의 빈 관계 자리. 저장하기 전에 "새 노드 1개, 관계 N개" 처럼 둘을 나눠서 미리 알려 준다. 이름이 기존 노드와 비슷하면 "기존 노드 열기" 와 "그래도 새로 만들기" 중 고를 수 있다. 다만 종류와 이름이 같아서 파일 주소(slug)까지 겹쳐 버리면 "기존 노드 열기" 만 남기고 저장 · 저장 예고 · 변경 미리보기를 모두 막는다. 이름 입력칸은 그 경고와 연결돼 있어 화면 낭독기에서도 같이 읽힌다. 입력하는 동안 결과를 바로 미리 보여 준다.
- **화면이 아니라 파일이 바뀐다**: 빈 관계 자리를 채우면 실제 `.md` 파일의 frontmatter 관계 목록에 그대로 쓴다(`localVault.updateFrontmatter`). 읽기 전용 볼트(예: 샘플)에서는 대신 AI 에이전트에게 시킬 **MCP 명령 묶음**을 클립보드로 복사해 준다. 연결할 상대는 그 자리에서 바로 뜨는 목록에서 고르거나 "새로 만들기" 로 만든다.
- **자기 파일이 없는 개념은 먼저 물어보고 파일을 만든다**: 볼트의 개념 중 상당수는 다른 문서의 관계 목록에 이름만 적혀서 생긴 것이라, 자기 `.md` 파일이 없다(이 저장소 자신의 볼트에서는 294개 중 198개). 관계는 개념의 파일 안에 저장되므로, 그런 개념에 관계를 이으려면 파일을 먼저 만들어야 한다. 그런데 사용자 디스크에 파일을 새로 만드는 것은 사용자가 시킨 적 없는 일이라, 저장하려는 순간 **만들 파일 경로까지 보여 주고 한 번 물어본다**. 취소하면 파일은 하나도 바뀌지 않는다(적던 내용은 초안으로 남는다). 확인하면 **기존 문서들이 이미 가리키고 있던 그 경로**에 관계까지 적힌 문서가 한 번의 쓰기로 생긴다. 종류를 확정할 수 없으면 임의로 정하지 않고 사용자가 고르게 한다. 읽기 전용 볼트에서는 `add_concept` 까지 포함한 MCP 명령 묶음을 준다.
- **상위 개념(is_a)을 실제로 저장할 수 있게 했다**: "이 개념은 무엇의 한 종류인가" 는 볼트에서 가장 많이 비어 있던 항목이었다. 그래서 frontmatter 에 `broader` 키(SKOS 표준에서 쓰는 이름)를 두고, 그래프 계산 · 스키마(mcp/cli) · 검사기까지 전부 이 키를 알도록 실제로 추가했다. 채우면 파선이던 자리가 실선으로 바뀐다.
- **얼마나 채웠는지 보여 주는 법**: 가운데 카드의 네 변 테두리로 보여 준다(빈 쪽은 파선, 채운 쪽은 실선). 그 아래에 쉬운 말 설명("4개 중 2개 채웠어요"), 왼쪽 위에 다음에 할 일을 가리키는 작은 나침반 표시가 있다. 퍼센트 원형 그래프 · 레벨 · 등급 같은 게임식 표시는 쓰지 않는다.
- **비슷해 보이는 두 질문을 갈라 놓았다 (2026-07-28)**: 위쪽 버튼 줄은 **이 노드의 종류(kind)**를 고르는 곳이고(프로젝트/도메인/역량/요소 넷 중 하나), 위(↑) 방향의 관계 자리는 **`broader` 관계**, 즉 "어느 개념의 하위인가" 를 적는 곳이다. 서로 다른 사실이다. 그래서 버튼 줄에는 「종류 / Kind」 라는 한 단어 라벨을 눈에 보이게 붙이고 `aria-labelledby` 로도 연결했다. 위 관계 자리의 영문 질문은 `What is this node a kind of?` 다 — 예전 문구 `What kind of thing is this node?` 는 말 그대로 "이 노드의 kind" 를 묻는 것처럼 읽혀서 바로잡았다.
- **가로 1024px 미만에서는 열지 않고 이유를 말한다 (2026-07-28)**: 이 화면은 폭이 고정된 카드와 그 둘레에 놓이는 관계 자리로 되어 있어 좁은 화면에서는 성립하지 않는다(설치한 앱은 최소 폭이 `minWidth 1040` 이라 이런 폭이 아예 나오지 않고, 모바일 하단 탭바에서도 공방은 뺐다). `<lg` 폭에서 들어오는 링크 세 갈래(노드 상세의 「관계 편집」 · 인사이트 · 문서함 frontmatter)는 이제 **왜**(가로 1024px 이 필요하고, 창을 넓히면 바로 열린다는 것)와 **어디로 가면 되는지**(지도 · 데스크톱 앱)를 함께 적은 카드 한 장을 받는다. 공방 화면 자체는 그리지 않고, 그 위에서는 첫 방문 안내도 뜨지 않는다 — 없는 화면을 소개하는 안내는 거짓말이기 때문이다.
- **디자인**: 앱 전체와 같은 규칙을 따른다 — 무채색 + 인디고 한 가지 + `--color-*` 토큰만 쓴다. 앰버(주황)는 "당연히 채워져 있어야 하는데 비어 있는 자리" 신호로만 쓴다. **빛 번짐 · 그라디언트 · 보석 · 파티클 · 금색은 금지**다(예전에 있던 게임풍 예외는 2026-07-24 에 폐기됐다). 움직임은 관계 자리를 채울 때 200ms 동안 투명도와 색이 바뀌는 것 하나뿐이고, `prefers-reduced-motion` 설정에서는 그것도 멈춘다. 화면 문구는 전부 쉬운 말이다("이 노드는 무엇의 한 종류인가요?").

</details>

### `/ontology/edit` and `/ontology/studio` — compatibility redirects

Both old addresses now use `OntologyEditRedirectPage` to translate legacy
`?node=`, `?mode=create`, and `?edit=` values into `/topology` workbench state.
The routes remain in the static export so old bookmarks do not 404; neither is
a navigation destination or a product screen.


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
- **Construction review** — `검수 결과 열기` reads one local qualification envelope into React session state only and places a full-width review directly below the hero. The default depth keeps purpose, current/next decision, first blocker/diagnostic, red/unknown/conflict, human approval, and exact plan counts visible. `근거·진단 보기` expands the same artifact's CQs, source-bound witnesses and citations, examples/counterexamples, seven quality axes, diagnostics, exact review/write plans, and digest equality. The same disclosure also exposes a session-only expert draft for CQ wording, witness source references, and the exact plan; edits are visibly dirty, can be restored, never mutate the receipt/vault/localStorage, and require qualification again before any write. Malformed, wrong-project, digest-mismatched, or unequal-plan envelopes fail closed; post-write maintenance is shown separately and never rewrites the completed qualification verdict. Nothing is uploaded, remembered, or written to the vault.
- **Engraved metric strip** — domains / capabilities / elements / documents / relations, derived from this project's own ontology nodes/edges (not the whole vault)
#### Zone 2 — domain composition
- Domain rows (one per domain, uniform height), only rendered when the project has domains (hidden entirely on 0 domains — "match 0 → hide" principle). Each row carries the shared capability:element ratio bar; clicking a row expands its full capability list in place, and the expanded panel links into topology focus for that domain. The former radial mini-map and card grid were retired 2026-08-13 (the map promised size-by-count it could not render — 4.7px between 17 and 6 — and the cards said the same numbers a third time)

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

**이 화면이 하는 일 한 문장**: 내가 고친 개념이 무엇인지 확인하고, 그것을 지금
git 커밋 하나로 남길지 정한다. 그래서 화면에서 가장 눈에 띄어야 하는 것은
**바뀐 개념 목록과 「남기기」 버튼** 한 쌍이고, 나머지는 그 판단의 근거이거나
화면 위아래 테두리일 뿐이다.

화면 모양은 두 단계로 갈린다. 먼저 **이 화면이 아예 일을 할 수 있는 상태인가**
(`data-stage`) — 브라우저라 git 을 못 돌리거나 볼트를 아직 안 골랐으면 여기서
걸린다. 일할 수 있으면 그다음 **지금 판단할 것이 있는가**(`data-shape`)로
갈린다.

#### 아직 일을 시작할 수 없는 상태 (`web` · `no-vault` · `not-initialized` · `loading` · `error`)
- 이 상태들은 **모두 같은 크기, 같은 자리**에 그린다(`--git-setup-measure`
  520px 한 칸, 화면 정중앙). 단계마다 폭이 달라지면 사용자는 매번 다른
  페이지로 튕겨 나간 것처럼 느낀다
- 해야 할 일을 한 줄로 보여 준다: 앱에서 열기 → 폴더 고르기 → 기록 시작.
  원격 저장소 등록은 선택 사항이라 이 줄에 넣지 않는다. 여기에 추가 메뉴나
  장식용 연결선은 두지 않는다
- 브라우저에서는 `앱 받기` 가 주 버튼이고, 터미널에서 쓸 CLI 명령 복사는 보조
  수단이다

#### 아직 안 남긴 변경이 있을 때 (`decide`)
- 왼쪽: 맨 위에 상태별 합계 한 줄, 그 아래에 **종류(kind)별로 묶은 파일 행**
  (상태 기호 `+ ~ − →` · 폴더보다 이름을 크게 · 몇 줄이 늘고 줄었는지). 행을
  누르면 그 문서에서 바뀐 줄이 오른쪽에 나온다
- 개념 파일이 아닌 것(`.gitignore` 등)은 **기본으로 접어 둔다** — 커밋에는 같이
  들어가지만 사람이 판단할 대상은 아니기 때문이다. 접힌 줄이 몇 개인지 숫자로
  말하므로 숨기는 것은 아니다
- 아래 고정 바: 인디고로 채운 `N개 남기기` 버튼 → 확인 단계(실제로 만들어질
  커밋 제목 한 줄 미리보기 + 원격으로 보낼지 여부, 기본은 꺼짐). 무엇이
  기록되는지 알리는 문구도 여기 있다 — 실제로 파일이 쓰이는 자리이기 때문이다
- 오른쪽: 근거를 보여 주는 칸 — `바뀐 줄`(git 내부 표기를 걷어낸 파일별 +/− 줄)
  과 `지난 걸음`(지난 커밋들). **보여줄 내용이 있을 때만 그린다**
- 2열로 나누는 기준 폭은 `xl`(1280)이다. 1024 에서 2열로 만들면 목록이 눌려
  개념 이름이 잘린다

#### 남길 것이 없을 때 (`recall`)
- 2열로 나누지 않는다. **지난 커밋 목록이 본문**인 한 칸짜리 화면
  (`--git-single-measure`)
- 커밋 한 줄에 담기는 것: 얼마 전인지 · 쉬운 말 요약(`추가 3 · 수정 2`) ·
  만든 사람 · 짧은 해시. 펼치면 전체 해시 · ISO 형식 시각 · **커밋 제목 원문**
  (나중에 추적할 때 필요한 기록)
- 주 버튼 자리는 비활성 상태로 그대로 남긴다(`모두 남겼어요`). 상태에 따라
  버튼이 통째로 사라지면 사용자는 다음번에 어디를 눌러야 하는지 매번 다시
  찾아야 한다

#### 화면에는 쉬운 말만 쓴다
- Atlas 가 자동으로 만든 커밋 제목(`ontology snapshot: +3 concepts, …`)은
  화면에 다시 보여 줄 때 사람 말로 바꾼다. 반대로 사람이 손으로 쓴 커밋이나
  다른 도구가 만든 커밋은 원문 자체가 이미 사람의 말이므로 건드리지 않는다
  (`describeSnapshotSubject`)
- git 이 내부적으로 쓰는 표기(`diff --git` · `index <sha>..<sha>` ·
  `@@ -a,b +c,d @@`)는 화면에 내보내지 않는다. 다만 중간을 건너뛴 구간에는 파선
  한 줄을 **남긴다** — 건너뛴 사실까지 숨기면 그 diff 는 거짓말이 된다

#### 사용자가 누르기 전에는 아무것도 쓰지 않는다
화면이 처음 열릴 때 호출하는 것은 읽기 전용 도구
(`git_status` / `git_diff` / `git_history`)뿐이다. 무언가를 바꾸는
`git_init` · `git_set_remote` · `git_snapshot` 은 사용자가 그 버튼을 눌렀을
때(`onClick`)만 실행된다.

### `/agents` — 에이전트 (신설 2026-08-20, 원장 90)

**이 화면이 하는 일 한 문장**: 이 컴퓨터의 AI 코딩 도구를 **받고 · 깔고 · 붙이고 ·
고치고 · 대화를 연다.**

- **목록** — 이 기기에서 실제로 확인된 도구가 먼저 펼쳐지고, 나머지는 접힌다.
- **연결 점검** — 여덟 단계를 재고(도구가 있나 · 띄울 수 있나 · 폴더 밖을 물어보나 ·
  받아 둔 것이 성한가 · 앱 몫 설정 · 자격증명 링크 · 옛 로그인 기록 · 로그인)
  **고칠 수 있는 것은 그 자리에서 고친다.** 못 고치는 것에는 사람이 할 일을 적는다.
- **앱 전용 설치** — Node 와 도구를 앱 폴더 안에만 받는다. 버전을 고정하고, Node 는
  받은 뒤 **해시를 대조한다**(안 맞으면 지우고 멈춘다). 무엇을 실행하는지 누르기
  전에 원문으로 보여 준다. 진행률과 완료가 화면에 남는다 — 창을 닫았다 열어도.
- **재연동** — 앱이 만든 것만 지우고 다시 만든다. 「로그아웃」이 아니다: 이 앱에는
  앱 몫 로그인이 없고, 사용자가 터미널에서 한 로그인을 링크해서 그대로 쓴다.

**왜 설정에서 나왔나**: 설정은 **값을 고르는 자리**이고 이것은 **진행 상태가 있는
운영 작업**이다. 모달은 뒤를 막고 Esc 를 소유해서, 52MB 를 받는 동안 지도를 못 본다.
**API Key 와 작업 공간은 설정에 남는다** — 전자는 2026-08-16 「경로 동결」 결정이
서 있고(목적지 승격은 그 자체가 강조다), 후자는 볼트가 답하는 축이 다르다.

**웹에서는**: 화면은 그대로 뜨고, 브라우저가 못 하는 일(이 컴퓨터의 프로그램을
띄우는 것)을 이유와 함께 말한다. 「연결 불가」가 아니다 — MCP 는 화면이 아니라
**폴더에 붙으므로** 웹 사용자도 연결된다(2026-08-01 원장).

## 3. MCP server (current runtime inventory)

AI agents read/write the same vault as humans. Two ways to get the server running, and only two:

| Channel | How the agent starts it | What the user does |
|---|---|---|
| **Installed desktop app** (primary; macOS 2026-07-27, Windows beta 2026-08-01) | The app ships a compiled MCP server inside its own bundle (`Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp` on macOS, `ontology-atlas-mcp.exe` beside the Windows executable). The agent client spawns that binary directly, so it keeps serving while the app is closed. | Open the vault folder in the app and press **에이전트 연결 / Connect agent**. The app writes `.mcp.json` / `.codex/config.toml` with the bundled binary's absolute path and the vault's real path already filled in — no terminal, no Node, no install step. |
| **Source checkout** (fallback) | `node <checkout>/mcp/src/index.js` with `OATLAS_VAULT` set. | Clone the repo, then either paste the config or let `node <checkout>/cli/src/index.mjs init` / `agent-setup --write` write it. |

npm publishing is retired (`docs/DECISIONS.md`, 2026-07-27) — there is no `npx` channel.

**Connecting a project to its code (2026-08-04).** `connect_project_source`
(CLI `connect-source`) binds one project node to the local folder holding the
code it describes, measures it, and writes the source receipt that
`agent_brief` reports. Omit the folder and it infers one — the git repository
enclosing the vault, otherwise the nearest ancestor carrying a project
manifest — then tells you how many of the ontology's declared `path:` claims
actually exist inside it before anything is written. `confirm: true` binds;
`disconnect_project_source` (CLI `disconnect-source`) undoes it. Until this
landed, the app could say "no code folder is connected" and name
`connect_source` as the next action while nothing outside the macOS folder
picker could perform it.

**R14 — workflow automation** (Claude Code + Codex):

| Trigger | What | Where |
|---|---|---|
| **SessionStart hook** (implicit) | Compact vault census auto-injected into agent context on session start: total nodes, kind distribution, and only an actionable drift warning when needed. The hook deliberately avoids domains, hub lists, and full node tables to keep token use low. | `.claude/hooks/inject-ontology-summary.sh` / `.codex/hooks/inject-ontology-summary.sh` — silent in repos without a vault |
| **Explicit live activity CLI** | Agents or humans can still publish `.ontology-atlas/agent-activity.json` through `ontology-atlas agent-activity` when a handoff needs it. The automatic PreToolUse heartbeat hooks were removed during the token-budget pass; routine shell commands no longer update the sidecar implicitly. | `cli/src/commands/agent-activity.mjs` · `src/features/docs-vault-local/model/agent-activity-status.ts` |
| **`/ontology-bootstrap` skill** (cold start) | Empty vault → evidence-earned first graph. `analyze_repo_structure` side-effect-zero → exact non-writing review plan → maker-independent CQ/source-hidden qualification whose claims bind to that plan with `proposalRefs` → user accepts that digest and every visible gap → only the released unchanged rows reach batch writers → validate/compile/source-connect/finalize. Missing evidence, proposal coverage, or independent evaluation stops without writes. Node count is an observation, never a target or cap. | `.claude/skills/ontology-bootstrap/SKILL.md` / `.agents/skills/ontology-bootstrap/SKILL.md` |
| **`/ontology-sync` skill** (code change) | "I'm done with this task — please sync the ontology now" loop. git diff + context → MCP write tools | `.claude/skills/ontology-sync/SKILL.md` / `.agents/skills/ontology-sync/SKILL.md` |
| **`/ontology-extract` skill** (prose ingress, R+) | User shares prose (meeting note / PR / RFC / Notion paragraph) → `find_evidence` + `similar_nodes` cross-check → candidate table → user picks → land. LLM hallucination guard via prose-source citation in body | `.claude/skills/ontology-extract/SKILL.md` / `.agents/skills/ontology-extract/SKILL.md` |
| **`/ontology-absorb-confluence` skill** (wiki ingress, agent-mediated) | User already has a third-party wiki MCP (e.g. Atlassian's official Confluence MCP) registered in the session. That MCP reads the page (read-only); this skill feeds the returned markdown into the existing `absorb_document` tool (dry-run → user approval → `confirm:true`), then cites the source page URL in each landed node's body. Not a Confluence integration this repo ships — an *agent-mediated* path that reuses Slice 0's absorption pipeline for any structured wiki export (Confluence, Notion, on-prem wikis) once the user has wired the read side themselves. | `.claude/skills/ontology-absorb-confluence/SKILL.md` / `.agents/skills/ontology-absorb-confluence/SKILL.md` |
| **Agent config scaffold** | CLI `init` and the installed app starter write ready-to-use `.mcp.json` and `.codex/config.toml` files into the vault folder. Claude Code / Cursor attach after opening the configured folder; Codex additionally loads the project-local `.codex/config.toml` only after that canonical folder is trusted, so `codex mcp list` and `connection_info` are required proof instead of treating the file's presence as a connection. The empty-vault CTA previews the agent verification path before creation, both empty and existing-vault CTAs include a copyable prompt for Claude Code/Codex that falls back to the CLI setup gate when MCP is unavailable, CLI proof packet, and automation JSON gate, the Workspace palette exposes the same prompt whenever a local vault is loaded, and the local vault tools menu validates and counts only the two active client files, `.mcp.json` and `.codex/config.toml`; `.mcp.json.example` remains a copy/merge template outside the readiness denominator; it summarizes how many active setup files are ready, names the next missing or invalid config, shows a three-step non-developer checklist (config files → agent restart → JSON gate before edits), and offers a repair action that creates missing files or atomically rebinds only the single parseable Atlas entry while preserving unrelated servers/sections. Invalid or duplicate active Atlas config stays untouched and returns a review state. Parseable review templates preserve unrelated content while only Atlas is rebound; malformed templates are preserved and receive a `.ontology-atlas-current.example` sidecar carrying the current binding. Grouped copy buttons provide a complete setup packet (preferred `agent-setup <vault> --root <codebase> --write` repair command + MCP/Codex templates + restart guidance + verification prompt + CLI fallback + automation JSON gate), the same read-first verification prompt (this whole setup panel is now the `VaultAgentSetupPanel` merged into **App Settings → MCP/Agents**, B2 2026-07 — the old docs-header vault tools dropdown was retired to remove the duplicate surface; the local vault picker moved to **App Settings → Workspace**), matching installed-CLI graph runbook (`validate` → `workspace-brief` → `agent-brief --prompt` → `agent-brief --graph-db-pack` → `agent-brief --verify-fallbacks` → `cycles` → `growth` → `maintenance` → `hubs --plan` → `hubs` → `mcp-verify`), a separate one-click automation gate (`agent-brief --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`) with visible command preview, the visible first-contact proof contract (`config_state` → `mcp_verify` → `json_gate` → `graph_briefs`), a separate codebase-root `agent-setup` repair command copy button, codebase-root `.mcp.json.example` template, codebase-root Codex `.codex/config.toml` template, and a one-line `codex mcp add ...` command for users who prefer Codex CLI registration; the starter README gives the same first-contact verification loop plus the `agent-setup /absolute/path/to/this-vault --root . --write` existing-vault repair path before any agent edit. `agent-setup --json` includes `docs.modeComparison` for the CLI-only, MCP-connected, graph DB pack, and setup gate modes, so AI tools can explain the right setup path without scraping Markdown. `agent-brief --verify-fallbacks` runs fallback commands through a bounded parallel queue, prints a human setup-gate line (`ok`, `performanceOk`, wall time, slow count, failed count) before per-command elapsed time plus the slowest fallback, and `agent-brief --verify-fallbacks --json` emits the same check as a compact machine-readable timing report for Claude Code/Codex automation with output samples only on failed rows, so local graph query latency is visible without flooding connector-less setup checks. Each fallback command has a 15s default timeout, configurable with `--fallback-timeout-ms N` or `OATLAS_AGENT_FALLBACK_TIMEOUT_MS=N`, and timeout rows report `timedOut:true` for fail-closed setup automation. Passing-but-slow rows are counted under `slow`, marked with `slow:true`, and summarized by `performanceOk:false` when they exceed the 5s default `slowThresholdMs`, tunable with `--fallback-slow-ms N` or `OATLAS_AGENT_FALLBACK_SLOW_MS=N`; fallback concurrency defaults to 4 and is tunable with `--fallback-concurrency N` or `OATLAS_AGENT_FALLBACK_CONCURRENCY=N`, so automation can distinguish broken setup from local graph latency drift without making the setup gate unnecessarily slow. Root-level CLI init writes matching cwd configs for codebase-root sessions; a repeated init rebinds those root-local Atlas entries to the newly requested active vault and still requires a client restart plus `connection_info` proof. | `cli/src/index.mjs` · `src/features/docs-vault-local/lib/ontology-starter.ts` · `src/features/docs-vault-local/model/use-local-vault.ts` · `src/widgets/app-settings-menu/ui/VaultAgentSetupPanel.tsx` · `src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx` · `src/views/docs-vault/ui/DocsVaultPage.tsx` |
| **10-minute memory loop smoke** | Fresh repo `init -> bootstrap -> validate -> workspace_brief -> agent_brief -> node_profile -> sync proposal` path is executable as a release-readiness gate, including git diff alignment before any side-effecting sync write. | `scripts/smoke-memory-loop.mjs` · `pnpm smoke:memory-loop` |
| **`mcp__ontology-atlas__*` `instructions` field** (R13 v0.7.1) | Server's initialize response carries kind hierarchy, first-time workflow, write safety patterns — every connecting agent gets the discipline without trial-and-error | `mcp/src/index.js` |
| **`.ontology-atlasignore`** (R+) | Vault-root gitignore-style file. **It does not exclude any file from the vault** — the name invites that reading, but nothing is hidden from `validate`, the graph, or search. Patterns match `materialize_external_element` refs in `growth_plan` / `maintenance_plan` and skip *those suggestions*. Intentional external code (e.g. `src/**`, `cli/**`) stops surfacing as noise. `externalElementRefsIgnored` count exposed for transparency | `mcp/src/ontology-atlas-ignore.mjs` (this vault has no ignore file — it needs none) |

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
retired 2026-07-24 with the rest of `/ontology/edit`.) Node identity is the stable
`urn:uuid:<uid>` (both the JSON-LD `@id` and the GraphML node id), while slug is
exported as the readable current address. Contract: **an export is a snapshot**,
the compiler `graphHash` is its **version**, rename/reclassify preserve the URN,
merge preserves the survivor URN and absorbs source identities, and
external/dangling refs are omitted
(never phantom nodes). Full loading recipes live in `mcp/README.md` → *Interop*.
Read-only MCP registration for external read consumers: set `OATLAS_READ_ONLY=1`
(`tools/list` exposes only read tools; write calls are rejected).

Staying file-only here is deliberate and matches the Obsidian precedent
(files + offline core, servers behind an opt-in localhost plugin). A live HTTP
transport is out of scope until two concrete external-tool requests prove that
file export + the local stdio MCP genuinely can't serve them.

**R14 — vault live updates** (`/topology` + all pages):

- **Adaptive polling** (visible-only) — `useLocalVault` fingerprint check while the tab is visible; bursts to ~1.5s right after a detected change and decays to ~5s when idle, so agent / CLI writes surface fast without idle churn (generation-token poller avoids orphaned timers across hide/show)
- **Graph diff pulse** — newly appearing slugs amber-pulse for 5s on `/topology`
- **Toasts** — `Added: <slug>` (info) / `Edited: <slug>` (success, mtime change) on every page
- **Save-conflict guard** — if a file changed on disk between read and write, `/docs` editor save surfaces a localized conflict notice and keeps the buffer dirty instead of silently overwriting unsaved edits
- Effect: IDE · AI 에이전트 · CLI 로 파일을 고치면, 사용자가 웹 탭을 다시 누르지 않아도 ~1.5–5s 안에 그래프가 갱신되고 toast 가 뜬다.

#### Read tools (19)
1. **connection_info** — active vault/repo roots plus the actually advertised `readOnly`, `toolCount`, `toolNames`, and `toolsetHash`; explicit `OATLAS_REPO_ROOT` wins, otherwise repo root is auto-discovered from the active vault's Git top-level before falling back to process cwd
2. **git_status** — vault-scoped working-tree state and risk; no writes or remote transport
3. **git_history** `{ limit? }` — newest-first commits that touched the active vault pathspec only (default 20, max 100), with `limited` / `hasMore`, shallow-repository state, and `historyComplete` so truncated evidence is not mistaken for complete history
4. **list_concepts** `{ kind?, domain?, since?, summary?, offset?, limit? }` — every node as `{uid, slug, …}`, optional filters, deterministic slug ordering, mtime, summary preview, and explicit `{returned, limited, pagination:{offset,limit,total,returned,hasMore,nextOffset}}` metadata for lossless large-vault traversal
5. **get_concept** exactly one of `{ slug }` or `{ uid }` — full detail with both identities, frontmatter, prose, neighbors, edges, and `mtime`; UID lookup survives rename and never falls back to fuzzy matching
6. **get_concepts** exactly one of `{ slugs }` or `{ uids }` — batch read (max 50), order-preserving partial results with both identities and per-node warnings
7. **find_evidence** `{ title }` — partial-match across title / capabilities / elements / body; each match carries `{uid, slug}`, `domain`, `mtime`, and prose excerpt
8. **find_backlinks** `{ slug }` — every referencing node as `{uid, slug, …}` (frontmatter arrays + wikilinks/markdown)
9. **find_neighbors** `{ slug, direction?, types?, includeNodes?, limit? }` — one-hop local graph around a node, with canonical incoming/outgoing `edges[]` and `{uid, slug}` neighbor summaries (`includeNodes` defaults true, `limit` defaults 100/max 500); public relation type aliases like `depends_on` are normalized to stored graph keys
10. **find_path** `{ from, to, maxHops? }` — shortest undirected BFS across graph frontmatter, including `domains` / `domain` containment (default 5 hops, includes aligned `{uid, slug}` `nodes[]` summaries plus `edges[via]`)
11. **list_kinds** — vault kind census `{ total, byKind: { capability: N, … } }`
12. **find_orphans** `{ kind?, excludeKinds? }` — isolated `{uid, slug}` nodes across graph frontmatter, including `domains` / `domain` containment (defaults exclude `project` and `vault-readme`; pass `excludeKinds: []` to include every kind)
13. **query_concepts** `{ filter, limit? }` — typed filter DSL with AND/OR/NOT on `kind` / `domain` / `slug` / `title` / `has(arrayKey)`; match rows carry `{uid, slug}`
14. **compile_ontology** `{ includeIndexes?, summary?, nodesLimit?, nodesOffset?, edgesLimit?, edgesOffset? }` — deterministic graph artifact with UID-required `nodes[]`, slug-based `edges[]`, identity indexes (`uidToSlug`, `slugToUid`, `mergedUidToSlug`), graph-array canonicalization actions, semantic `graphHash`, and pagination; invalid identity fails closed
15. **query_ontology** `{ operation, ... }` — graph-engine query over the compiled artifact (`neighbors`, `path` with aligned `nodes[]`, `all_paths` with per-path `nodes[]` plus `limit` / `searchBudget` / `exhaustive` / `truncatedByBudget` / `totalPathsExact` metadata and `evidence` guidance, `query_plan` with executable run/narrow advice, filter-preserving `suggestedQuery`, and filter-aware `estimate.totalMatches` for `match_nodes` / `match_edges`, `centrality`, `communities`, `similar_nodes`, `explain_relation`, `reachability`, `pattern_walk`, `impact`, `blast_radius`, `subgraph`, `builder_context`, `overview`, `schema`, `facets`, `match_nodes`, `match_edges`, `node_profile`, `domain_profile`, `domain_matrix`, `project_scope`, `project_map`, `relation_check`, `components`, `lineage`, `containment_tree`, `cycles`, `topological_order`, `recommend_relations`, `growth_plan`, `maintenance_plan`, `agent_brief`, `workspace_brief`, `health`) for graph-database-like answers without pulling the full compile payload. `builder_context` keeps its compatibility operation/response name but emits the current Workshop focus URL, persisted bounded neighborhood, `canvasPosition`, `expected_mtime`, and safe low-level write handoff while declaring that unsaved UI drafts are not included. Repeated read calls inside one MCP server session reuse the compiled artifact while the vault document signature is unchanged, so first-contact agent run orders do not pay the full compile cost for every graph query. `match_nodes` returns a `followUp` packet for the first returned row with ready-to-run `node_profile`, incoming/outgoing `match_edges`, and `blast_radius` MCP calls plus CLI fallback commands, so a graph scan can become focused evidence without another round of tool-selection guesswork. `match_edges` returns a `followUp` packet for the first returned real edge with ready-to-run `explain_relation`, `path`, and `relation_check` MCP calls plus CLI fallback commands, so edge scans move directly into evidence and write-preflight instead of being treated as raw proof. `match_edges.filters`, `match_edges.edges[].relationType`, `followUp.focusEdge.relationType`, and `query_plan(match_edges).normalized` expose public names such as `depends_on` next to canonical frontmatter `types` or `via` values such as `dependencies`, so terminal and MCP clients can show the relation name users typed while keeping executable graph keys. `node_profile.edges.incoming/outgoing.byRelationType` and edge `relationType` expose public names such as `depends_on` for node detail views; `domain_matrix.filters.relationTypes`, `connections.rows[].byRelationType`, and connection examples do the same for coupling views, while canonical `types`, `via`, and `byRelation` stay available for graph-key callers. The UI semantic coupling matrix and CLI node deep dive can be rerun from Claude Code, Codex, or terminal fallbacks with the same user-facing names. `agent_brief` returns Claude Code/Codex handoff readiness, a copyable `handoffPrompt` (also printable via `ontology-atlas agent-brief --prompt`), graph entrypoints, first MCP calls, structured `graphDbQueryPack` (`facets` / `schema` / `query_plan(match_nodes)` / `match_nodes` / `query_plan(match_edges)` / `match_edges` / `domain_matrix` / `query_plan(centrality)` / `centrality` / `query_plan(all_paths)` / `all_paths` / `explain_relation` / `business_questions` outcome, domain-boundary, capability-claim, and implementation-evidence scans), investigation playbooks including `graph_traversal` (`schema` → `query_plan(all_paths)` → `all_paths` → `pattern_walk` / `project_map`), `traversalStrategy` (`plan_before_enumeration` → `bounded_path_evidence` → `containment_cross_check`) for plan-first bounded traversal, per-playbook `evidence[]` and `stopWhen[]` checklists, write guardrails for `add_relation` / rename-merge / post-change sync, relation preflight before `add_relation`, a `relationDecisionGuide` for the `skip_existing` / `review_inverse` / `safe_to_add` / `review_new_schema` outcomes, `resultContracts` requiring `all_paths` callers to report completeness fields and requiring `match_nodes` / `match_edges` callers to report `totalMatches`, `limited`, and `followUp` details before treating scan rows as evidence, and read-first write policy. The CLI companion `ontology-atlas agent-brief [vault] --graph-db-pack` turns that pack into a shell-pasteable graph scan script for sessions without MCP. `relation_check` validates relation `type` before endpoint slug resolution, so relation typos such as `depend_on` still return nearest-value hints even in empty or project-less vaults, and returns `matchingEdges`, reverse-direction `inverseEdges`, and a recommendation decision (`skip_existing`, `review_inverse`, `safe_to_add`, or `review_new_schema`). Non-dependency relations may expose an `add_relation` `proposedAction`; a new `depends_on` returns no executable args and instead exposes `approvalGate.writeAllowed:false` until observable ability, rationale, explicit human approval, and nonblank `why` are present. `maintenance_plan` actions include stable `id`, cursor resume via `afterActionId`, explicit `cursor.reason` metadata, executable graph-array canonicalization, count-safe summary fields, `byPhase` / `bySeverity` / `byKind` remaining-queue buckets, `executable`, current-page `nextExecutableAction`, current-page `nextReviewAction`, plus `executableOnly` / `phases` / `severities` / `kinds` filters; ready pages report `cursor.found=true` with `cursor.reason=null`, while unknown cursors return an empty page with `cursor.found=false`, zero remaining actions, and no next actions. `phases`, `severities`, and `kinds` are enum-validated so typoed work-queue filters fail instead of returning an empty plan.
`impact` 와 `blast_radius` 는 사람이 직접 적어 둔 `depends_on` 만 따라간다. 무엇이
무엇을 담고 있는지 같은 구조 관계는 영향 범위와 위험 계산에서 뺀다 — 그런 구조
질문에는 `reachability` 와 `subgraph` 가 답한다. 의존 edge 하나하나는 그 이유가
적혀 있는지에 따라 `review_required`(사람이 봐야 함) 또는
`declared_with_rationale`(이유가 적혀 있음)로 표시된다. 그리고 관계 하나하나가
지금도 사실인지 확인한 기록(current-source receipt)이 생기기 전까지 이 답의
completeness 와 `risk` 는 `unknown` 으로 남는다.

16. **validate_vault** — whole-vault health check with per-file issues and grouped summary, including required/valid/unique UID claims, merge identity history, graph-array canonicality, and dangling graph references

`analyze_repo_structure`의 semantic discovery는 세 root 전체에서 Markdown 200개와
directory entry 1,000개까지만 본다. 일반 의미 문서는 읽기 전 256 KiB에서 멈추며,
이미 방문한 실제 directory, archive류, 끊어졌거나 repository 밖인 symlink는 scan을 확장하지 않는다.

`apps/*`·`packages/*`의 direct workspace member는 static name+description을 가진
`package.json`과 package `README.md`도 같은 6문서 packet 후보가 된다. conventional
root당 48 member까지만 보며 scripts/dependencies를 읽거나 package 이름을 자동 business
meaning으로 승격하지 않는다.

비즈니스 capability 후보도 같은 원칙을 따른다. bounded outcome prose와 구현
evidence가 함께 확인될 때만 제안하고, UI·transport·policy·telemetry 같은 구현형
폴더명은 business meaning으로 자동 승격하지 않는다. 근거가 없으면 구현 검토
대상으로 남으며, analyzer는 vault에 쓰지 않는다.

17. **analyze_repo_structure** `{ rootPath?, maxDepth?, ignore?, proposal?, qualification? }` — side-effect-free bootstrap candidates from package / README / source layout plus the executable construction lifecycle. A valid complete proposal first returns an exact non-writing `reviewPlan`, plan/source digests, eight phase states, every `requiredGapId`, and a shadow-only `admission` receipt (`self_qualified`, `partial_visible_gap`, `human_review_required`, or `hard_block`); `self_qualified` is an auto-write candidate signal, not write permission. `canWrite` remains false and `writePlan` is absent until the existing human acceptance gate is satisfied. A separately identified evaluator then measures approved executive/employee/FDE/agent CQs, current claims/citations, seven quality axes, the complete source-hidden task, and cold-start/prior-CQ regression. After the user sees the exact plan and accepts its digest/revision plus every visible gap, the unchanged proposal and `constructionQualification:v1` packet may release a `writePlan` exactly equal to the reviewed rows. Maker-only evaluation, missing authority, `not_measured`, stale/private provenance, red mandatory axes, source/plan drift, regression failure, or an unaccepted gap fails closed. Acceptance is declared provenance, not authenticated identity or a truth certificate. Its five proposal competency answers still carry `answered` / `partial` / `visible-gap` plus typed concept, relation, evidence, and path witnesses, and the project body preserves that audit. `Excludes` is reserved for sourced product/concept boundaries: unknown or unmeasured evidence belongs in `Uncertainty` or a competency gap, and `epistemic-exclusion-boundary` blocks a proposal that would persist those unknowns as scope. Root `ARCHITECTURE.md` and classified Markdown under bounded `docs`, `site`, and `website` discovery can join the existing six-document semantic packet; archive-like paths and repository-escaping symlinks cannot. README extraction preserves purpose, responsibility/architecture, and ability blocks inside the existing 1,200-character budget instead of letting sponsor/backer/TOC sections consume it. Root package contracts remain bounded evidence, not meaning nodes: Rust reads allowlisted `Cargo.toml` package/features fields and returns separate literal `cfg`/`cfg_attr` provenance without evaluating predicates, executing code, or allowing relation writes. Python reads bounded static package evidence and import-participating boundaries; unused or unsafe inputs are skipped. Root Go modules contribute at most 24 import-participating package-directory element candidates, never path-derived capabilities. A proposal call recomputes the existing read-only import receipt so selectively proposed TS/JS/Python file endpoints and Go file/package endpoints are validated without relying on prior-call state, and import-backed `depends_on` must match observed direction. After the exact released rows land, the agent validates, compiles, connects the source, and finalizes project meaning.
18. **infer_imports** `{ rootPath?, sourceFolders?, ignore?, maxFiles?, reviewMode?, afterReviewId? }` — side-effect-free TS/JS plus root-package Python file imports and root-module Go package imports. Existing file/module edges remain unchanged. Go is exposed separately as `packageImportEvidence` contract `goPackageImports:v1`: each row preserves the importing file, repository-relative source and target package directories, literal import spec, production/test role, and value usage without inventing a target file. It reads root-contained module-local imports only, never runs `go`, a compiler, module cache, or network, skips nested modules plus Go build-excluded `vendor`/`testdata`/underscore-prefixed fixture trees, ignores import-shaped lines inside multiline raw strings, caps files with the shared default 5000, caps each file at 256 KiB and 256 imports, and names external Go modules as out of scope. Its `coverage` receipt says which languages are supported; Cargo detection still marks Rust `use`/`mod`/macro dependency graphs unsupported. File and package receipts distinguish source role and usage; `value` does not claim runtime execution. Every collapsed edge includes whole-edge counts, their joint `productValueCount`, and up to five exact evidence receipts. Missing vault edges and Go package evidence are review-only, never executable write proposals. Compact and focus delivery surface Go counts plus the explicit full-evidence call instead of silently dropping a large package graph. CLI `infer-imports --apply` is disabled, and bootstrap/index cannot auto-create import endpoints or semantic `depends_on`; an agent must inspect both concepts, explain the meaning-level dependency, obtain human approval, and supply nonblank `why` before one explicit write.
19. **index_project** `{ rootPath?, maxFiles?, threshold?, skipImports? }` — side-effect-free project indexing checkpoint that combines repo structure analysis, file-import and Go package-import indexing, and vault validation. It reuses one full import receipt for analyzer evidence, reports file and package relation counts separately, and preserves coverage instead of reducing uncertainty to one count. `plan.conceptDelta` separates raw candidates into existing, ambiguous-alias review, and genuinely new buckets, and `next.reviewCalls` gives exact calls for retrieving full rows before applying anything.

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
3. **patch_concept** `{ slug, frontmatter?, body?, expected_mtime? }` — update existing; graph arrays are canonicalized, but immutable `uid` and merge-owned `merged_uids` cannot be changed by generic patch
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
    - Preserves the node UID; only the readable address and backlinks change
8. **merge_concepts** `{ fromSlug, intoSlug, confirm?, expected_mtime?, expected_into_mtime? }` — **R11** atomic graph-level merge
    - Redirects every backlink `fromSlug` → `intoSlug`, then deletes `fromSlug.md`
    - Preserves `intoSlug` UID and records source identity history in canonical `merged_uids`; prose is not auto-combined
    - For confirmed writes, pass both source and survivor mtimes so neither concurrent edit is overwritten
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
  (log-before-send). Audit writes reject symbolic/hard-linked and non-regular files, hold one
  exclusive reservation per vault, and recheck the reserved tail before
  finalizing; existing audit files are narrowed to owner-only `0600`. This
  native LLM path is currently enabled only on Unix/macOS;
  the public Windows beta fails closed until equivalent reparse-point and
  file-identity proof exists (the map, vault, and bundled MCP remain available).
  In the browser the key field is not rendered — the card
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
  - **주소를 적어서 연결하기 — 내 컴퓨터에서 돌리는 모델 (2026-08-01).** 위의
    이름 붙은 세 벤더 아래 네 번째 행은 특정 벤더가 아니라, 아무 러너나 받아
    주는 **입구 하나**다(러너 = 모델을 실제로 돌려 주는 프로그램). 러너 주소
    (기본 `http://localhost:11434`)를 적고 [연결 확인] 을 누르면 그 요청 한 번이
    「살아 있나 · OpenAI 와 같은 형식으로 말하나 · 어떤 모델을 고를 수 있나」
    세 가지를 함께 답한다. 설치된 모델이 목록으로 와서 사용자는 **고르기만**
    하면 된다(이름을 직접 타이핑하지 않으니 오타로 실패할 자리가 없다). API 키는
    필요 없다 — 이 갈래는 키 보관소를 아예 거치지 않는다. Ollama · LM Studio ·
    llama.cpp server · vLLM 이 모두 이 입구 하나로 들어온다(주소는 OpenAI 호환
    `/v1/*` 를 쓴다. 러너마다 다른 고유 API 를 골랐다면 러너 수만큼 변환 코드를
    따로 만들어야 했을 것이다).
    - **실패한 이유마다 다른 문장을 보여 준다** — 러너가 꺼져 있는 경우(연결
      자체가 안 됨) · 그 포트에 다른 프로그램이 떠 있는 경우(404) · 설치된
      모델이 하나도 없는 경우를 서로 구별하고, 각각 다음에 무엇을 하면 되는지
      함께 적는다.
    - **암호화하지 않는 `http` 는 이 컴퓨터 안(loopback)에서만 허용한다.**
      바깥 기계를 가리키려면 `https` 여야 하고, 주소 안에 아이디·비밀번호를
      적어 넣으면 거절한다 — 주소는 기록에 그대로 남는 자리이기 때문이다.
    - **"밖으로 안 나간다" 는 말은 그게 사실일 때만 한다.** 주소가 이 컴퓨터를
      가리키면 "이 컴퓨터 밖으로 나가지 않고, 기록에도 목적지가
      `localhost:11434` 로 남아요 — 그게 나가지 않았다는 증거예요" 라고 쓰고,
      사용자가 `https` 로 다른 기계를 가리키면 그 문장 대신 "이 주소는 이
      컴퓨터 밖" 이라고 쓴다.
    - 웹 브라우저에서는 이 갈래도 쓸 수 없다(브라우저 페이지가 사용자 컴퓨터의
      localhost 로 요청을 보낼 수 없다). 그래서 "여기서는 안 된다" 고 밝히는
      카드가 API 키 보관 이야기와 **따로** 그 이유를 적고 `/download` 로 보낸다.
  - **Every recorded call names its destination host.** The audit line carries
    `host` (e.g. `generativelanguage.googleapis.com`), and the screen states
    that host before you press check — the strongest claim we can prove for a
    named vendor is "it only goes to the official address compiled into the
    code". `host` was added without bumping the schema `v`, so lines written
    before it exist read back fine with a `null` destination.
  - Unregistered vendors collapse to a one-line `name · [Add key]` row that
    expands in place, one at a time — three always-open password fields would
    turn a settings sheet into a form gate.
- **실행기** (`AcpRuntimeSettings`, 2026-08-16, 데스크톱 앱 전용) — 이 컴퓨터에
  이미 설치된 코딩 에이전트(Claude Code, Codex 등)를 앱이 찾아서 보여 주는 절.
  이 절이 하는 일 하나는 **무엇을 지금 쓸 수 있는지 말하는 것**이다.
  - 목록은 두 갈래로 갈린다: 「바로 쓸 수 있어요」가 펼쳐져 있고 「설치가 필요한
    것」은 접힌다. 못 쓰는 이유는 설치 필요 / Node 필요 / uv 필요 / 직접 설치의
    네 갈래로 갈라 적는다. 갈래마다 사용자가 할 일이 다르므로 「설치됨/아님」
    둘로 뭉개지 않는다. [다시 확인] 으로 언제든 다시 훑는다.
  - **목록은 빌드 때 커밋해 둔 ACP 레지스트리 스냅샷에서 온다**
    (`src-tauri/src/acp-registry.json`, `scripts/build-acp-registry.mjs`,
    갱신은 `pnpm acp:registry`). 실행 중에 CDN 을 부르지 않으므로 인터넷이 없어도
    목록이 그대로 나오고, 무엇이 바뀌었는지는 git diff 에 남는다. 아이콘도 같은
    이유로 빌드 때 받아 `public/acp-icons/` 에 번들한다(레지스트리 규격이 16×16
    단색 SVG 라 브랜드 색이 앱으로 들어오지 않는다).
  - **격리를 실측한 실행기에만 앱의 관문이 붙는다.** 앱이 띄우는 세션은 사용자의
    전역 설정을 물려받지 않고 앱이 관리하는 설정 디렉터리를 쓰며, 볼트 밖 파일
    요청이 오면 사용자에게 묻는다. 그 격리를 아직 재 보지 않은 줄에는
    「확인 안 됨」 표시가 붙고, 그 뜻(그 도구에 해 둔 설정을 그대로 쓴다)을 묶음
    위에서 한 번 설명한다. 표시는 반복되고 문장은 반복되지 않는다.
  - **앱의 지도 옆에서 바로 대화한다.** 격리 관문을 실측한 실행기를 고르면 홈의
    오른쪽 작업 표면에 `AcpChatPanel`이 열리고, 현재 볼트를 작업 폴더와 MCP
    서버로 넘긴다. 별도 경로나 새 화면이 아니라 지도를 보면서 쓰는 같은
    작업대다(`src/views/home/ui/HomePage.tsx`).
  - 어댑터가 모델·작업 방식 목록을 제공할 때만 선택기가 나타난다. 권한 확인을
    없애는 것으로 재 본 작업 방식은 숨기고, 아직 재 보지 않은 것은 이름 옆에
    「확인 안 됨」과 뜻을 붙인다. 안전 판정의 `unverified` 상태는
    `AcpSessionChoices`를 거쳐 기존 `Select`까지 보존된다.
  - 브라우저에서는 프로세스를 띄울 수 없다. 웹에서는 목록 대신 왜 안 되는지와
    어디서 되는지를 적는 한 줄이 그 자리를 대신한다.
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
- **Round 10 / 10b** — `/login` / `/signup` / `/account` / `/reset-password` / `/settings/*` / `/admin/*` / `/review/*` / `/diagnostics/*` / `/knowledge/*` 를 모두 없앴다. Firebase / Firestore / Auth / Storage SDK, 스크린샷 업로더, 노드/엣지를 손으로 클라우드에 넣던 모달도 함께 걷어내고 완전한 local-first 로 되돌렸다.
- **Round 11** — `pnpm vault:validate` / `vault:migrate` 를 새로 만들었다. MCP v0.7.0 — 도구 14개(읽기 8 + 쓰기 6, `rename_concept` / `merge_concepts` 추가). frontmatter 파서 세 벌을 한 계약으로 묶었다. 파일 수정 시각(mtime)으로 동시 편집 충돌을 막는 장치를 넣었다.
- **Round 12** — 주 사용자를 개발자 + AI 에이전트로 정했다(기획자를 주 사용자로 삼았던 이전 결정을 되돌렸다). CLI 명령 4개 추가(`init` 외에 `list / validate / add / find`). 패키지 사이 계약 검사를 네 벌로 늘렸다. 우리 자신의 볼트에서 아무 데도 안 이어진 노드가 8개 → 1개.
- **Round 13** — AI 에이전트가 이 볼트를 얼마나 잘 쓰는지 처음으로 측정했다(Claude Code + Codex, 표본 2). MCP 에 `instructions` 필드 추가(v0.7.1). VSCode 플러그인 v0.1.0 → v0.9.0(R15 에서 없앴다).
- **Round 14** — *AI 에이전트가 고친 것이 볼트에 저절로 반영되게 했다.* 웹에 바로 보이게 하는 장치 4단(5초 주기 확인 / 새 노드 강조 / 추가 toast / 수정 toast). kind 별 frontmatter 서식을 정하고 세 진입점(MCP · CLI · 웹)이 같은 것을 쓰게 맞췄다. CLI `import` 명령(밖에서 온 `.md` 를 이 서식으로 정리). `/ontology-sync` 스킬과, 코딩하는 동안 볼트를 읽으라는 AGENTS 규칙. 세션이 시작될 때 볼트의 개수 요약을 자동으로 넣어 주는 SessionStart hook.
- **Round 15** — VSCode 플러그인 제거(표면 4개 → 3개). CLI `init` 이 `.mcp.json` 을 직접 만들게 해서(작업 폴더와 볼트 양쪽) MCP 등록에 필요한 손질을 한 단계 없앴다. Later follow-up extends this to Codex by writing repo-local `.codex/config.toml` in cwd + vault and by making the app starter write vault-local `.mcp.json` / `.codex/config.toml`. `add` / `import` 의 `--auto-prefix` 를 기본 켜짐으로 바꿨다(시작 폴더 구조와 어긋나지 않게). 끄고 싶으면 `--raw-slug`.
- **Round 16** — fresh repo bootstrap path. `analyze_repo_structure` / CLI `analyze` propose project/domain/capability/element candidates from package metadata, README headings, and source layout with side effect 0.
- **Round 17** — import-derived dependency evidence. `infer_imports` / CLI `infer-imports` parse TS/JS and bounded static Python file imports plus root-module Go package imports, resolve supported internal paths, and return review-only evidence without mutating the vault.
- **Round 18+** — workbench loop consolidation. `/ontology` now frames Tree as Browse and immediately hands selected slugs to Builder (Write), Topology (visual focus), and Insights (Query). `/ontology/edit` is kept as a constrained relation write-review surface with source-file patch preview, preflight, post-save proof packets, and focused Insights handoff. `/ontology/insights` exposes the graph DB query pack as an executable local markdown graph cockpit, and `pnpm dogfood:graph-db` now fail-closes on setup self-check, `health --json`, graph scan follow-ups, public relation-name parity, structural `pattern-walk` / `project-map` traversal, bounded path completeness, relation preflight, and relation explanation contracts.
- **승인된 시안을 기준으로 모든 페이지를 다시 만든 라운드 (2026-07-18, PR #355~#366)** — `docs/prototypes/` 에서 승인된 시안대로 전 화면을 현행화했다. Removed: `/ontology/insights` 의 옛 4탭 독자 유형 시스템(proof/collaboration/agent/census 프리셋, 세션 증빙 줄, collaborator brief, query-recipe cockpit, 약 6,200줄) — 개요/관계/신선도 3탭으로 대체했다; `/projects` 의 검색·필터·페이지 넘김이 있던 카드 목록 — 각인한 개수 헤더 + 최근 활동 줄 + 폭을 꽉 채운 카드 + 파선으로 그린 "다음 프로젝트" 자리로 대체했다(`ProjectQuickCreatePanel` 은 컴포넌트로는 남아 있지만 이 페이지에는 더 이상 나오지 않는다); `/project/[slug]` 의 "More info" 접이식 구역과, 태그/스택/링크를 그 자리에 늘어놓던 표시 — 빠른 편집과 전체 편집으로 옮겼다. Added: 토폴로지 데이터시트를 288 → 352px 로 키우고 근거(evidence) 그룹을 위로 올렸다, `TopologyV2SettingsGear`(오른쪽 도구 레일), `/ontology/edit` 3분할(240 · 캔버스 · 340, `xl` 이상에서 상시) + `BuilderWriteConfirmBar`, `/docs` 의 상시 Pinned/Vault/Recent 사이드바(280px, `lg` 이상) + `DocFrontmatterBlock` + 아래쪽 backlinks 줄, `/download` 의 정직한 사실 줄(크기와 체크섬은 아직 없을 때 "게시 시 기록" 이라고 적는다) + spctl 신뢰 패널 + changelog 미리보기.
- **Agent-loop vault freshness (R+)** — CLI `preflight` 를 새로 만들었다: git 에 올린(staged) 파일을 볼트의 `path:` / `elements:` frontmatter 와 거꾸로 맞춰 보고, 이 커밋이 건드리는 노드가 어디까지 영향을 미치는지를 커밋하기 *전에* 보여 준다(알려 주기만 하고 아무것도 막지 않는다 — 언제나 exit 0 이고, 맞는 노드가 하나도 없으면 조용히 넘어간다). `agent-setup --install-pre-commit-hook` 으로 pre-commit hook 을 설치한다(이미 hook 이 있으면 뒤에 덧붙이고, 여러 번 돌려도 결과가 같으며, `--no-verify` 로 건너뛰는 것은 그대로 존중한다). `.github/workflows/vault-freshness.yml` 은 다른 저장소에서도 불러다 쓸 수 있는 workflow 이고 이 저장소 자신의 PR 에도 건다: PR 에서 바뀐 파일 중 볼트 노드가 가리키고 있는 소스가 바뀌었는데 정작 그 노드의 `.md` 는 이번 PR 에서 안 바뀐 경우를 `scripts/vault-freshness-drift.mjs`(의존성 없는 node 스크립트)가 찾아낸다. 하나도 없으면 코멘트 없이 끝내고, 하나라도 있으면 PR 에 코멘트를 하나만 남긴다(도배를 막으려고 기존 코멘트를 고치거나 지우는 방식이다).

---

## 7. Deferred (future rounds — wait-for-signal)

- `/ontology/edit` builder reconsideration — **SUPERSEDED 2026-07-24: the ERD builder was retired.** It had been kept as a constrained workbench surface (focus a saved slug, preview source-file frontmatter writes, run relation preflight, hand off to Insights/Topology). Once the 공방(`/ontology/studio`) covered assemble/connect/preview/write, the xyflow builder was removed and `/ontology/edit` became a redirect to the workshop. Users who prefer direct markdown still edit frontmatter in `/docs` or CLI/MCP; the workshop is the visual relation-repair / write-review surface.
- ~~Phase 4 PM polish~~ — **dropped** (R11 #25, PRODUCT-DIRECTION v3). 기획자를 주 사용자로 삼았던 결정을 되돌렸다.
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
