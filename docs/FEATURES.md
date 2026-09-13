# FEATURES — ontology-atlas

> Complete inventory of features users can **actually use right now**.
> Last updated: 2026-09-05 (kept one ACP conversation across Analysis tabs, including Not held, and added the source-hidden, current-turn Ontology DNA presentation inside that workbench. Earlier chose the architecture comparison ladder by canvas height, seated rule sentences beside their arrows, and added the agent task chooser; on 2026-08-31 documented the six-tab Insights contract and verified the Flow-to-agent handoff; earlier replaced the compatibility brand with the full/compact/micro pixel mascot family and added one verified, finite agent-work motion sequence; earlier added the separate Architecture contract/workbench,
> source-derived conformance, and its MCP/CLI agent handoff; re-verified current routes, installed app commitments,
> and project meaning receipts — `/ontology` is a compatibility redirect to
> `/topology?index=expanded`, `/ontology/edit` and
> `/ontology/studio` route to the contextual writer within the map; Insights is
> a six-tab maintenance screen: five measured questions (tasks · configuration · connections · boundaries · freshness) plus the agent-written Flow handoff.
> Desktop static smoke tests and the installed app verifier/Computer Use confirmed the same — see §2 for each route section).
> Earlier (2026-07-18): round where all pages were rebuilt based on approved drafts,
> PRs #355–#366.
> Earlier
> (2026-05-31): real-time **adaptive** vault polling, `/docs` editor save-conflict data-loss guard, fresh-init starter ambiguous-alias fix, `find_evidence` relevance ranking, `validate_vault` vault→code `pathDrift`, `infer_imports` edge reconciliation. Earlier still (2026-05-28): graph DB health gate and the now-retired Browse / Builder / Query loop; those historical surfaces are not current route guidance.
> Routes section UI detail remains a maintained product snapshot. When route
> behavior changes, update this file alongside the PR body and CHANGELOG.
> Update trigger: reflect immediately when surfaces are added or removed. Update alongside the PR body and CHANGELOG.

---

## 0. At a glance

> **Mission v4**: "One codebase, one ontology, that people and their AI agents keep current together."
> **Current framing**: a local-first codebase ontology workbench that records what a codebase builds, why it is structured that way, and what a change will affect. Product meaning stays linked to implementation evidence; people judge plain Markdown and Git diffs, and AI agents use the same typed graph.
> **Human value emphasis (2026-09-13)**: keep understanding and judging the system as agents change its code. Current task-aware context and meaning-write review expose recorded meaning, evidence, and unknowns. Complete task-bound Meaning Diff, reliable unfamiliar-repository construction, and measured repeat-use benefits remain development work, not additional shipped features. [Product thesis](PRODUCT-DIRECTION.md#the-atlas-product-thesis).
> **Operating model**: single-user tool. Local-first vault. No login, no backend. **4 surfaces (desktop app · CLI · MCP · Website)** — daily heavy-lift ontology work happens in the installed app / CLI / MCP; on the hosted website, `/` is the gateway until a vault is loaded, then routes to the topology map, while `/topology` remains the explicit map address and `/download` carries the current release path.
> **Brand split**: **Ontology Atlas** is the user-facing desktop app / website brand and release asset identity. `ontology-atlas` remains the repo, CLI binary, and MCP package name.
> **Brand identity**: one pixel mascot spans favicon, OS icons, PWA/OG, README,
> rail, and loading. Its in-app WALK → READ → SUCCESS motion appears only from
> verified Agent Work Visibility state; it never replaces topology kind marks.
> The macOS app also carries a static menu-bar template with localized Open/Quit
> actions for the existing window. It does not claim background work, and no
> Windows notification-area surface ships from macOS-only evidence.

The product is not a general-purpose ontology editor or a code index. It is a
codebase ontology workbench. Its core user-visible loop is `init -> bootstrap ->
MCP-backed agent answer -> agent sync proposal -> git diff review -> better next
agent task`.

| Surface | Entry | Audience |
|---|---|---|
| **Desktop app** (macOS · Windows x64 beta) | signed/notarized macOS DMG or unsigned Windows beta NSIS → installed local workbench; first run opens `/docs/?intent=local` vault setup welcome; primary workbench routes `/topology`, `/architecture`, `/docs`, `/library`, `/ontology/insights`, `/projects`, `/agents`, and `/mcp`; `/git` remains a contextual workbench route | daily visual ontology work — pick a local vault folder, inspect reviewed architecture, edit markdown-backed nodes/relations, reopen recent vaults without visiting the hosted site |
| **CLI** (R12 / R14 / R15+ · 60 commands) | `init / agent-setup / agent-files / agent-activity / add / import / list / find / validate / mcp-verify / query / compile / export` (vault basics + existing-vault Claude/Codex config repair + read-only agent-file map/drift readout + explicit live activity heartbeat + installed MCP health/graph-query smoke + deterministic graph compile + standard-format interop export) · `index / analyze / analysis / infer-imports / architecture / bootstrap / preflight / snapshot` (autonomous ingest, project ontology indexing, reviewed architecture conformance, commit preflight, and vault-scoped git snapshot commits) · `backlinks / orphans / path / explain / all-paths / reachability / relation-check / relate / rename / merge / delete` (graph CRUD + direct/path/common-neighbor explanation + bounded traversal + transitive closure + write preflight + write) · `match-nodes / match-edges / domain-matrix / facets / schema / pattern-walk / project-map / overview / hubs / blast-radius / cycles / components / topological-order / health / agent-brief / workspace-brief / growth / maintenance / node / similar` (graph deep dive — `query_ontology` ops, including graph DB-style node/edge scans, relation dashboard facets, relation schema patterns, explicit traversal and project maps, connected island checks, prerequisite ordering, relationship explanation, domain coupling matrix, agent handoff, and growth/maintenance queues) | developer terminal — vault scaffold, daily exploration, bulk import, MCP sanity check, live agent activity handoff, architecture pre/post checks, commit-time vault impact preview, graph deep dive (same authority as AI agent via MCP) |
| **MCP** (R5 / R7 / R11 / R14 / R16 / R17) | current runtime read/write inventory over JSON-RPC (`tools/list`; prove with `mcp-verify`) | AI agent (Claude Code, Codex, Cursor) — explicit vault/repo root proof · read for context · write back findings · vault-scoped Git status/local snapshots · safe relation removal/replacement and concept reclassification · bootstrap/index projects · finalize project competency receipts · compile/query/validator-backed health and fresh categorical meaning assessment |
| **Website** | GitHub Pages static export / `/` + `/topology` + `/download` | With no active vault, `/` is the gateway; with a loaded local vault it is the topology map, as is explicit `/topology`. `/download` is the product intro + current release download path. Only `/docs`'s own separate local-source *browsing* tab stays desktop-only. |

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
  + architecture-profile/v1                                  Architecture (/architecture) intent + conformance handoff
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
| Resume a single folder on launch | ❌ the browser needs a click for permission, and the chooser says so | ✅ opens it directly | File System Access permission has to come from a gesture, so the web presses something either way |
| Choose between known folders on launch | ✅ | ✅ | two or more known folders and the app asks rather than guessing; one folder is never asked about, and forgetting a folder returns the launch to opening directly |
| See which folder is open, and leave it | ✅ | ✅ | the folder's name sits at the top of the rail on every destination and opens the switcher; each row carries the folder's contents, its last opening, and whether it opens now |
| Work offline | ❌ | ✅ | |
| Git history and snapshots | ❌ degraded card + `ontology-atlas snapshot` | ✅ | a browser has no right to run git on your machine |
| API keys / in-app **agent** chat | ❌ **and will not be built** | ✅ native credential store | keys in browser storage leak to a single XSS, and vendors name the direct-call header `…-dangerous-direct-browser-access` |
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
| **static** | no active vault in the web fallback workbench | bundled sample selected by the web visitor |

**Effect**: the installed app never enters static mode. Until its restored or newly selected local
manifest is ready, the shell commits no destination content; a route change then mounts against
that one provider before paint. On the web, choosing a folder moves every workbench route from the
explicit sample to local in the same fail-closed way. Mutations (create / edit / connect) are
mode-aware: local → show an exact change review, then write to vault `.md`; static web → ask for a
writable folder instead of presenting a dead editor.

**Bootstrap from existing docs (2026-07-20, Slice 1)**: opening a folder that
already has markdown but no `kind:` frontmatter used to strand the user on a
"0 concepts" map with misdirected copy. Now the topology empty state
acknowledges the found documents ("Found N documents") and offers **Create map from my docs** — a blocking dialog that proposes candidates from the already
scanned manifest (root README → project title · 1-depth folders → domains ·
each doc → element with `domain:`), and on confirm writes ONLY frontmatter to
the accepted docs (bodies untouched) plus one new `project.md`. Pure candidate
derivation: `src/features/docs-vault-local/lib/bootstrap-candidates.ts` — the
browser equivalent of CLI `bootstrap` / MCP `analyze_repo_structure`, so all
three ingress paths converge on the same shape. Plain-language copy: the
dialog never says "ontology" (map-building framing for non-experts).

**Meaning & time surfaces (2026-07-21 execution run, PRs #425–#449)**:
- **Edge popover** — edges are first-class clickable objects on the map: a
  click within 7px opens a popover with a plain-language sentence ("A leans
  on B"), the formal type, both endpoints (click = focus), the declaring
  `.md` (with its change-date label), an optional **why** line
  (`relation_notes`), and an edit-relation deep link.
- **Relation rationale (why)** — `relation_notes: {ref: one-line-why}` in
  frontmatter; MCP `add_relation` takes `why` and writes relation + note in
  ONE frontmatter write; `rename_concept` rewrites note keys (collision:
  existing new-key note wins). The read side returns the same sentence as an
  optional `rationale` on `find_path().edges[]`, `get_concept().outgoingEdges[]`,
  and `query_ontology` path/impact rows (omitted when none is stored). The
  validator flags a value that swallowed the next entry
  (`swallowed-relation-note`) and a key naming no declared relation
  (`orphaned-relation-note`).
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
- **First-map reveal** — after "Create map from my docs", nodes assemble out
  of the project position and spring-settle into place (reduced-motion
  arrives instantly).
- **Idle frame gate** — the canvas stops physics+paint after 1.2s of true
  idle (rAF stays alive; any state change resumes next frame).
- **Canonical census** — every surface that says "N concepts" uses one
  derivation (`computeCanonicalCensus`). Topology, Docs, Workshop, Insights,
  and Projects read the same file-backed scope; a surface-specific subset is
  labeled as a subset rather than silently presenting it as the vault total.
- **Docs library on the web** — the local-vault gate is capability-based
  (File System Access), not runtime-based: the same browser session that
  writes via Workshop or the document editor can read/edit in the docs
  library.
- **Relation vocabulary** — one dictionary (formal/plain × 7 types × ko/en)
  feeds the map legend, Insights, Workshop, and datasheet (contract-tested);
  the "?" sheet footer defines domain/capability/element in plain language.

**Single source of truth (R8)**: `LocalVaultProvider` mounts once in `app/[locale]/layout.tsx`. Its many `useLocalVault()` consumers (`RootEntryPage` / `AppNavRail` / `HomePage` / `DocsVaultPage` / `useDataSourceMode` / `useProjects` / `useProjectMutations` / `useVaultOntology` and the persistent app shell) share one state instance, one IDB rehydrate, one filesystem walk.

**Desktop first-run (2026-07-18)**: in the installed app (Tauri — detected via
`isDesktopShell()`, `src/shared/lib/desktop-shell.ts`), `/` with no vault
renders an Obsidian-style **FirstRunPage** (`src/views/first-run/`): local-only
actions — **just start** (2026-07-23, Tauri runtime only — no folder
picker at all: creates `~/Documents/Ontology Atlas/<name>` on real disk
automatically, numbering `-2`/`-3` on a name clash, connects it, then reuses
the same `scaffoldOntology()` seed as "create new vault", and the success
toast names the exact path — real disk, not OPFS, so an AI agent/MCP can
still read it; hidden when the real Tauri invoke bridge is absent, e.g. a dev
`?shell=desktop` browser override) / open vault folder / create new vault
(existing `scaffoldOntology()` when the picked folder is empty — 5 markdown
seeds + agent configs + the agent guide pair + 3 procedure skills) — plus a local-first trust
line. Bundled demo vaults are web-only; no demo or download CTA appears inside the installed app.

**Project-local vault (2026-08-24, supersedes the "just start" location above)**:
the map now lives **inside the project it describes**, at `<project>/atlas`. One
name — `PROJECT_VAULT_DIR`, `src/shared/lib/project-vault-dir.ts` — is shared by
the door that creates the folder
(`src/features/first-run-starter/model/use-build-from-code.ts`) and the open path
that finds it (`src/entities/vault-session/model/resolve-picked-vault-folder.ts`).
Choosing a project only computes and describes: the screen must render the exact
path before `confirm` creates anything, an existing `atlas/` is reused and
reported rather than overwritten, and picking the `atlas` folder itself is named
as the mistake it is instead of proposing `…/atlas/atlas`. Opening a project root
that carries an `atlas/` holding Markdown redirects into it **and says so** —
measured 2026-08-25, the silent alternative read the whole source tree as a vault
and put `.ontology-atlas/` records beside the source. Rationale, including why
the name is neither `docs/` nor a dot-folder: `docs/DECISIONS.md` (2026-08-24).
The picker, recent-project list, and app-start restore share that resolver and persist the
canonical child before building its manifest.

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

**Web root-first-open (2026-07-18, superseded 2026-07-30)**: on hosted web, `/` no longer showed a
marketing landing page at all — with no vault selected it renders `HomePage`
(the same topology hub `/topology` uses) drawing this project's own dogfood
sample, read-only, plus a **first-run starter module** integrated into the
INDEX panel itself (no floating card/dock — `FirstRunStarterModule`,
`src/features/first-run-starter/`): census meters (concepts/relations/
domains, real data — if screen language is Korean, labels are also concepts/relations/domains) +
"open my markdown folder" + "create a new vault" + "just looking around"
dismiss (sessionStorage — reappears next session, not on reload).
2026-07-24 first-use flow refinement: the two buttons to open a folder do not
immediately open the OS file picker but instead open a **pre-informative sheet** (`VaultOpenGuideSheet`,
`src/features/docs-vault-local/`) first — three lines to ease concerns (any markdown folder is fine / Atlas opens it locally and does not upload it to an Atlas backend; a connected coding agent is a separate provider boundary / if empty, starter docs are created automatically) and a branch to choose an existing folder or start fresh with an empty one. The card also includes a "2-minute tour" button and a "Show plain language" toggle (bringing the 'normal' mode from the gear menu into the card).
Immediately after opening an empty vault, instead of text suggesting there's nothing more to do, a **start checklist** (`VaultStartChecklist`, `src/widgets/topology-controls/`) appears — per owner instruction (2026-07-24 2nd round), it's a **3-step process to attach AI agent first**: connect AI agent (determine actual connection via heartbeat file) → hand over first analysis (copy instructions to paste into the agent) → create directly (optional, project type preset writer).
The incorrect guidance branch recommending macOS installation on the web has been removed. On first visit, the folder guide sheet opens automatically first (once only, with a skip option); if the user opens a folder directly in this session, the AI agent connection sheet follows automatically once. A brand-pill `SAMPLE` badge and a bottom-right map readout stay visible for the
whole static session regardless of whether the starter module was dismissed. The
readout names **what is on the canvas right now** ("125 concepts · 9 domains")
and adds the zoom tier and its hint only while zooming still has something to
reveal — in the Cone view every concept is already drawn, so it says the count
and stops (2026-09-05; it used to open with the project count, which is 1 in
every vault anyone has opened, and then tell the reader to zoom in and reveal
125 dots that were already there). The former
`LandingPage` and its hero/value-chain/evidence-instrument content moved to
`/download` (see below) — a returning user whose vault handle restores from
IndexedDB goes straight to their own workspace, no starter surfaces at all.

---

## 2. Routes

> The route inventory itself is `docs/ARCHITECTURE.md` — this section describes what
> each surface *does for a user*, not how many there are. A count here rots on the next
> route and nothing gates it (it said 12 while listing 15, 2026-07-31).

### `/` — Smart entry

- **Hosted web, no vault** → the **gateway face** — headline, download, and "open it in the browser" — the same view `/download` renders (2026-07-30 — reversed the previous decision to open the map directly from the root). Judged by `isGatewaySurface()`.
- **Desktop app, no restored vault** → `FirstRunPage` (just start / open / create), with no bundled sample or workbench rail
- **Recent desktop vaults** → the picker stores recently opened Tauri vault paths, can reopen them without another Finder selection, and can remove stale paths from the list
- **Vault loaded (web or desktop)** → `HomePage` — the topology hub for that vault (map + INDEX concept panel + node datasheet), the same component `/topology` renders (B3 decision ["Don't keep a separate hub; the map takes its place"] — the old tree/ego hub, `OntologyViewPage`, is retired; `/ontology` now redirects here with INDEX expanded). Restoring a previously-opened vault handle from IndexedDB goes straight here — no starter surfaces, no re-clicking through first-run every visit
- **Switch vault mid-session**: the topology settings gear (⚙, top-right utility rail) has a "switch vault" row → `/docs/?intent=local`, alongside the `/docs` vault pill's own "swap" control

### `/download` — the install decision (remade 2026-07-27)

**This screen's job, in one sentence**: *a first-time visitor chooses their
platform, understands its trust state, and gets the matching installer without
hunting for it.* Everything on the page earns its place against
that sentence; the remake removed what could not (a second landing hero, a
Korean-only changelog excerpt, 12 same-weight boxes, and the signing copy that
had become false).

- **Decision first, at full column width**: eyebrow → headline → one-paragraph lead → the macOS decision card. The card is the widest thing above the fold because it is the most important; it used to sit inside a half-width column under a taller figure.
- **One filled indigo button per release state, and it is the one that works.** Generated GitHub Release facts select the CTA: published assets show their real platform/architecture download and size; an unavailable asset gets honest pending copy instead of a dead release button. The releases link stays at lower weight.
- **Architecture help is on the page, not assumed**: "Apple menu → About This Mac; if *Chip* begins with Apple M, it's Apple Silicon". Naming both architectures and stopping there left the majority of visitors — who do not know which Mac they own — stuck in front of two buttons.
- **One release-state source**: everything the page may claim about a build comes from `src/views/download/model/macos-release.generated.ts`, written by `pnpm download:release-facts` out of the real GitHub Release. Published macOS → per-architecture DMGs; published Windows → the x64 NSIS installer; both carry real byte size, filename, direct URL, and copyable SHA-256. Unpublished → plain pending copy instead of placeholder facts. There is no state where the page shows a size or checksum that does not exist.
- **Trust is four facts with their proofs, not a paragraph**: Developer ID signing (`codesign verified`) · Apple notarization + stapling (`stapler validate passes`) · a published SHA-256 per file with the verify command built from the current version's real DMG name · and *what Atlas does not do* — no Atlas account or backend; the vault remains disk-backed and Atlas itself does not upload it. A connected coding agent may send prompts and the context or MCP results it reads to its own provider. Signing is stated as a property of the release path and drift-guarded by `release-facts.test.ts` against the real `desktop:release-artifact` chain (`desktop:sign` → `desktop:notarize` → `desktop:verify-release-dmg --require-signed --require-notarized`), so the claim cannot outlive the pipeline that backs it.
- **After-install path in three steps** — drag to Applications and launch · point it at a markdown folder · connect your AI assistant (tool and command counts derived from `mcp/src/index.js` and `cli/src/lib/cli-commands.mjs`, both drift-guarded) — plus the fact that makes this page a one-time visit: the installed app updates itself with one button (#726).
- **Windows x64 beta**: a published unsigned NSIS installer appears in its own platform section inside the same decision plate. The static warning precedes the outline CTA and names SmartScreen's unknown-publisher warning and managed-PC blocking. Native Windows CI requires dependency audits, Microsoft Defender scan, silent install, app launch, and the installed MCP sidecar smoke; it does not claim to have verified the Windows 11 SmartScreen UI.
- **Evidence figure**: the dogfood instrument (project hex + domain chips + hub capability circle, real `docs/ontology` census — `src/views/download/model/dogfood-census.generated.ts`, built by `scripts/build-docs-vault.mjs`) now sits beside step 02, the one place it is an answer rather than decoration, with its scope caption ("counts this repo's own vault, not yours").
- **Secondary CTA**: "Go to GitHub" → GitHub repo, as a visible medium outline button rather than a small source footnote.
- **Motion**: none on entrance (first painted frame is identical to the settled frame across every node in `#main`). The budget goes to the attention winner alone — the filled CTA eases on `--motion-base` + `--motion-ease` with a 6.1% first-frame share — and `prefers-reduced-motion` lands it instantly. The previous page inverted this: a staggered fade ran on background cards while the winner hard-cut.
- **Live deploy verification**: `pnpm desktop:verify-hosted` checks the deployed `wlsdks.github.io/ontology-atlas` root/download pages after the Pages workflow deploys; on a published release it also runs `pnpm desktop:verify-download` for that tag. It asserts only **server-rendered** text: a loaded-vault map hydrates client-side, so its in-app CTAs never reach the static HTML — expecting them is what kept this gate failing on every Pages deploy while the site itself was fine (5/5 runs red, 2026-07-26~27). Expected download copy is read from `messages/ko.json` instead of duplicated in the checker, so the contract is "the page renders its own copy" and cannot drift: title, source-code CTA, both platform headings, the Windows beta trust state, the hosted-site scope note, a stable GitHub Releases href, and no `/releases/latest` dependency.
- **Privacy note**: the installed app and vault data use local disk as the source of truth; `/docs`'s own local-source *browsing* tab stays desktop-only (unrelated to opening your primary vault from `/`)
- **The page closes its own loop (2026-09-02)**, after a survey of open-source and commercial download pages (Zed, Ghostty, Sublime, HandBrake, Godot, Cursor, Notion, Vercel, Antigravity):
  - the gateway chrome carries a GitHub link beside the X mark, and the facts strip ends with two destinations — *What changed in vX.Y.Z* → `/changelog` and the repository (`↗`) — because the eyebrow said "open source" while the only github.com links on the page were release files;
  - at the split width the hero claims the first viewport below the chrome, so the facts strip sits on the fold instead of 150px above it;
  - a **closing band** before the colophon bookends the page: the winner's file again as an `outline` control (the hero keeps the single filled indigo), the version line, the trust line, and the verification recipe — the platform's command (`shasum -a 256 <file>` / `Get-FileHash`), one sentence on why the hash must match, and the winner's full SHA-256. The winner is decided once for the hero, the strip, and the band;
  - a phone visitor (iPhone, Android mobile) gets *Try it in the browser* as the filled winner and the three files one step down — a phone cannot install a DMG or an EXE;
  - the agents section uses the evidence section's 11/9 grid: the in-app chat scene left, the three still cards stacked right, so the column is filled and the two sections share one grammar.
- **The map is the ground of the first screen (2026-09-02, round two — owner: *"I wanted cool motion or a background effect"*):**
  - the hero object is no longer a boxed column beside the type. It is the **stage behind the whole first screen**: the same graph in its **plane form** — a radial map seen from a tilted camera, anchored right of centre at the split width and dimmed so the type stays clear (measured 0.0% lit pixels under the headline, 0.5% under the decision block at 1512). Below `xl` it sits in a plinth under the facts strip instead of behind the text;
  - the stage **answers the hand**: yaw and pitch lean toward the pointer, eased over frames, and the gateway field gains a fourth light that trails the pointer with inertia (same ink, same alpha ceiling). Fine pointers only, never under reduced motion;
  - the stage carries a **scroll camera**: as the hero leaves the viewport the plane turns, pushes in, looks further down, lifts slower than the page, and fades out over the last half — so the evidence section's real map arrives on clear ground. Reduced motion keeps one still frame;
  - the mascot left the hero (it read as part of the map and is not data); the chrome's compact mark is the page's one mascot;
  - the e2e grid gate now measures legibility over the stage (lit-pixel share under the headline and the decision block) instead of "no destination stands on the object", which the stage makes true by design.
  - council (2026-09-03, five seats, guardian decided): the split opens at 90rem (1440) and follows resizes; the scroll camera runs only there; the cursor says `grab` only over a dot and the hover follows the dot through motion; the hover caption sits in the plane's corner and leads with the kind word; the fan lanes stay inside their rings, the fog floor is 0.22, and indigo on the stage means only `depends`. The decoder ghost that briefly showed a wrong letter in the headline was removed (the caret and the weight landing stay, h1 drift gated at ≤4px). On the gateway face the chrome no longer repeats the changelog chip — the facts strip's "What changed in vX.Y.Z" is the page's one changelog destination.
  - round three (2026-09-03): the hero rises inside half a second (eyebrow and lead 240ms, CTA 320ms, strip 400ms; the CTA used to be invisible yet hit-testable for 920ms); the scroll camera lays the plane down toward the demo poster's top-down view, drifts it to the centre axis, and dissolves it above the facts strip; phones keep three tiers (project, domains, capabilities) drawn larger instead of 96 unreadable dots.

- **Footer**: license · GitHub · stack chips · `LocaleSwitch`

### `/` (with a loaded vault) and `/topology` — canvas-2D topology hub

`/topology` renders `HomePage`; `/` renders it after a vault is loaded (R3 keep-both decision: `/` = home/back-link target, `/topology` = explicit deep-link namespace). Without a vault, `/` follows the gateway/desktop first-run branches above.

#### Analysis modes + workflow entry points
- **Overview (default)** — the canvas-2D Topology map with deterministic
  project/domain/hub structure and bounded ForceAtlas2 settling: the read-first
  decision surface.
- Focus/path/health are **not separate canvases**:
  - **Focus** — enters via node click on the map (selection state); `mode=focus` deep links preserved
  - **Path** — enters via shift-click of 2 nodes or `mode=path` deep links
  - **Health** — enters via the maintenance queue count chip on the view rail; `mode=health` deep links preserved

#### Canvas (`ontology-map` — custom canvas-2D engine + Graphology ForceAtlas2 physics)
- **Click node** → right-side panel opens (`ProjectDrawer` for project nodes, the 352px node datasheet for domain/capability/element nodes — see "Node datasheet" below)
- **Drag node** → reposition (releases back to physics)
- **Double-click node** → "local graph" mode (2-hop neighbors only, breadcrumb: `Local · Root · slugA · slugB`, click to backtrack, Esc to exit)
- **Right-click node** → context menu (Focus / Local graph / Copy detail URL)
- **Shift-click 2 nodes** → highlight shortest path
- **The trail you walked** → every node that takes focus is appended to a session trail. The map leaves footprints beside the relation lines actually crossed (offset along the line's own curve, never on it) and a step number beside each visited node; the top-centre **Trail** chip opens a newest-first mini timeline. Each row carries, under the title, how that step connects to the step before it: the relation word plus the reason recorded on that edge (`relation_notes`), the relation word alone when no reason is written, or "Not directly related" when the two share no edge. **Hand off to AI** copies the same per-step lines into the agent brief, so the argument the walk made travels with the names. Past trails are archived in the vault folder.
- **Dense-group cluster chips** → a parent with more than 12 direct children (e.g. a domain with 108 capabilities) folds its whole subtree into a single `+N` chip instead of spilling hundreds of overlapping nodes/labels. Click the chip to expand just that parent (nodes fan out as a bounded phyllotaxis disk); click the `−` chip to collapse again. Expanded parents live in the URL (`?open=slug1,slug2`) so a shared link or an AI agent reproduces the same expansion. Nested dense children get their own chips once their parent is expanded.
- **Expand all** → the top action opens every containment parent in one step and
  fits every rendered node inside the map. It is a temporary overview, not a
  saved default; pressing it again collapses the batch. A route arriving with
  existing `?open=` parents also uses full-bounds fitting on its first frame so
  already-open nodes do not begin off screen.
- **How the chip looks and where children land is a setting** (Settings › Expand, 2026-08-01 — ported from the `.qa-scratch/proto-expand.html` measurement prototype). Five values: the open control (`floating pill` · **`bar above`, default** · `shoulder badge`), the child layout (`spiral disk`, default · `fan` · `ring` · `column`), and three numbers — how many open at once (4–24, default 24), how many names are attempted per parent (3–40, default 8), and how many parents stay open at once (1–6, default 3). The default control is the bar docked directly above the **selected** node: nothing shows until you select a node, and the folded count keeps living on the node body. Rationale and the observation that would reverse it: `docs/DECISIONS.md`.
- **Expand realm** → focus a node (click) and an orbital **Expand realm** button appears just outside its ring (also offered as an action in the node datasheet, for container nodes). Activating it transforms the map into *that node's world*: only its containment subtree remains, re-laid-out with the node as a temporary root at the origin (children map to rings by **depth**, not kind), and everything outside unmounts behind a 1px indigo warding circle. Relations crossing the boundary fade to a stub at the ring. The transition is a 600ms choreography — outside nodes fling out along curved "gravity" trajectories, inside nodes FLIP to their new spots, the camera dollies in to fit the realm (`prefers-reduced-motion` snaps instantly). The active realm lives in the URL (`?realm=slug`) so a shared link or an AI agent reproduces the same world; a top-center **Realm: {title} ✕** chip and **Esc** (highest ladder priority) return to the full map. Click, `?open` density gating, selective ego, and top-K labels all still work inside a realm.
- **Ontology block exchange** — feature to exchange concept bundles folder-by-folder. INDEX's
  **Import Block** reads `.md` folders and, if present, `block-manifest.json`, showing **only what is coming in and what conflicts with existing files first**
  (dry-run — running it tentatively without writing anything). Then only the files approved by the person are written via the vault's existing `createDoc` path. **Export this realm's source .mds as a block folder** on the realm expansion screen copies only the source files of the child nodes contained in that realm. The folder picker window uses
  `showDirectoryPicker()` on the web, and Tauri's own picker following the same `FileSystemDirectoryHandle`
  protocol on the installed app. Canceling that window is neither an error nor a write. For terminal-only use, run `ontology-atlas import <path...>`.
- **Tab** → keyboard cycle to neighbor hub
- **Empty state** (0–1 nodes) → `TopologyEmptyState` explains whether the
  vault lacks projects or relations, then offers the applicable next actions:
  bootstrap from found docs, create a node, open Topology INDEX, open Workshop,
  or choose a vault.
- **Filter active** → bottom-left "filter · N / TOTAL" badge
- **Three 3D arrangements, chosen in one picker** — the `3D` chip in the top tool
  lane opens a four-row list: **Flat** (the ordinary 2D map, default), **Cone**,
  **Strata**, and **Cloud**. Cone and Strata both draw containment and answer
  different questions with it: Cone makes a parent the apex of its own cone, so a
  subtree is a bump you can point at and rotate to the front; **Strata** (2026-09-06)
  lays the four kinds out as stacked planes — project on top, then domain,
  capability, element — each drawn as one hairline ellipse, so
  "which level is this on" is a glance rather than an inference. The four names
  sit on a **legend rail** at the canvas's right edge (2026-09-06), below the
  utility tiles: one row per plane, each row aligned to that plane's projected
  height and re-aligned as you orbit or morph, and hovering a row raises its
  plane's ring. They used to hang on the rims themselves, which at 1040x720 put
  them on the graph; the rim names remain only as the fallback on a canvas too
  short for the rail, and the two are never both on. Where the rail's column would
  be width the graph wanted, the four names become a **compact stack in the
  bottom-right corner** instead (2026-09-07), keeping the same words and the same
  hover: at 1040x720 that took the graph back from 63.6% of the free canvas to
  73.4% and from two touching same-tier pairs to none, while 1512x982 keeps the
  aligned rail and its 66.3% unchanged. On a Strata plane
  a node keeps its parent's bearing, which makes every containment drop short,
  near-vertical and unable to cross a sibling's; a node whose parent is not in the
  map falls to the outer rim of its own plane, where "nothing above holds this"
  is a position rather than a missing line. Cloud drops containment altogether and
  lets relations decide all three coordinates. Switching between any two runs the
  same continuous morph — nodes travel, they do not cut — and the choice is
  remembered. Measured on the sample vault (2026-09-06): Strata leaves 2
  overlapping node pairs at 1512x982 against the Cone's 4, and none of them are
  same-tier. Geometry: `buildStrataTargets` and `layoutConeTree` in
  `src/widgets/ontology-map/model/dome-view.ts`; gates:
  `tests/e2e/map-3d-strata-drawing.spec.ts` and `map-3d-cone-drawing.spec.ts`.
- **A click lands on the concept you are pointing at, in every 3D arrangement**
  (2026-09-06) — the pointer answers with whatever the frame painted under the
  cursor, and the small pressable ring around a dot no longer competes with a
  painted disc. Before, a near, larger concept could answer for a smaller one
  drawn beside it: measured on the sample vault by pointing at each drawn centre
  in turn, 4 of 125 answered wrongly in Cone at 1512x982 and 12 of 125 at
  834x1112. Gates: the "drawn centre" cases in both 3D drawing specs.
- **Relations stay visible at rest in 3D, on any screen** (2026-09-06, extended
  2026-09-07) — depth still fades a line towards the back, but its ink now stops
  at a floor instead of reaching 3.5% of a near line's, and the stroke itself
  never falls below one device pixel, which is what made the same frames read
  half as strongly on a screen that is not Retina. Measured at 1512x982 against
  the canvas ground, containment lines (Cone / Strata / Cloud): at device pixel
  ratio 2, 1.26 / 1.33 / 1.14 : 1 before the floor and 2.44 / 2.26 / 2.51 : 1
  now; at ratio 1, 1.29 / 1.25 / 1.27 : 1 before and 2.72 / 2.33 / 2.52 : 1 now.
  The 2D map is untouched at either ratio. Gate:
  `tests/e2e/map-3d-relation-ink.spec.ts`, which reads the canvas back at both.

#### `TopologyFitControl` (top-right, desktop-only)
- Single **Fit Map** tile — fits the camera to the graph bounds. Desktop-only (mobile uses pinch-zoom).
- The old "map controls" panel (search · "Hubs only" · overlays · depth/force sliders · in-panel shortcuts help) was a dead control board — the v2 canvas engine never read those focus/overlay/force fields — and was demolished (2026-07-21). Physics (force) tuning may return later as a real, wired feature (see BACKLOG).

#### `HubRail` (left, collapsed default)
- Hub list sorted by degree, click to select
- Keyboard: `↑/↓` cycle hubs · `Home/End` jump to first/last
- Suppressed when hero panel expanded (avoid overlap)

#### Top-right buttons
- **Source button** (`D`) → `DocsQuickDrawer` overlay with pinned/recent markdown source preview
- **Shortcuts button** (`?`) → `ShortcutSheet`
- **Settings gear** (`OntologyMapSettingsGear`, 2026-07-18) → compact anchored popover (228px), no scrim: language (`LocaleSwitch`) · theme (`ThemeToggle`) · INDEX default state (expanded/collapsed default, writes the same localStorage key the INDEX panel reads). Self-closes; owns its own Escape so the global topology Esc ladder doesn't double-fire. Desktop-only (1512/1920 scope)

#### Node detail actions
- The detail panel has one primary outcome: **Ask the agent** in the installed app,
  or **Copy handoff** on the web. Relation editing and linked-node creation live
  under **Edit**; document, fallback handoff, and realm actions live under
  **More**. Typed relation and evidence totals remain on their own group headers,
  rather than being repeated as a second aggregate line.
- The relation-line guide is pull-only in the existing `?` shortcut sheet. The
  map corner no longer carries a persistent legend, and INDEX no longer repeats
  agent/growth/handoff controls below the tree.

#### Agent Panel — From What to Say First to Next Steps (2026-07-27, Desktop App Only)
- **Meaning, findings/history, and conversation share one context dock.** The
  map toolbar and selected concept expose Meaning review. It explains the
  normative kind criteria, actual directional relations, stored rationale and
  missing rationale. Optional relation captions avoid concept labels and shapes.
  Explicit AI analysis actions capture immutable Markdown records in the active
  folder; ordinary drafts still require Send. Historical answers, source/profile
  snapshots, observed Architecture measurements, and reasoned keep/dismiss
  records remain inspectable. Qualified current questions may mark map labels
  with `?`; no report or review automatically edits meaning. Architecture and
  Analysis use the same archive and keep their ACP conversation mounted across
  context sections. [Record contract and limits](ANALYSIS-RECORDS.md).
- **Guarded ACP runtime eligibility** — The app offers Claude Agent and Codex for in-app ACP chat only behind an app-owned gate. Codex runs through the newest upstream `@agentclientprotocol/codex-acp` adapter (1.10.0 as of 2026-09-07) with an isolated `on-request` approval policy and a forced `read-only` mode; since 1.8.0 that mode is a workspace-write sandbox, so a direct write inside the vault may land without a card and the vault's Git history is the undo (owner direction, 2026-09-07), while every injected or self-registered Atlas MCP write pauses at the server-owned typed review card for `reject_once` or `allow_once`. One-time approval never carries into the next write.
- Clicking the **「Agent」** button in the top toolbar opens a tall vertical panel on the right side of the map. When the panel opens, the map and node info areas shift together to adjust their width. This feature is exclusive to the desktop app — browsers lack a secure place to store API keys and a valid path for requests, so the button is not rendered at all if it would do nothing.
- The outer dock continues to yield space to the map width, but the actual conversation surface stands as a panel with 12px spacing on the top, bottom, and right sides. Its borders, radius, and shadows share existing panel tokens used by INDEX and node details, with ACP and API-key conversations sharing the same form. The top and vertical map controls on the left side of the panel are attached 12px from each side of the seam, totaling a 24px gap, moving in sync with the dock's timing and curvature.
- From the first frame of opening the panel, the header, empty conversation prompt, current folder recommendations, and input box are all visible in their final positions. While waiting for connection, only the small spinner and "Connecting" status in the header move; when ready, only the text changes to "Ready." Session start occurs after the dock width movement and camera's final landing complete, ensuring map motion and process booting do not compete for the same frame.
- When a non-empty turn completes, the same maximum-three current-vault recommendations return directly after the latest answer under **Useful next steps**. They appear only while the session is ready, no permission review or error is present, and the composer is empty. Starting a draft makes them yield; choosing one only fills the composer and never sends or writes automatically. An implementation-evidence recommendation matches the MCP maintenance boundary (`path:` or a resolved `elements:` relation) and says only that the capability is not yet linked to code, never that code is absent.
- Those recommendations remain continuous while the same vault is re-read after a save: the last current health and source handle stay usable until the replacement manifest arrives, but never while switching folders. A completed ACP `connect_project_source` or `disconnect_project_source` receipt invalidates the project-source sidecar summary even though no ontology Markdown changed, so a finished source action is replaced by the next applicable prompt instead of being recommended again.
- While the agent panel is open, the left INDEX temporarily collapses without changing its saved default state, yielding map width. Closing the conversation restores the original INDEX preference; opening the collapsed INDEX tab directly closes the agent panel so both auxiliary panels do not compress the map simultaneously.
- Thought fragments and tool calls generated from a single user message are collected into a single line of the default-collapsed **「Process · N steps」**. During execution, only the indigo dot and step count update, while the agent's response is read in a separate body. Expanding it when needed reveals both the original order and target nodes, with thought Markdown rendered as actual bold, code, and lists.
- GFM tables in agent responses appear as real tables with headers, row dividers, and cell padding. Long tables scroll horizontally only within the table itself, without widening the entire conversation dock.
- The current vault slug from `get_concept` directly selects that node on the map. The two slugs from `find_path` reveal the exact shortest path nodes and relationship lines. Only typed Atlas read tools in the same turn are used as input; response sentences or non-existent names are not used as basis for map movement. The streamed input completing the initial `tool_call` via `tool_call_update.rawInput` is also merged into the same tool row.
- If there is no project source connected to the starter vault, "Code Scan" is not executed first. "Connect Code Folder First" navigates to the project data sheet, and only after re-reading the connection on the same screen does the source-evidence-first build prompt appear.
- **First 3 words** (`buildFirstWords`) — When the conversation is empty, up to three sentences extracted from the actual state of this folder appear: ① The biggest gap in the currently viewed concept ② The concept first pointed out by the "To-do" list (the function used for judgment is the same `detectMeaningGaps`) ③ The ever-present "Where is the strangest place on this map right now?"
- **Zero model calls to create these sentences** — These sentences are already drawn on screen *before* the user clicks [Send]. Therefore, sending a request to create them would be an unauthorized transmission, using the user's own API costs (BYOK) without permission. The code creating these sentences is pure and does not import any transmission code (`tests/contract/agent-first-words-local.contract.test.ts`).
- **Clicking only fills the input box; it does not send** — Clicking places that sentence into the input box, selecting all text and focusing it. You can edit and send it or delete it. The button does not disappear even after clicking.
- **Does not force-fill 3 items** — In an empty folder, only one appears ("Let's organize what product we're making from scratch"); if there is no concept being viewed, ① is omitted; in a folder with nothing to fix, only ③ remains. Regardless of sentence length, **the height of one button is always the same** (measured at 1512×950: 44px for both 1 and 3 items, input box position remains unchanged).
- **"You can ask things like this" shown when no key or folder exists is also created by the same code** — The sentences are identical, differing only in appearance (a plain list instead of buttons). No clickable buttons are created for tasks that cannot be executed to completion.
- **Next step** — Makes the model mention one empty spot next to it **within the very response** where it suggests fixing the document (the `NEXT:` line in the system prompt). This line becomes a single button. By filling the input box **without calling the LLM again**, it prevents the ongoing suggestion from doubling.
- **Continues even if the conversation disconnects** — Starting a new conversation includes the **most recently applied changes** to this folder (git history up to 5 lines, max 120 characters per line) as context. Conversation content itself is not saved — changed content remains in frontmatter and git, becoming the context for the next conversation.
- **Summary of this conversation** — The subtitle in the header changes to "N concepts · M connections in this conversation" (counting only those successfully saved). Only the text changes; the line's position and size remain the same.
- **Same sentences even when coming from another screen** — The "Ask by Voice" button in node details and "Agent by Voice" in the `⋮` menu of insight list rows use **the same sentences created by the same code** as the buttons above. What the address (`?ask=missing-definition|missing-domain|missing-relations`) carries when coming from insights is **only the type of request**; the actual sentence is created by the arriving screen in its language. Since the address is the state, pressing back restores the same context, and closing the panel removes the request along with it.
- **Non-overlapping** — While the panel is open, the info area of the selected node shifts inward by the panel's width (they are a pair meant to be read together). The timing and acceleration curve of this shift match exactly how the panel opens.
- **14-inch top chrome also yields the same width** — If there is a selected node info area, the top map tools move to the remaining center of the map excluding that area. When the agent dock opens, central/right button labels collapse into icons by density so two absolute lanes do not overlap.
- **Map camera also reads remaining width in the same clock** — On every frame where the agent dock's width changes, the current view among full/selected node/area/path/full lens follows the new available area, confirming target and speed together on the last frame. Thus, the camera does not start separately or bounce behind the dock, and manually panned/zoomed screens are not taken away. When closing node details, it does not incorrectly leave the exiting panel's width as the final overview safe zone.
- **Work status and notifications do not open separate windows for the same fact** — The work status row opens only current agent/steps/target; the independent bell in the top-right toolbar opens only notifications and work receipts. Unread counts are overlapping badges within the bell, not increasing the square tile width. The notification panel uses `--map-panel-width` to secure a reading width up to 352px. The status row itself uses natural content width rather than short toolbar width, stopping only at 520px, so agent name and last work time are not cut off first.
- **Start conversation directly from the agent destination** — The large "Open Conversation with this Tool" button of the prepared executor places the runtime id in the queue for the session only and navigates to `/topology`. The map consumes the queue once to open the dock only when executor detection ends and the same id is ready.
- **Give meaning to top/bottom margins (2026-07-28)** — While keys are not yet connected, **top** means "what can be asked," **bottom** means "what is needed + buttons to do it," and **center** is where the conversation will appear (answers actually appear there upon sending). During conversation or when asking for consent, content grows from the bottom, bringing answers and clickable buttons closer. Measured at 1512×950: The two previously meaningless empty margins (top 361px · bottom 361px) were merged into one meaningful space, and during conversation, the margin reduced from 639 → 512px.
- **Bottom leaves only one input box (2026-07-28)** — View instructions and send to terminal are not always visible; you press a single line below the input box to expand/collapse it (only one area expands at a time — no stacking multiple temporary screens). The guidance sentence "AI in the terminal is better for tasks requiring code review" also moved into this collapsible area. The height permanently occupied at the bottom reduced from 176 → 104px.
- **Make the promise to ask before saving readable on the decision screen (2026-07-28)** — The sentence "If a document needs fixing, show the changes first; confirmation is required for saving" appears on **both** the screen deciding whether to entrust the API key and the consent sheet. Previously, this sentence was nowhere on screen until the suggestion card appeared.
- **"Unconfirmed words" warning only applies to the final answer of that turn (2026-07-28)** — Intermediate speech by the model before calling tools ("I'll read first") is not a claim about vault content. Thus, the highest-level warning repeated three times per turn was reduced to once.
- **Way back when failing (2026-07-28)** — Failure notifications are drawn with the same weight as the body (previously the least noticeable line on screen). A button is also attached that puts the just-sent message back into the input box — it only puts it there; it does not send it.

#### Agent work visibility

- The status line in the map utility lane does not expose raw transport names directly.
  Audit `codex-mcp-client`/`codex-acp` are preserved in logs and displayed as `Codex` on screen,
  Claude/Cursor/others are shown by each product/agent name.
- **Only fresh valid heartbeats are live.** Live status shows planning/editing/verifying/blocked
  as Planning/Editing/Verifying/Awaiting Approval. Only successful write logs being recent
  means `Change Detected`, work closed means `Last Work`, so quiet logs are not guessed as current execution.
- Clicking the status line first shows actor, phase, request summary, actual target, next step, last tool,
  and places work-unit notification records below. Notifications aggregate by task and structure changes as before, not drawing raw tool-call streams. The anchored surface
  is positioned `--chrome-tile-size + 8px` away from the right map tool column, so tool icons behind the translucent surface do not mix with the work row.
- Target links visibly state `Current Target:`/`Last Change:`
  and directly update node selection for `HomePage` on the map already. Route remount
  does not temporarily switch current vault to sample graph; independent consumers only
  use `/topology?mode=focus&p=…` fallback. Heartbeat/tool input reveals current vault's
  actual slug only then drawing the existing amber agent-focus ring.
- App ontology write allow/deny and final state remain in the vault as limited work receipts in
  `.ontology-atlas/acp-work.jsonl`. Full conversation/thought/
  tool output/absolute paths are not saved. Recent receipts can be viewed collapsed in the activity popover,
  allowing re-check of request/agent/tool/decision/result/typed change items.
- `created_by` is queryable provenance data but not review status. Thus
  there is no human authorship INDEX lens or red review ring. `vault-readme` is read as Docs reader guide
  but excluded from topology adapter, INDEX, canonical concept census, editor target.

#### Locale-specific Node Names (`display_<locale>`, 2026-07-24)
- A feature to assign different names per language to a single node. The map labels, INDEX, and popovers draw names from `display_ko` / `display_en` in frontmatter according to the screen language. If no name for that language exists, it searches down the order: `display_<screen language>` → `display` → `title`. Search and name comparison always use the full `title` — attaching a label does not narrow the search scope.
- There are three ways to enter names: MCP `add_concept`/`add_concepts`'s `labels: { ko, en }` · writing keys directly via `patch_concept` · language-specific name fields in the map's node composer.
- Prevents filling only one language — MCP returns a warning if only one language arrives (does not block saving itself), and the human form **makes the current screen language's field required**, blocking save if only other languages are filled and writing the reason there (no modal).

#### Guided tour (`topology-tour-button`, 2026-07-23, `src/features/guided-tour`)
- **Compass** tile, just above the "?" tile — A guided tour handling only the map screen, teaching how to read what the images on this screen mean. Appears only at `md` width or larger (`hidden md:flex`, does not appear on phone).
- **Starts automatically on first visit (2026-07-24 First Use Flow Cleanup)** — When sample data screen is settled and `guided-tour:v1` record does not yet exist, it starts automatically once after 900ms. Skipping records as `skipped` so it does not appear again even if revisited; does not start at all for users opening their own vault. Silently skips if a modal (`aria-modal`) is open at that moment, browser window loses focus, or tour is already open (`canAutoStartGuidedTour` — guard against overlapping temporary screens). Two ways to open manually: compass tile, and "Take 2-minute tour" button on the first run card.
- 8 declarative steps, plain-language copy, no jargon even for "ontology" itself: map=document (1) · dot size/shape (2, attached to canvas nodes) · relationship legend (3) · try clicking yourself (4 — waits until user actually clicks before moving next) · data sheet (5, shown only if node was actually selected in step 4) · INDEX (6) · filter showing only recent changes (7, branches here to "Tour complete" or "I'm a developer") · skip to agent (8, when going developer side — highlights `FirstRunStarterModule`).
- Each step's anchor auto-skips (and the `N/M` progress-dot denominator shrinks) when its target isn't resolvable — missing element, `display:none`, or off-viewport.
- Highlight technique: a `box-shadow: 0 0 0 9999px` scrim-and-cutout paint (not a glow ring — `blur 0`), CSS-transitioned (180ms) between DOM-anchored steps, and a per-frame `worldToScreen` canvas projection (same technique as the realm "deploy" button) for the two canvas-node steps — both painted on the same z-70 overlay layer so every step dims the surrounding chrome identically.
- The interactive step 4 is a click **funnel**, not a free-for-all: a 4-strip transparent blocker leaves only the spotlit domain dot's cutout clickable (chrome — the tour tile itself, search, "?" — stays blocked), and the anchored dot is a spine-visible domain whose click deterministically opens the datasheet.
- Opening the tour demotes other transient surfaces (shortcuts sheet, docs drawer, create-node composer, search palette) and temporarily hides `SampleNodeHint`; `Esc` closes only the tour (ladder tier between the context menu and the create-node composer — the first-run starter's capture-phase Esc yields while the tour overlay is open).
- Focus follows the dialog card on open/step change and returns to the launcher tile on close; the "I'm a developer →" branch button only renders when its step-8 anchor (the first-run starter card) is still present.
- Completion/skip status persists to `localStorage` (`guided-tour:v1`) but never blocks re-running the tour from the same tile.

#### Destination Guide (`DestinationGuide`, 2026-07-26, `src/features/guided-tour`)
Owner request: *"I wish each LNB tab had its own guide? Currently only the map side has one!"* — Expanded guidance from just the map to the remaining five destinations.

- **Did not create two sets of guidance devices.** Uses the map's tour device (`useGuidedTour`
  state management · overlay darkening screen and showing only one spot · explanation card ·
  progress dot · skip) as is, and swaps in screen-specific step lists into `useGuidedTour({ steps })`. The map's 8-step journey (guidance attached to canvas nodes · step waiting for actual click · developer branch) remains held by HomePage as before.
- **Architecture · Docs Vault · Insights · Project · Agents · Records** each have 2 cards — ① What this screen does (center card not attached to anything) ② One thing to see first here (highlights one actually existing element on screen). Does not list features, only answers "what can be done here" in one question. If the second card's target element is not on screen at that moment (e.g., document list collapsed), it automatically becomes a single card.
- This guidance is held by the app shell (`AppShell`) and re-rendered with `key` every time the screen changes — if each page renders its own, one page missing means no one knows (#65 series misalignment). Does not draw this guidance on the map.
- **Does not interfere** — "Seen" records are kept separately per screen (`guided-tour:<id>:v1`).
  Seeing it on one screen does not make the remaining six screens' guides disappear, and already-seen screens do not auto-appear again. Auto-starting only happens when passing the same conditions as the map (`canAutoStartGuidedTour`).
- **Does not appear at all for those who move first (2026-07-28)** — Auto-appearance guides
  open after 700ms, and if the screen is covered at that time, waits up to 30 seconds. During
  that wait, if the user clicks or presses a key first, **cancels appearing entirely**
  (brought over `watchGuidedTourAutoStartCancel` used by the map). Cards appearing late over someone who started exploring themselves are interference, not guidance. Such cancellations are not recorded as "seen", so the opportunity comes again on next visit.
  Does not appear even on screens where it says "This screen cannot be opened here" (e.g., studio when width is less than `lg`) — introducing a non-existent screen is a lie.
- **View Again** — Settings Menu › Screen › "Screen Guide". Located in the same place on all seven screens (on the map, the top-right compass tile remains the primary entry, this menu row is auxiliary). If each screen had its own help button, the number of buttons would vary per screen, so consolidated into one location in the settings menu always.
- The button on the last card is `[Complete]` not `[Next]` — does not promise a non-existent next chapter (applied same rule to map tour).

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
- **Domain / capability / element node click** → `OntologyMapDetailPanel`, the 352px datasheet (scaled up from 288px, 2026-07-18): single engraved metric line ("N items used · N items needed · N evidence docs"), typed groups for **Sub-items**, **Super-items**, **Items Used**, and **Items Needed**, each capped with a "+N more" overflow; a promoted **Evidence Docs** group listing `evidenceIds` rows; an **Copy Item Info to Send to AI** action with MCP/CLI-style context; **View Details** opens the full detail panel. Relation role stays explicit so the same edge is not counted twice.

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

**The map has weight, a press, and light** (2026-09-08, after the expression bans were lifted). A node's mass is its number of relations: let go of a hub after a drag and it carries the hand's speed a step past the drop point, overshoots once and takes longer to sit, while a leaf snaps home; its neighbours spring back on their own mass. Hovering a node swells it on an underdamped step, so a hover reads as a press that gives. Selecting a node lays an indigo ground halo under its neighbourhood, sized by its farthest neighbour, blooms the node and glows its relation lines, all on the focus ramp, so the light arrives with the dive and leaves with the deselect. Nothing at rest glows or moves, the idle canvas still draws zero frames, and under `prefers-reduced-motion` every end state lands with no ring. Measured on the sample vault at 1512: a dragged domain carried 14 px past its drop and settled by 300 ms; a hovered domain went 28.1 px to 34.7 and sat at 34.2. The pieces are pure modules under `src/widgets/ontology-map/expressive/` (`mass-spring`, `release-offsets`, `ego-light`) with a README naming their tokens and how to remove them.

### `/architecture` — Harness: coverage, guides, structure

**The tab is Harness (`harness.title`) and it answers "how are agents set up to work in this repository"**
(2026-09-13, `docs/records/decisions/2026-09-13-architecture-tab-becomes-harness-3a63ada4-031c-41af-8b9d-6d6f7f2a5138.md`). The route is unchanged, the label moved: the destination
already held one half of the answer (the reviewed structure) and nothing at all of the other
(what the agents were told, and what catches them). Under the title one line says what the tab
is for, and a segmented control picks one of three views on `?view=`; the default is
`coverage`. Two older addresses keep their meaning: `?view=sensors` — the view that named exactly
this question and said it was not built — opens the matrix that answers it, and a `?role=` link
with no `?view=` opens the structure ladder, the only view that can show a role. The shell-wide
`?focus=main` skip anchor every left-rail link carries is deliberately not a deep link: keying the
carve-out on it made one rail click open the ladder and left the default unreachable from the rail
(measured in the installed app, 2026-09-13).

**One sentence at the top, computed from files only**: how many guide documents this repository
speaks to agents through, and how many checks it has in place. Both numbers print their working
— the check number shows its three parts (hook scripts wired · files under `.githooks/` ·
`package.json` lint/typecheck/test scripts) and a caption states the counting rule — because a
bare count invites a reader to hear "N things are protecting you" where what was measured is "N
things are declared". The unguarded-domain question is **not** in that sentence: a deferral
sitting inside a sentence whose other slots are numbers asserts that unguarded domains exist and
are merely uncounted, which no static read of a repository can claim. It stands on its own line
and points at the sensors view.

**Guides (`harness.views.guides`)** — one row per guide file or directory found, with: which tools read it, each
claim carrying the document it came from and the date a person last opened it (a claim we cannot
cite says so (`harness.toolsUncited`) rather than rendering like the sourced rows); size against a
documented cap, where the Codex bar measures the **merged** root + worst-nested `AGENTS.md`,
because that is what Codex truncates and a per-file bar reads green while the merge is already
being cut; byte status for the pairs the repository itself declares identical, with a difference
door (`harness.driftOpen`) that opens both complete files side by side under the row; and the file's modification time
on this disk, labelled as that rather than as a commit date. Below the table the hook configs are
listed by script: wired (`harness.hookWired`) means the script the config names exists on disk, never that it runs
— a script the config names and the disk does not have is called out, because that failure
produces no error at all, and the Codex group carries its approval requirement (`harness.hookApprovalGate`) as a standing
fact instead of a green, since `/hooks` trust lives in no file. Measured on this repository:
98 guide documents in 9 groups, 85 checks (20 + 6 + 59), `AGENTS.md` 12,142 B merging to
13,090 of 32,768, both declared pairs matching, 20 of 20 hook scripts wired.

**Coverage (`harness.views.coverage`)** — the tab's spine and its default view
(2026-09-13, `docs/records/decisions/2026-09-13-harness-spine-is-a-coverage-matrix-b9dba267-d755-4ad5-b854-6f930c7e5922.md`).
Rows are the domains the ontology records for this repository; columns are **Told**, **Gated** and
**Watched**. A file appears in a domain when a path **it declares** reaches a path the ontology
records for that domain — a nested `AGENTS.md`'s own folder, a `.claude` rule's frontmatter `paths:`,
a hook script's anchored lane filter, a check command's file arguments, a workflow's trigger
`paths:` — and never because of where the agent file itself lives: all 122 of this repository's sit
at the root and say nothing about which code they govern. A scope is kept only if it resolves on
disk, and every entry carries the declaration it came from, so an attribution can be checked rather
than trusted.

**Every mark says one thing** (2026-09-13). The square in a cell is a container: **filled** when
something names that domain for that question, **drawn and empty** when nothing does — two states,
separated by fill as well as by hue, and nothing else. The number beside it carries how many, as a
number. Above each column stands a card with **one large number: how many domains that column has
no answer for**, over a denominator printed beside it — and that number is literally the count of
empty squares below it, so a reader can settle the claim by counting rather than by trusting. The
card uses the same census grammar as `/ontology/insights` (`shared/ui/census-tile`), reused rather
than re-invented. No length encoding survives: with counts of 0–12 across eight rows, a bar drawn
against an invisible per-column maximum made a Gated `2` and a Watched `12` the same mark.

Anything declaring no path reaches every domain and is **counted on the card of the column it
qualifies**, opening beneath it rather than repeated down eight rows: `forbidden`, `git` and
`local-first`, twenty hook and Git-hook scripts, and `lint`, `test`, `test:run` and the six CI
workflows with no trigger filter. That count is what makes the empty cells readable — "no check
**names** this domain" is what the files support, while "nothing runs over it" is not. A guard
mirrored across `.claude/hooks/` and `.codex/hooks/` — nine of this repository's are — appears
**once**, with the tools that read it, because the repetition destroyed exactly the distinction the
two files carry.

**An empty cell is the product.** It is a mark that reads down the column at a glance, and opening it shows the ontology's
own record of what the domain is for beside the paths nothing reaches — the sentence a file-only
scanner cannot write, because it does not know what a part of a repository is *for*. **No score, no
grade, no maturity level and no percentage is rendered anywhere**: that is what every comparable
tool ships, and a number asserts a judgement files cannot support. A repository with agent files and
no ontology gets a stated empty state rather than a blank grid, and still gets the half of the
screen that needs no ontology.

**What an agent can reach** — beneath the matrix, in the same census grammar with **no card**: the
three counts keep the display step because they are this block's answer, and they give up the
surface, because two identical strips cannot both be the screen's subject and the numeral cannot
say which is (2026-09-13). Every authored Markdown file falls into exactly one
of three states: a **guide** (read without being asked), a document **a guide names** by path
(reached when needed), or a document **nothing names** (present, and the agent will not open it).
Measured by citation and never by glob: a rule's `paths:` says when to load that rule, not which
documents to read, and reading it the other way makes `documentation.md`'s `docs/**` mark every
document reached. Excluded and named on screen are the ontology folder and the folders the
repository's own `.gitignore` marks as generated; nothing else is filtered, because a sample vault,
an archive and a brief addressed by name rather than by path all belong in the third row for
different and mostly fine reasons, and which of those should be unreferenced is the reader's
judgement. A document naming a design file is a reference, never proof the agent saw the design.

**The wait screen is held back, never the read.** The scan reports each pass it runs and fills a
bar only where the denominator was known before the pass started — but it appears only once a read
has taken longer than a second, so a read that finishes in 0.6s shows no wait screen at all and one
over five thousand documents still gets its stages. The read was never slowed to display it. What
happens on every visit regardless of speed is the **arrival**: the result rises into place and the
six numerals count up from zero.

The whole reading goes through the installed app's bridge (`entities/agent-files`, the same
classifier the docs sidebar and `ontology-atlas agent-files` use — one store, not a second). A
browser's folder permission cannot see a dot entry at all, so on the web the view names what it
cannot reach instead of drawing a shorter list and calling it the inventory.

- Architecture is separate from the Ontology Map and from the public five-kind
  ontology schema. A non-kind `architecture-profile/v1` Markdown document keeps
  reviewed pattern axes, scopes, roles, paths, evidence, and allowed dependency
  direction plus governed import usages in the same Git-backed folder without
  becoming a map node.
- The stable role blueprint is one reviewed contract. Pattern names are declared
  summaries; Atlas does not infer Clean, Hexagonal, MVP, or Feature-Sliced Design
  from folder names. The visible Understand → Plan → Verify stages were removed
  on 2026-09-03; the canvas compares reviewed intent with observation directly.
- **The ladder's contract face grows into the card's spare width, and the drawing is
  centred** (2026-09-13, inspection 122 S8). The three faces used to hold 280/72/240 whatever
  the card's width: measured at 1512×949 in the installed-app window the drawn band was **592px
  inside a 1448px card (41 %), sitting 124px left of its centre, with all seven role sentences
  ending in an ellipsis** while 856px of the card stood empty; the tight ladder buys its height
  by dropping the sentence's second line, and one 280px line cannot hold a Korean sentence. The
  contract face now takes the ground neither lane wants, up to 560px (derived: the longest
  dogfood sentence estimates at 472px and `captionLineRoom` spends 24 on padding), and whatever
  the lanes still do not need is split evenly. Re-measured at the same size: band **872px of
  1448 (60 %)**, centred to the pixel, **0 of 7 sentences cut**, height unchanged. The
  observation column also states "not inspected yet" once under its heading instead of once per
  role, the way the across-axis lane headings already did.
- **The comparison ladder is chosen by height** (2026-09-03). Whenever the seven
  reviewed / 72px delta / 240px observation rows fit the canvas at rest, the
  chain runs down as that ladder — at 1512×945 and at 1920×1080 alike — and each
  rule sentence sits beside the arrow it describes, in the 24px gap between the
  two faces it joins. A canvas too short for the rows, or a profile with parallel
  lanes, still draws the across chain. The ladder needs only its faces plus 48px of
  side lane each side, so a tablet canvas from 744px draws it too. A canvas too
  short for those rows but tall enough for tighter ones draws the same comparison
  on 58px faces with one summary line and a 22px gap, so a 1280×800 laptop shows
  all seven roles instead of counting the seventh as hidden. Choosing a role
  recedes the unrelated roles and strokes to 0.7, so every receded word stays at or
  above 3:1. Every role is one rounded face (the stadium ends were retired on
  2026-09-03), and captions wrap by the width their script needs, so a Korean
  sentence stays inside its face. Both lanes seat an adjacent sentence beside its
  own arrow; a skip arc leaves and arrives at the face's side with a side port,
  so no arc crosses a row gap; the count sentence reads "{from} → {to} import
  {n}"; and the side lanes go where the arcs are, a 48px contract lane unless the
  profile declares a skip and up to 360px for the observation lane. The ladder sits
  in the middle of the height it has, and the observation face is exactly its row,
  so both lanes share one arrow length and one sentence baseline. Below the
  paired width a phone draws the narrow ladder: one lane, the face as wide as the
  canvas allows up to 280px, two caption lines, and each rule sentence beside its
  arrow reading to the canvas edge. A short-canvas across chain grows its faces
  with the canvas up to the roomy 220px, names each row once above its first face
  instead of on every face, and gives its captions three lines.
- **A role's sentence can be written in the reader's language** (2026-09-03). Beside
  `summary_<role>`, a profile may carry `summary_<role>_<locale>`, such as
  `summary_views_ko`. The screen shows the locale line to a reader in that locale
  and the canonical `summary_<role>` to everyone else, so a profile translated one
  role at a time never leaves a blank where a sentence was. `summary_<role>` stays
  the reviewed fact: it is the only sentence the agent handoff, `inspect_architecture`
  and CLI `architecture` print, and a locale line without it is refused, as is a
  locale line for a role the profile does not declare. A document whose profile this
  screen cannot read is now named in a notice above the canvas instead of replacing
  every profile in the folder with an error.
- **The agent task is the person's to choose** (2026-09-03). The button keeps its
  derived default — inspect source, review delta, or plan change — and a chooser
  beside it lists three tasks with one line each: inspect or re-inspect source,
  plan change, and find improvements. The chosen task stays on the button and the
  copy confirmation names it. Find improvements names where the reviewed
  profile and the observed imports disagree, plus unmapped, unruled and empty
  roles, with literal paths, and asks the person what the rule should be; it
  proposes no rule, role name or pattern and writes nothing. A verified agent takes
  the chosen task as its opening turn; a browser copies the same sentence.
- `inspect_architecture` and CLI `architecture` scan supported source imports and
  return `architectureBrief:v1` with `conforms`, `violated`, or `unknown`.
  Observed role edges retain value/type-only/unknown usage counts and exact
  receipts. Unsupported languages, unknown import usage, unmapped edges,
  unruled edges, and empty roles fail closed; absence of evidence is never a
  green result.
- **At workbench width the screen is a canvas with docks, and it does not scroll**
  (2026-08-30). The canvas holds the full height; the role's own answer, the rule
  sentences, the mark legend, the applied scopes and the dependency-direction prose
  open in a 380px panel beside it — by clicking a role, by the "Roles and rules"
  button, or by a link naming a role — and Escape closes it. The continuous
  contract/observation/delta ledger opens in its own 360px panel. Role, rules, and
  evidence panels are mutually exclusive, because two at once leave a laptop canvas
  too narrow for the drawing. The 44px evidence summary stays above the canvas at
  every width. Below workbench width the panels return to the document flow.
- **A violated crossing is drawn as one** (2026-08-30): always visible even when it
  skips a role, in the same tone as the `Violated` pill, dashed so it reads without
  colour, with its own legend row and the same mark on its sentence.
- **Each role box carries its own ledger** when a persisted receipt exists
  (2026-08-30). One line under a ruled separator states what that role's own
  outgoing edges did and how many imports leave it — `✓ none recorded · 411
  imports`, `⊘ 2/5 edges violated · 38 imports`, `at least N violated` when the
  receipt's violation sample was truncated, `○ no source matched` for a role the
  receipt lists as empty. It is never a per-role verdict: `conforms` /
  `violated` / `unknown` stays profile-wide in the evidence summary, and no box ever
  says "unmeasured", because unmapped and unruled edges carry no role. Without a
  receipt there is no ledger at all rather than a row of zeros — in a browser,
  which cannot read a source folder, that is the ordinary case. Status is a
  glyph, never a colour.
- The short agent action sends a state-bound inspection or change request. In the installed
  app, an exact CLI fallback is included only when the project source binding,
  vault path, and Atlas CLI entry are all verified absolute paths; otherwise the
  packet says the fallback is unavailable instead of inventing a command.
- At narrow widths the role model remains first in document order. Open evidence
  and role panels scroll into view without covering the persistent bottom tabs,
  whose reserve stays part of the workbench.

**Import direction is drawn as depth** (2026-09-08). The reviewed ladder stands on stacked translucent planes, one per layer, stepping 14 px per rank so the stack shears along one line and reads as a solid: an allowed import runs down onto a lower plane in indigo, a violation is the stroke that climbs to a higher plane in the danger tone with a halo that rises when either end is selected. Plane fill is capped under a role's own face so depth never inverts; the lit top edge carries the reading. Measured at 1512 and 1280: overlap count 0, every label at or above 4.5:1 on its plane, height up 1.6 to 2.8 percent, width unchanged.

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
- One row at the top points at `/library`, where Sources and Wiki went on 2026-09-06.
  It is permanent, and below `lg` — where the rail is replaced by five bottom tabs
  that do not include the Library — it is the only way in.
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

### `/library` — Library (2026-09-06, its own destination)

A vault holds three kinds of file and **only one is the graph**. Docs draws that one; this
destination draws the other two.

The Library supports general knowledge as well as documents associated with code.
Sources remain original files; write-ups and filed answers remain wiki pages.
Documents-only folders need no code nodes or separate mode switch. The ontology
retains its codebase scope.

**Retained questions and explicit revisions.** The Library landing lists saved
questions and the tips of their answer histories. It distinguishes source-byte
changes, missing or new originals and unmeasured evidence; observations never
become source-read proof. A deliberate agent request produces a structured draft
for comparison. Saving creates a new file, checks concurrent edits, preserves
the previous page and exposes competing branches. Narrow comparisons switch
between old and new text. The [record and boundaries](RETAINED-ANSWERS.md) describe
the Markdown metadata and the limits of those checks.

Library validation follows the current folder membership. Removing or restoring a
cited source or a linked wiki page updates the affected verdicts even when the
citing page is unchanged. Cached bytes avoid rereading unchanged pages; deleted
pages and old revisions are withdrawn from the text supplied to page-write review.

The MCP source reader preserves valid quoted CSV/TSV records across embedded
newlines. Row addresses keep their physical starting lines, while pagination
advances by record. Repeated normalized DOCX headings receive distinct anchors;
existing unique heading addresses stay unchanged. Reader notes identify ambiguous
legacy addresses and malformed quoted remainders. Original bytes and existing
wiki citations are not rewritten, and a matching source hash does not prove that
an old ambiguous citation identifies the intended passage.

It shipped inside the Docs sidebar on 2026-09-05 and moved out the next day. The owner
read the merged screen as cluttered and asked whether gathering documents belonged inside
Docs at all, and the measurement agreed: five capped lists shared one 280px column, so
Sources and Wiki took 22dvh each while the document tree lived on what remained. Docs went
back to the ontology's Markdown; the Docs sidebar keeps one row pointing here, which is
also the only way in below `lg`.

**Two panes.** The index on the left carries one of Sources and Wiki, chosen by a switch at
its top, with that list's own doors. The right
pane branches on the kind of file selected — a wiki page opens in the reading pane every
Markdown surface here shares (`src/widgets/doc-reading-pane/`), headed by its title, its
author and status, and a chip per source it was built from; a source opens as the six
facts the folder holds about a file Atlas has never opened (path, format, size, state and
sha256 or "not measured") plus one door that reveals it in Finder or hands over the bytes.
With no folder open the whole screen is one centred stage naming the two kinds of file and
offering the picker, and a folder that is open but holds nothing gets the same grammar with
the two doors instead. **With a folder open and nothing selected, the right pane *is* the folder's graph**
(2026-09-12, restoring 2026-09-06). Above it sits one `text-label` row — the canvas's own
counts caption, then the step facts as pressable clauses (`Compile next: <source>` opens
Compile and its brain picker; `N sources changed` lights that citation and its two ends
without moving a mark; `N off-template` presses into the check report, whose one door with
live state — a count, *running*, *unseen* — is the index's own row) — and then the doors
`How to use`, the saved questions, and the existing `Conversation`. `How to
use` holds the three source-to-wiki steps in an anchored popup and raises itself once per
machine; at exactly one saved answer the questions door is that question, so reopening it
is one press. Selecting a document replaces the canvas and gives it back on close. Below
`lg` there is one column — the graph above the index — the strip keeps its lead clause, and
the rest of the doors fold into one. A folder that holds wiki
pages and no `kind:` node opens here rather than on the map: it is a wiki on its own, and
an empty canvas had nothing to say to the person who chose it (ledger, 2026-09-06). A
folder with even one node still opens on the map.

**What to do next, one press from the graph's header** (2026-09-06, third and fourth
pass). The owner opened the new destination and said they did not know what to do on it;
the pane at that moment was either "Nothing gathered yet" or the first wiki page, opened
on the reader's behalf. The answer was three steps in the order the work happens — and
later the same day, reading the installed app, the owner moved them off the pane
(*"shouldn't the Library tab's default be the graph? … the area underneath should be a
popup"*) and then read the popup itself as broken: *"why does this design look like this?
It looks broken … the sizes inside the right panel are no good … and it overlaps this
text."*

Measured on that frame at 1512×982, on a folder with nothing in it: the panel was 560px of
a 1168px pane and its lower half lay across the canvas's own legend; its first card carried
about 130px of empty space between its numbers and its buttons, bought by stretching three
cards to one height; each card held a paragraph, a four-row label/value table, buttons and
a footnote; and it raised itself over a folder whose header, strip, canvas sentence and
both index lists were already saying the same emptiness.

So there are now two shapes and neither is that one.

**An empty folder is an empty state.** With no sources *and* no pages — exactly the
condition that makes the canvas draw nothing — the whole screen is one centred stage in the
repository's own empty-state grammar (`PAGE_COLUMN_STAGE`, 640px, dashed edge, first
overlay): eyebrow, one title, one sentence, the two doors **Add files** and **Find
documents**, and one quiet line naming the folder a drop goes into. No index, no canvas, no
caption, no status strip, no popup. Page hairlines at 1512 fell 63 → 12.

**With content, guidance is a compact stepper.** **What to do next** in the graph's header
opens a 360px `transientSurface("anchored")` panel of three rows, each one head line
(number, title, and the step's own word), one caption line, and one action row of reserved
height: **① Gather** with the formats the folder holds and both doors, **② Compile** with
what is waiting or behind, the Compile button, **Check the wiki** beside it once two pages
exist, the brain picker when this computer offers two, and — directly under that button —
the one sentence about what leaves this computer or the exact reason it cannot run,
**③ Read** with how many sources are covered and a row that opens the newest page. Writing
and reading back are one step, not two: a fourth row would make the sequence longer than
the work. The heights match because the anatomy does rather than because a
grid stretched them (measured 110 / 158 / 110 at every width, the middle row taller only
when the folder gives step two something to say; the fixed core is equal within 2px). The
panel is positioned from the chip's measured rect, published as `--library-shelf-top` and
`--library-shelf-right`, because at 390 the header wraps and a class-pinned panel covered
the very strip it was opened from. It stands clear of the caption and the legend at 1512,
1280, 1040, 768 and 390 in both locales, proven with `elementsFromPoint`; below `lg` the
legend yields to `sr-only` while it is open rather than being covered. Panel hairlines fell
48 → 33. It never raises itself, and Escape or an outside press closes it with focus
returned to its chip.

The header keeps **one** verdict rather than three turns: *Compile next · 5 waiting · 2
off-template*, or nothing at all when there is nothing to report. Both it and the stepper
read `libraryStepStates`, so they cannot disagree. Two steps can honestly be next at once,
so the one indigo edge — and the one indigo word — goes to the earliest of them while every
other word stays true. Compile is drawn in every state and disabled with the exact reason
rather than hidden, because a missing step two would leave a hole in the middle of the
sequence. Selecting swaps the right pane and moves focus to it, the back control stands at
every width, and Escape does the same thing.

**The index is a switch, and it draws one list** (2026-09-07, fifth pass). One day after the
column became a single scroller with sticky heads, the owner read the same folder in the
installed app and rejected the shape itself: *"I hate this structure: sources on top, wiki
underneath, one long scroll. A switch at the top is better."* The scroller had fixed the
cut rows and not the reading — seven sources and seven pages is still 14 rows, two heads,
five chips and three captions in 280px, so reaching the wiki meant scrolling past
everything about sources, and Compile was off screen from the rows it acts on.

One `SegmentedControl` at the top of the column now names both lists with their counts —
*Sources 7 | Wiki 7*, 32px, equal 125px halves at 280px in both locales — and the column
draws **one** of them. The inactive list is not in the document: `hidden` would keep its
rows in the tab order and its doors reachable from a keyboard while nothing on screen named
them. The doors travel with the list — Add files, Find documents and Bring from a service
on Sources; Check the wiki, Compile and the brain picker on Wiki — and the section eyebrow
is gone, because a head repeating *SOURCES · 7* under a segment reading *Sources 7* is the
same fact twice. The choice is remembered per machine
(`atlas.library.index-segment`), and opening a file from the graph, from the guide or from a
reader's own crossing moves the switch to that file's list, so the index can never name one
thing while the reader shows another.

**The description is a glyph** (owner, same reading: *"put one icon beside the title and
show the explanation in a tooltip on hover"*). The three-line lede was 60px of a sentence
read once and re-read on every visit after; it is now one lucide `Info` beside the `h1`,
carrying that sentence as its accessible name and its panel, so a keyboard and a screen
reader reach it as a pointer does. Since 2026-09-12 the panel carries a second paragraph on
the agent route — what a coding agent's provider traffic is, and that Atlas is not in its
path and does not log it — which is the one place that sentence appears; it used to print
as a paragraph on up to three cards of one journey. The panel opens `bottom`/`start`, under
the row it explains, and is `pointer-events-none`, so it never holds a press underneath it.

**The head is one row, and it has no eyebrow** (owner, 2026-09-12: *"a label like 'in this
folder' is not even needed"*, and of the fold glyph: *"centred the same as the text beside
it, and bigger"*). `IN THIS FOLDER` named the scope of a column that was already showing
it, so it is gone from the head — `LibraryStartStage` keeps it, where naming the scope is
the card's only job. The fold moved onto the title's own line at the column's box edge (331
at 1512), and both head glyphs take the ramp's `lg` step, whose 12.0px of ink is its closest
value to the title's own 13.1px; the fold's glyph had been 9.0px of ink with its centre
29.5px above the title's.

**And the column folds** (*"the left panel must be closable, I may want only the graph"*).
A `‹` at the right end of the title row folds it to the map's own 26px rail tab — vertical
label, `›`, `--topology-index-tab-width` — at `lg` and above, remembered in
`atlas.library.index-collapsed`, with focus following the control that vanished. Below `lg`
the index is the bottom half of one column and has nowhere to fold to.

Rows stay 36px with the name truncated at its end, format and size in mono `text-caption`,
and none crosses the column's side edge at 1512, 1040, 768 or 390. **`compiled` lost its
chip** on 2026-09-06: on the owner's folder all seven rows wore the same green pill, which
is a texture rather than a state, so success is a quiet check in the row's own ink and a
chip is spent only where a person can act. The one local-first disclosure follows the
Compile press it describes — the connect-by-address runner's sentence, under the press, in
the Compile popover or an open source's pane. The agent route's sentence is not that: it
says Atlas is **not** in the path, so since 2026-09-12 it is the index head's glyph panel
and nothing inline, in the guide's step two least of all.

**A toast stands in the corner of the pane it is about** (owner, 2026-09-12: *"the toast at
the top — its position is odd too, right?"*). This surface claims `bottom-right` where the
rest of the app keeps the top centre, and the two walls it stops a 16px gutter short of are
the pane's rather than the window's: the conversation's left edge from `xl` up, and the
bottom tab bar's top below `lg`. While the answer comparison stands — the one
`size="viewport"` dialog this view has left since the graph became the home — both gutters
grow to that dialog's inset plus its padding, so the box lands inside the dialog instead of
across its edge; a dialog that asks a question clears toasts instead, which is what Find
documents does.

The Wiki half carries what the wiki's own work needs, in this shape (merged from the LLM
Wiki round, 2026-09-07): the count on the switch above, then **Check the wiki** and
**Compile** on one unwrapping line so reading stands to the left of writing, then the brain
picker on the line beneath when this computer offers two, and beneath that the single
compile disclosure — only while Compile can be pressed; a reason it cannot is the status
strip's to say. **The column is an index and nothing else** (owner, 2026-09-07, direction
B of three): the switch, the search field, the door row — Check the wiki and Compile — one
row that says where the check's answer is (*Check results N*, above the list, present once
the wiki was ever checked), and the list, whose last row is *New page*. The design council
(2026-09-07) moved the report's door from the canvas header, which is hidden the moment a
page is open, into the column, and New page from an icon chip beside the two agent doors
into the list it acts on, with its own glyph. The app's own record of the last check, the check's findings and the names
without a page moved out of it to a page in the reading pane (*Check results*, below); the
write setting moved to Settings; filing an answer moved beside the answer. **The folder's
findings are not a pill.** A page that misses the
wiki template still wears the amber `off-template` pill, because the fix is in that page's
own bytes; a folder finding — `dangling-wikilink`, `orphan-page`,
`shared-source-unlinked` — is about where the page sits, is true of nearly every row on a
young wiki, and shows as one quiet word on the row with the count carried once in the
header strip. It is the same reasoning that took the green chip off every compiled source.
**Names without a page** keeps its list and its **Propose as node** chips on the *Check
results* page in the pane, five at a time with the map kinds first.

**The two cards above a page speak the reader's language** (owner, 2026-09-12: the cards
read as alien script — a finding code glued to a line number, a citation grammar in
backticks, and the names of a CLI command and an MCP tool, above the page's own Summary).
One `describeWikiProblem` now serves the page's cards, the *Check results* rows and the
revision dialog, so one folder is never described two ways. A finding is one sentence plus
one action — *"No original backs up what is written at line 19 under Facts, line 20. Point
it at one place in one original, or move it into the Not in sources section at the end of
the page if you cannot."* — with every page and original named by its title and pressable
(a page nobody wrote, and a file the finding itself says is missing, are named but never
pressable), the place pressable where the page has a section to scroll to, and two findings
that read the same folded into one row carrying both places. The card's title counts in
words ("2 to fix · page template", "2 connections to check"). The codes, their line
anchors, the validator's English verbatim, the page's own `wiki/<slug>.md` path and the
sentence that `ontology-atlas wiki-validate` and `validate_wiki` report the same codes all
stay whole behind one closed disclosure per card, for whoever is holding a terminal. The
own-shape card carries exactly one action, top right: with a coding agent connected it
starts one turn scoped to that page's shape findings (`buildWikiShapeFixBrief` — restore
the five sections, cite a real place, and **never** invent a citation: an unverifiable
claim moves under `## Not in sources`), and without one it reveals the file in Finder. Its
wording names the checkpoint the person's own write mode actually runs. On the web there is
neither an absolute path nor a local agent, so there is no control rather than a dead one.
The folder card has no action at all: its findings are repaired by editing another page,
and that page's title inside the sentence is the press.

**Below `lg` the whole pane reaches a phone** (2026-09-06, third pass). None of it used to
be drawn there: the pane was hidden whenever nothing was chosen, which is the state it
exists for, so a phone and any window under 1024px opened a folder and got two lists, no
overview and no guidance — a measured zero rect at both 390×844 and 768×1024. The row is
now a column below `lg`: the graph takes the top of it (390: 350×296 of canvas; 768:
648×406), the two lists take the bottom under a hairline, the popup still hangs from the
row so it keeps the column's whole height, and choosing a file swaps the whole column with
the same way back. The index's one scroller was first forced here — two list scrollers sharing half
a phone left the source list 30px and the wiki list zero — and on 2026-09-06 the same
answer replaced the `lg` split; the switch that replaced the stacking on 2026-09-07 is the
same answer again, so the column behaves one way at every width. What does not reach a
phone is the fold: below `lg` the index is the bottom half of one column and there is no
second pane to give its width to. Cases: `the Library pane` and `the graph takes the top of
the column at …` in `tests/e2e/library.spec.ts`.

**The graph is a live force simulation** (2026-09-07). The owner opened the installed
app on the real folder — 7 sources, 6 pages, every page citing 4–7 of them — and read the
picture as a static hairball: near-identical thin grey straight lines from nearly every
page to nearly every source, two mark sizes, and nothing that answered a hand. The
one-shot ForceAtlas2 pass that drew it is gone. `library-force-simulation.ts` steps a
velocity-Verlet model on `requestAnimationFrame`: springs whose rest length is the
relation (a citation 52 world units, a mention 96, so concepts ring the outside of a page's
own sources), many-body repulsion, collision so no mark sits on another, and an
**aspect-aware gravity** — the one non-standard force here, weaker along the canvas's long
axis, which *grows* the cloud into the box instead of fitting it into a corner of one.
Measured at 1512 on that folder shape: the picture fills **93.9% of the canvas width and
90.5% of its height**, against 33.5% before, and the width cap that used to cut the box
down to the picture is gone with it. Above 720 nodes the many-body force switches to a
hand-written Barnes–Hut quadtree — the crossover is measured, not assumed (1.97 ms exact
against 1.73 ms approximated at 800; one whole tick is 0.10 / 0.40 / 1.73 ms at 100 / 300 /
800 nodes). Nothing new is installed: Graphology is no longer imported by this widget at
all.

**Four gestures, and a picture that is still until a hand moves it.** Dragging a mark pins it under the
pointer while the springs pull its neighbours after it, and releasing hands it a capped
flick — on a folder where six pages cite the same seven sources no layout can separate
anything, so *pulling one dot out of the tangle* is the reading operation. The wheel zooms
about the pointer between half and four times the fit; dragging empty canvas pans;
double-click and a `ChromeTile` in the canvas's corner fit the whole picture; a coarse
pointer gets one-finger drag and pinch. Which gesture a press *is* is decided once, at
pointerdown, past a 7px threshold. Hovering holds the mark, its neighbours and their edges
at full ink and dims everything else to 35% over `--motion-fast`. Marks are graded by
degree inside a band that follows the canvas (below), edges are quadratic bows deeper the
longer they run, and every mark clears a halo of the canvas ground one line width wide. Under `prefers-reduced-motion` there is no settle: the
simulation is run to rest synchronously and drawn once, and
`tests/e2e/library-graph-alive.spec.ts` proves the canvas is byte-identical frame to frame.

**Hover changes ink, never position, and a settled picture stops the loop** (2026-09-08).
The canvas used to keep a 0.28px / 7.2s **ambient drift** after it settled, repainted one
frame in four so it would never read as a frozen image. The owner looked at it in the
installed app — *"why does it wriggle whenever the mouse is on the graph? … get rid of that
effect"* — and it is gone: no phase, no clock, no per-frame offset. Measured at 1400×860 on
the seeded folder, three idle seconds went from **362 `requestAnimationFrame` callbacks and
0.74px of travel to 0 callbacks and a byte-identical bitmap**, and a slow hover across the
canvas from 0.58px of mark movement to **0px**. What is left wakes the loop only for what a
person did: hover, focus and selection for their dim ramp; drag, release, resize and a
changed folder for the physics.

**The caption row was the larger half of that**, and it was invisible at the width it was
built at. The line under the canvas swaps the legend sentence for a description of the
pointed-at mark, and the two are different lengths: measured on 2026-09-08, at 1040×720,
768 and 390 the legend wraps to two lines and the description does not, so the row lost
20px and the `flex-1` canvas above it **grew by a whole line-height the instant a pointer
touched a dot**, re-fitted, and moved every mark — fifty times the ambient drift, on every
hover, at every width except the one the picture was last measured at. Both sentences now
lie in one grid cell, so the taller sets the row's height and the visible one never changes
it; the canvas height delta across a hover is 0px at 1400, 1040, 768 and 390.
`docs/DECISIONS.md` (2026-09-08) carries the reversal and what the 2026-09-07 record staked
on the other answer; `tests/e2e/library-graph-alive.spec.ts` owns the standing gate — a
settled canvas that asks for a frame, or a mark that moves under a hovering pointer, fails
it.

**Three composition fixes came with it**, each measured on the same folder. An unattached
mark's ring now starts on the **vertical**, where the fit has slack — the connected mass
settles wider than its canvas, so one loose page at three o'clock used to stretch the
picture to aspect 1.79 in a 1.25 box and leave a third of the height empty; vertical fill
went 0.65 → 0.91 at 1400×860 and 0.49 → 0.89 at 1040×720, and the closest pair of marks
gained 61 → 72px and 30 → 44px of clearance. The ring stands off the mass's **bounding
box** rather than its centre of gravity, so the standoff is the distance the code states
instead of the mass's longest half-span. And a standing name is now legible where the mesh
is densest: it takes **its own mark's ink** (a source's name was set in the edge ink, 1.17:1
from every line crossing it), it is stroked in a **2px** ground halo — wider than the 1.5px
citation line that used to run through the glyphs — and it is shortened **in the middle**,
so `volunteer-email-2026-09-02.txt` and `…-05.txt` no longer render as one identical
`volunteer-email-2026-0…` on two different squares.

**Each group of the folder gets a place, and the ink is sized to the canvas**
(2026-09-12). The graph became the Library's home the same day, and the owner read the first
frame of it as *"an ugly popup, very poor"*. A folder is usually not one graph — the owner's
is four groups: two clusters, one page with its single source, and the files nobody has
written up — and held in one field with one centre the only force with an opinion about where
two *unconnected* groups go is mutual repulsion, whose answer is always the walls. Measured
at 1512×901 on a 1088×819 canvas: three clusters at three walls, a **167px** horizontal band
holding nothing, and **54%** of a fixed 6×4 grid occupied. (The 99.8% bounding-box fill
reported at the same time is the number that cannot see it: four marks in four corners fill a
box perfectly.)

So the groups are **composed**. Each connected component is settled on its own by the same
forces, its measured footprint is packed into a column of an arrangement shaped like the
canvas, and its gravity is re-aimed at that place with cross-group repulsion removed;
collision stays, so no mark ever sits on another, and every distance *inside* a group is
still the springs', drawn at one uniform scale. Unattached files become one more group with a
place of their own — a folder that is one connected mass keeps the ring around that mass, and
that case measured better that way. The arrangement is searched for: every assignment of six
groups or fewer to columns is placed, fitted to the canvas and scored on the grid it leaves
empty, because four earlier forms of the search each optimised something other than what a
person sees and each traded one folder's hole for another's. Measured after, on the same two
fixtures and a sixty-mark folder at 1512×901 and 1040×720: occupancy **0.54 → 0.83**,
**0.50 → 0.63**, **0.58 → 0.88**, **0.54 → 0.67**, and the tallest band **167 → 58px**,
**226 → 80px**, **121 → 38px**, **139 → 58px**. Width filled on the sparsest folder went
**0.62 → 1.00**. The sixty-mark folder is one component and is unchanged.

The ink then follows the canvas rather than the 320px strip this graph was born in. The mark
band grades from the room each mark has — the side of the square it would get if the canvas
were split evenly between them — floored at the 10px top 2026-09-06 measured and capped at
17px, where two marks citing one file would start to touch: twelve marks on 891,000 square
pixels now wear **34px** where they wore 20. The two relation widths, the mark halo, the
name's ground outline and the fit's own padding all scale with that band and never below the
values they were measured at, so a dense folder keeps exactly the lines that shipped. A
page's name takes the ramp step above a file's (`--text-body` against `--text-label`), read
from CSS rather than copied, because the page is what somebody wrote and what this screen is
for. And the canvas stands on the **map's own blueprint grid** (`--map-grid-minor` /
`--map-grid-major`, 24px minor and 120px major in screen space, never moving), so the two
canvases in this product share one floor. Every mark still clears the 3:1 non-text floor over
the worst of that ground — page 12.77:1, source 5.74:1, concept and edge 4.90:1, the selected
node 3.97:1 over a major grid line — and the grid is 1.07:1 from the canvas it rules.
`tests/e2e/library-graph-picture.spec.ts` holds the occupancy, the band, both fills and the
name placement at both windows on all three folders.

**A press opens a card beside the mark, and the picture shows where knowledge flows**
(2026-09-12). A press used to leave for the page, which is the one thing a person cannot
undo by looking: the owner, on this screen — *"when I click it just navigates straight to
the page; I want a press to raise a popup that shows me something, and for the motion to
show something like knowledge flowing."* A press now holds the neighbourhood's ink and hangs
a ≤320px card off the mark, one gap clear of it and clamped inside the canvas — so it can
reach neither the mark it belongs to nor the clauses above the picture, and it flips to the
mark's other side, or below it, rather than spilling off an edge. The card says, in this
order: the mark's own glyph, its name and its kind; one sentence (a page's `## Summary`
opening sentence, a file's format · size · state, a concept's place); one facts line, amber
the moment a citation cannot be vouched for; the marks at the other end of its relations with
each one's state, five of them and a door to the rest; then the doors — `Open`, which is the
commit the press used to be, `Ask for a redraft` where a stale page has something that could
write one (the folder's existing Compile brief, not a second write path) and the sentence
saying why where it has not, and `See it on the map` for a concept. Escape, a second press on
the same mark, a press on the empty canvas and the card's own `✕` each close it and give the
canvas its keyboard back; a double press is still the shortcut straight to the page.

Three motions carry the direction, all bounded: while a card is open its **citations drift**
from each original toward the write-up — one 9px dash period per 900ms canvas settle budget,
measured at 10px/s, stalls 0 and cv 0.33 on a real 60fps recording sampled at 66ms; the
**amber midpoint** of a citation the folder cannot vouch for breathes once per 1.8s while its
card is open, and once for every standing dot as the home arrives; and a page Compile has
just written **brightens** while its own citations drift once toward it. Under
`prefers-reduced-motion` each becomes a still equivalent — a chevron on the line and a
full-size amber dot — and the canvas is byte-identical frame to frame with a card open.
Nothing else moves: at rest, and with a concept's card open, the loop asks for zero frames.
The added frame cost is +0.05ms at 372 marks and +0.53ms at 992 (`< 2ms`, gated in
`library-force-simulation.perf.test.ts`); in a browser a frame with a card open averages
1.29–1.74ms at 372 marks. `tests/e2e/library-graph-card.spec.ts` holds the geometry, the
three ways out, both commits, which lines flow, the bounded arrival breath and the frame
budget; `library-graph-card.test.ts` sweeps 1,638 mark positions for the two rules a
screenshot cannot check — the card never covers its mark, and never leaves the canvas.

**A stale citation is visible on a small folder and calm on a large one** (2026-09-13). Every
unverified citation carries its amber dot at rest, at every window, up to **64 standing dots**;
past that the picture stops repeating the fact and the strip's `N sources changed` clause says
the number instead. The dots are still drawn for the citations a reader has in hand — the open
card's own, the pointed-at mark's neighbourhood, and every one of them while that clause is
held, which lights both ends and prints both counts — and it is all or nothing above the cap,
never a sample, so an undotted citation cannot be read as a fresh one. The budget is the
canvas's own ink: the standing amber holds no more than **4%** of it at rest. Measured on the
four picture fixtures at 1512x901, 1040x720 and 1920x1080: the three folders under the cap are
unchanged pixel for pixel (the six-document folder keeps its 97 strict-amber pixels at 1512),
and the three-hundred-source folder with 480 unverified citations goes from 5,202 amber pixels
and 15.57% of its ink at the narrowest window to 0, with total graph ink down 9.5-22.4%.
`tests/e2e/library-graph-picture.spec.ts` holds both arms and the three routes back.

**The original and the write-up cross both ways** (2026-09-06). A wiki page's header names
the action: one cited source is a single **View original** button carrying the file name;
several keep a list under the same words; a citation naming a file that is not in the
folder is drawn as plain text, because a door that leads nowhere is worse than a stated
fact. Both crossings are drawn as list rows at the index's own 36px step rather than as
32px chips, because opening a document is one job and it was carrying two heights
depending on which pane a person pressed from; the source pane's label column moved 132 →
148px for the same reason, matching the shelf's. A source's pane answers the other direction with **View write-up** — every page
citing it, each marked `current`, `part of the file`, `behind`, or `not checked` from the
sha256 it recorded and its own truncation record
— and, when no page cites it, the Compile button in that row's place. `not checked` is its
own word because hashing is lazy: reporting an unmeasured file as `behind` made this pane
contradict its own state row, which reads `checking` in exactly that window. Both directions are derived in
`buildLibraryPairing` (`src/entities/docs-vault/lib/vault-library.ts`) from the same
`sources:` and `source_hash:` frontmatter the state machine already reads, so no second
store can drift from it.

**A citation shows the passage it names** (2026-09-11). Pressing
`[[src:sources/settlement-policy.md#l14]]` opens the source's pane as before, and the pane
now reads that one file and renders the unit the anchor names under a **Cited passage**
section (`library.source.passage.*`) — verbatim, at `text-body-lg` on a soft card, with up
to two units either side at `text-caption`, because a hard-wrapped line ends mid-sentence.
The label is the extractor's own precision and no finer: `line 14` for a line, `record 3`
for a CSV record, `heading: Records` for a Word heading, `sheet Quarterly · row 3` for a
workbook row. A heading address names the heading **and** the paragraphs beneath it, so a
DOCX section arrives whole. An address the file no longer holds says exactly that and
shows **no** text — the paragraph beside a renamed heading is not the cited one — and
names alternatives only where the extractor itself reported that heading occurring twice.
A PDF keeps its page number and the Finder door. The bytes come from the handle the folder
walk already granted (`read_vault_binary_file` in the app, the File System Access handle in
a browser, one ability on both surfaces), the text is stored nowhere and dropped when the
pane closes, and nothing leaves the computer; the pane therefore stops saying Atlas has
never opened the file, and its sha256 row says it was measured on this read. The splitter
is `src/shared/lib/source-passage.ts`, the MCP `read_source` reader's twin, pinned unit for
unit by `tests/contract/source-passage-parity.contract.test.ts`; it carries its own
raw-DEFLATE decoder (a Word or Excel file is a zip, and the app's macOS floor does not
guarantee `DecompressionStream`) and verifies each zip entry's CRC-32, because what it
renders is offered as the document's own words. Measured on a six-source folder: 70 units
across Markdown, CSV, HTML, DOCX and XLSX, byte-identical between the two readers, and 26
of 31 citations resolving — the other five are two pointing at a file the folder does not
hold and three addresses their files no longer have, all of which a reader could only
discover before by opening the documents themselves.

- **Sources** — every non-`.md` file under `sources/**`, listed by name, format, size and
  one state. Listing one opens nothing; the walk records what a directory listing already
  holds, which is why a folder of PDFs adds nothing to the map. The one read is a
  **citation's press** (below), and it is that file only.
  - `not compiled` — no wiki page cites it.
  - `compiled` — a page cites it and the sha256 it recorded still matches the file.
  - `read in part` (2026-09-07) — the hash still matches and every page citing it says,
    through `sources_truncated:` frontmatter, that it read only the first part of the
    file, so the row counts as waiting for Compile and the stepper says in one sentence
    that a second run picks up the rest; a file that then changes becomes `stale` instead.
    It wears the amber `stale` wears, because the shelf counts both as rows to act on and
    a neutral chip on a counted row reads as nothing to do (owner, 2026-09-07); the word,
    not the colour, is what tells the two apart.
  - `stale` — the hashes disagree, or a page cites it without recording one.
  - `checking` — cited with a hash, not yet measured. Hashing is lazy and only ever asked
    for on cited files; the app hashes natively, a browser with `crypto.subtle`.
  - A row opens the file: the app reveals it in Finder (reveal, never launch), the browser
    hands over the bytes it was already granted.
- **Wiki** — Markdown under `wiki/**` with no `kind:`. Each row shows `created_by` and,
  when the page does not fit the contract, the first problem code `wiki-validate` prints
  (`section-order`, `uncited-fact`, …), the folder's own findings included
  (`orphan-page`, `dangling-wikilink`, `shared-source-unlinked`). Only the page's own
  problems and a broken link make a row **off-template**; an orphan or an unlinked
  shared source is named on the row and in the Check-the-wiki brief but not counted,
  because in a two-page wiki with no links yet every page is an orphan. The shape is
  `docs/ONTOLOGY-ATLAS-SPEC.md` §11,
  and `wiki/_template.md` is written into every new vault by `ontology-atlas init`.
  Files under `wiki/` that start with `_` are the wiki's furniture, never pages: the
  template, and `wiki/_log.md`, which the app appends to after each Compile (the sources
  handed over, the pages the folder shows new or revised) and each Check-the-wiki run
  (the counts the report ended with). A person who does not commit their folder still
  has the wiki's own memory; a person who does has a commit body ready. The *Check
  results* page reads the last check back at its head, with its time.

Tour one-click doors: hree one-click doors, plus one that reaches outside this computer:

- **Add files** — app: a native panel, and Rust copies the bytes into `<vault>/sources/`
  so the WebView never holds a document. Web: `showOpenFilePicker`, written through the
  vault handle. A second copy of the same bytes is refused by sha256 and the refusal names
  the file that already holds them. Under the button: the folder is the interface — drop
  files into `<vault>/sources/` in Finder and the list updates by itself.
- **Find documents** — proposes candidates from the open folder and from each bound
  project root, **metadata only**, nothing copied until a person ticks a box in a blocking
  dialog with every box unticked. Document formats only (`pdf docx doc xlsx xls csv pptx
  ppt txt rtf odt ods odp epub`), dotfiles, dependency and build directories, and
  credential-shaped names excluded. Refusals are remembered in `localStorage` per folder —
  a per-machine convenience, never a second store in the vault. Project roots are app-only
  (a binding is an absolute path); the dialog says so and links to `/download/`.
- **Bring from a service** (new 2026-09-07) — the door for documents that are not on
  this computer at all. Owner: *"connecting a service is mostly for the Library anyway —
  people want the things they already wrote somewhere else."* Tiles name services, not
  protocols — Notion, GitHub, and last, a way out to the technical dialog on `/mcp` for
  anything else. **This path never says MCP, stdio, npx or environment variable**; a
  component test asserts that. Three steps: ① the person pastes the one value the service
  issues, with a link to where; Atlas puts it in the keychain, writes the connection into
  the folder with the name only, and switches it on — saying that the **coding agent**, not
  Atlas, is what reaches the service with it; ② the person says what to bring, in their own
  words; ③ a bounded brief opens the Library's existing agent turn, which searches, lists
  at most twenty documents, waits to be told which, and writes each one under
  `sources/<service>/` with `source_url` and `fetched_at` in the frontmatter — **through
  the permission card that already exists**, one card per file, and forbidden from
  touching anything outside that
  folder. **Confluence and Jira left the tiles on 2026-09-07**: both rode Atlassian's hosted
  address, which signs in with OAuth, and the in-app session cannot open that window (the
  measurement is in the decision record); a tile onto a connection the agent can never use
  is the dead end this door exists to remove, so they return with an adapter that can sign
  in. **Google Drive is deliberately absent**: no entry in the committed catalogue has
  verified facts for it yet, and a tile onto a guess is a door that opens onto nothing.
  **What is not proven**: the picking happens inside the agent turn, not on this screen,
  because Atlas is not the MCP client and cannot call a service's tools or receive their
  result as data. Nothing here has been observed against a live Notion or Atlassian
  account; the screen says where the choosing happens rather than promising a list it
  would draw.
- **Compile** — starts one in-app ACP turn whose brief embeds `wiki/_template.md`
  verbatim and names `wiki-validate` as the acceptance test. Enabled only while some
  source is not compiled or stale. Beside it: the coding agent's provider traffic is not
  in `.ontology-atlas/llm-audit.jsonl`. A page under `wiki/` that fits the contract is
  written without a card and the conversation says so in one line (2026-09-07, owner
  direction: agents act, people can step in); Settings › *When the agent writes a wiki
  page* — "Write at once" / "Ask each time" — brings the card back for every page, a
  setting rather than a door because it governs every Compile, Fix and proposal (owner,
  2026-09-07: two chips beside the doors read as scattered). A page that does not fit,
  and for a page under `wiki/` the card shows the verdict first: the page as the write
  would leave it (a whole file, or an edit applied to the page on disk), judged against
  the contract, one quiet line when it fits and the codes with the first message when it
  does not. Allow and Don't stay where they are; the gate is the person.
  The dock opens on this screen, above `AcpDockHeader` a lucide `Library` glyph and the
  destination's name: Compile is a job, not a place, and the job runs beside the shelf it
  is compiling. The brief lists the pages that already exist and asks the
  writer for one page per source, named after it and never folded into another (a page
  is what one document said), to link the pages it touches both ways, to record a
  disagreement on both pages with both citations, and to write nothing for a source
  that adds nothing. Updating the same source reuses its own page. The brief compares
  claim scope, source dates, source approval/draft status and policy/observation roles
  before leaving a difference unresolved: an explicit approved replacement is recorded
  as such, while recency alone or an observed configuration does not change policy.
  It also asks the writer to revisit existing gaps on updated pages, resolve only the
  parts new evidence answers, qualify obsolete absence wording and keep unanswered
  source-specific limits. Personal notes remain attributed and verbatim; retained
  answers still require their separate refresh/revision action. These are instructions
  to the agent, not a semantic validator or a filesystem protection guarantee.
  The ACP brief supplies the measured Compile click time for `compiled_at`, so the
  agent receives a concrete value to copy without querying a shell or inferring a
  date. This is request-time guidance, not an app-attested completion receipt.
- **Check the wiki** — starts one report-only ACP turn over `wiki/` for what
  `wiki-validate` cannot decide: two pages disagreeing, a claim a later page replaced,
  two pages that share a topic or a source without linking, and a name on three or
  more pages with no page of its own, which the brief labels an ontology node
  candidate. It modifies nothing; enabled from two pages up, since one page has
  nothing to disagree with. The report ends with one block a program reads — the
  count per category and those names — and the Library opens the *Check results* page in
  the pane, whose **Names without a page** section lists them five at a time, the map kinds
  first, the rest behind a count a person can open; the counts go to `wiki/_log.md` in one
  shape in every language. The
  report sorts each name: something the code builds (a domain, capability or element),
  a person, an organisation, or other. Only the first sort gets a **Propose as node**
  chip, and only in a folder that already holds an ontology — a folder of documents
  with no `kind:` node is a wiki on its own, and nobody who opened it asked for a map.
  The chip starts one agent turn that reads the pages carrying the name and the vault's
  own kinds and domains, then calls `add_concept` once, citing those pages as
  `[[wiki/…]]` links in the node's body. The write reaches the ontology-write card like
  any other; nothing touches the wiki pages, and `describes:` stays the person's to add
  after review. People and organisations stay names in the wiki, linked by the pages
  that mention them: the map is the code's ontology, and this is the one place the
  wiki flows into it, through the person. The brief carries what the script already found (the page
  and folder codes the Wiki list shows) and asks the agent not to repeat them, so the
  model's reading goes to judgement.
- **The local-model route** — when Settings → AI connection holds a verified
  connect-by-address runner (any OpenAI-compatible `/v1` server: Ollama, LM Studio,
  llama.cpp, vLLM), the shelf names that model and its host as the brain. It says nothing
  leaves this computer only when the saved host really is this computer; a runner reached
  over `https://` at another address is named as one, because `normalize_base_url` in
  `src-tauri/src/llm.rs` requires loopback for plaintext but accepts a remote TLS host.
  `.ontology-atlas/llm-audit.jsonl` records each request either way.
  **It compiles** (second pass, 2026-09-06). The 2026-09-06 record left this route a named
  brain because the runner's tool catalogue read and proposed ontology concepts only, and
  wrote its own reopening condition: *a local tool catalogue that reads a source and writes
  a page under one consent card reopens local Compile.* That catalogue is
  `src/features/vault-agent/model/compile-tool-catalog.ts`. Its three Compile-only tools
  stay outside the MCP-mirrored `AGENT_TOOLS`. `read_source_text` opens one
  file this folder's own walk found under `sources/` and this bundle can decode — Markdown,
  plain text, CSV, TSV, JSON and HTML with its tags stripped — and returns it with every
  paragraph numbered `[p1]`, `[p2]`, capped at 8,000 characters with `truncated` stated
  rather than hidden. A PDF, Word, PowerPoint or Excel file comes back **unread and named**:
  reading those needs a parser Atlas does not ship, and shipping one is deferred rather
  than guessed at. Any other path — absolute, `..`, a backslash, or simply not in this
  folder — is refused before the disk is touched. `read_wiki_page` returns an existing
  write-up as untrusted context in sequential 4,000-character chunks. A replacement
  requires the receipt returned after the complete current page has been read; skipped
  chunks, unreadable pages, changed text or timestamps and stale receipts block it.
  The Wiki context counts against the same 40,000-character turn budget, and does not
  establish raw-source citation support. Human notes remain attributed prior context;
  the model is instructed to resolve answered questions while preserving the remainder.
  That instruction is not a guarantee of semantic preservation.
  Local source reads also return up to three related wiki suggestions: an exact shared
  source takes priority, followed by rare lexical terms in titles and cached bodies,
  including a Korean bigram fallback. The index is built only when Compile starts,
  reusing the Library read cache. Results report searched pages, body-cache coverage
  and omitted matches. Cached bodies are isolated by folder session and page version,
  so switching to a same-named page in another folder cannot reuse its predecessor.
  Suggestions carry no truth, currentness or complete-read authority;
  a match still requires `read_wiki_page`, and no match does not prove absence.
  Existing inventoried nested Wiki pages keep their exact paths. Retained answers
  under `wiki/answers/` use the explicit answer-refresh/revision workflow instead
  of ordinary Compile replacement. `propose_wiki_page` takes fields, never
  Markdown: Atlas assembles the five sections itself and mints `created_by: model:<name>`,
  `compiled_at`, `sources:` and `source_hash:` from the bytes it actually handed over, so a
  page cannot claim a document the model never opened. **It writes nothing.** The turn ends
  at one card that names, per page, the path it would take, what each of its five sections
  carries, the full current and proposed text, how many citations it holds, which sources it was written from, which were read
  only in part, and which could not be opened at all; only Allow once writes, through the
  same `applyProposal` a concept change takes. The card displays the exact proposed
  Markdown and lets the person switch to the complete previous page; a new page has
  only its proposed preview. Local work owns the reader pane while running or awaiting
  review, including folders with retained questions and an already selected document.
  On narrow screens it uses the whole pane instead of competing with the index;
  closing the work view returns to the previous selection. Before applying, local Compile compares
  every selected replacement's exact prior text and timestamp with a fresh file read;
  a detected correction refuses the write before any selected page is saved. Writes
  remain sequential, with no claim of transactional rollback after an I/O failure.
  Source hashes are computed from the complete buffer read, not a later reopening
  of the source path. A page that fails the contract produces no
  proposal at all, so the card has nothing to offer and shows the exact problem codes
  instead. Beyond the shared `validateWikiPage` rules the proposal adds two: every
  `## Decisions` bullet cites, and **every citation anchor resolves inside the bytes read
  this turn** — the shared validator captures an anchor and never opens a file, so
  `#p47` in a three-paragraph document would otherwise pass and land as a citation a reader
  cannot follow. Three pages per turn, ten rounds. A folder with existing pages targets
  one waiting source per turn to leave room for reading and revising its affected pages.
  A source can have a current write-up while another citing page still needs review:
  changed and unmeasured hashes on any citing page keep that source in the Compile queue,
  and both the ACP brief and local prompt name the exact pages to recheck. Hashes pending
  measurement do not create speculative revision work. Unfinished pages stay queued;
  arrival order alone never establishes which conflicting claim is current.
  The button goes live only for a loopback
  runner, because whole documents now leave the process and "on this computer" has to be
  true rather than named; a remote saved address and a folder whose waiting files all need
  a parser each get their own sentence naming what is missing rather than blaming the
  route. Measured on this machine 2026-09-06 against Ollama: `qwen3:8b` (65s) and
  `gemma4:12b` (82s) each read both sources and proposed both pages with every bullet cited
  and every anchor resolvable; `qwen3.6:35b-a3b` proposed pages with no citations at all,
  which the card refused with `uncited-fact` and no write action.
- **Which brain runs is chosen, not ranked** (owner, 2026-09-06, second pass).
  The Compile request names the selected runner as writer. Local requests use their
  bounded readable target list and three-tool proposal workflow, with paragraph
  citations and metadata supplied by Atlas. ACP requests retain their source
  readers and Markdown template, while saving follows the selected write mode
  and runtime permissions. Chronology, unresolved gaps, personal notes and
  retained-answer rules are shared across both paths.
  A verified coding agent still opens formats the runner cannot, so it stays the **default** — but it
  no longer outranks the runner, because the reason a local runner is set up at all is to
  be pointed at a folder whose documents should not leave the machine, and a precedence
  rule takes exactly that choice away. When this computer offers both, step two's
  **Runs on** row and the index's wiki header each draw one select naming them as the
  shelf already does (`Claude Agent` and `gemma4:12b on localhost:11434`); the answer is
  stored per machine in `localStorage` beside the chat width, both surfaces read and write
  that one value, and the sentence about what leaves this computer switches with it. With
  one brain available nothing is drawn — a select that cannot change anything is not a
  choice — and a stored answer naming a brain the machine no longer offers falls back to
  the one that is there **and stops being stored**, so a preference never outlives what it
  points at. `resolveCompileBrain` is that table, tested as one.

**Graph** (2026-09-06) — **the pane itself** whenever nothing is chosen, drawing the same
two file kinds the lists carry, plus the third thing they reach: a raw
source is a square, a wiki page a filled circle, and an ontology concept a page names with
`[[slug]]` is a ring. A solid line is a citation from the page's `sources:` frontmatter; a
dashed line is a mention from its body — and, since 2026-09-07, the other way too: a map
node whose body cites `[[wiki/…]]` pages is drawn as a ring with a dashed line to each,
so the node the wiki proposed shows its evidence on the Library's own picture. A link
that resolves to nothing is not drawn, and a
source nobody has written up simply has no line, which is the same fact the `not compiled`
word carries in the list. The caption counts what is on the canvas: sources, pages,
concepts, links; beside it stand the status strip and the door to the shelf. A citation is
drawn 1.5px against a mention's 1px, so the two relations read apart without the legend.
**Up to 60 nodes every mark carries its own name** — the page's title, the file's name, the
concept's title — standing under it in `text-label`, secondary ink for a page and
quaternary for the two things it stands on; a screen-space pass claims the marks first and
then each name in turn, sliding one back inside the frame rather than dropping it at the
edge and hiding only a genuine collision, so no two names ever cross. Above 60 the picture
is an overview and a name is something you ask a dot for: hover keeps its box. Pointing at
a dot names it either way; clicking a page or a source selects it here, in
the index and in the reader at once, while clicking a concept opens it on the map, because a
concept is not a file in this folder. Selection is the only place indigo appears: the node,
its ring, and the edges that touch it.

It is **not the map, and separate on purpose** (`docs/DECISIONS.md`, 2026-09-06). The map
draws the ontology, whose nodes all carry `kind:`; neither a PDF nor a wiki page ever
becomes one. This picture answers the other question, what was read to write that down.
Layout is ForceAtlas2 (Graphology, already installed for the map's force pass) run to a
stop before the first frame, rotated so its longest direction lies along the canvas, then
fitted at one scale for both axes so distance means the same thing in x and y. It settles
once, over the 420ms canvas-travel duration, and then nothing moves; under
`prefers-reduced-motion` the settled frame is drawn at once. 500 nodes lay out in 95ms.

**The canvas is the pane, and is cut to the picture** (2026-09-06). It used to be a band
of at most 320px or `34dvh` above the reader, and one scale for both axes meant the height
decided how big the picture was: measured on the seeded five-source, three-page folder at
1512, a 1144px canvas carried a 462px picture — 40.4% of its width, with a 341px gutter
each side — while its height was already 86.6% used. Both premises went. The canvas takes
the pane's height, and it is never wider than the picture plus the fit's own label
allowance, so a cloud squarer than a tall pane leaves its slack split evenly rather than
gathered on one side. Measured after, both locales: **1046×623 of a 1088×900 canvas at
1512 — 96.1% of its width, against 40.4% — and 93.2% at 1040, 93.5% at 768, 88.0% at 390**,
with 21px gutters at every band. The picture itself is 2.26× wider than it was, and its marks are one step larger with it
(a page's circle r5 → 6, a concept's ring r4 → 6, a source's square 7.2 → 10px), because
marks sized for a 320px strip read across that field as specks. A hovered
name is truncated to fit rather than allowed past either edge. The settle also stopped
cancelling itself: its animation frame is held across effect runs, because the width the
canvas takes from the picture arrives after the first measurement and used to kill the
arrival 0.85 of the way in.

**What left `/docs` on 2026-09-06**: Sources, Wiki, the doors, and the agent dock.
What stayed: the review queue, recently changed, the tree, and the editor.

**The wiki index uses readable horizontal rows** (2026-09-09). Titles get up to two lines, with a short freshness caption below. The selected page has an indigo edge; changed or unmeasured source evidence and invalid page format keep distinct amber markers and accessible explanations. Search remains a ranked list. Compile marks the list busy without suggesting per-page progress. The graph opens through a labelled action above the reader instead of compressing the document into a third column.

### `/ontology` — retired tree/ego hub → thin redirect (B3 Hub is soon the map)

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
six-tab maintenance board: five measured questions plus Flow. The old
Browse/Write/Query labels are historical shorthand, not current navigation or
surface chrome.

---

### `/ontology/insights` — Insights (6-tab maintenance board)

The first five tabs derive their numbers from the data source the page already used
(`useOntologyInsight`, `entities/knowledge-graph/lib/ontology-tree`) — no separate persona or
store layer. Flow is intentionally prose rather than another metric: it gives the
agent one visible, reviewable request grounded in the same ontology. **One tab answers one question**: the old `Structure` tab stacked three
different questions and grew to 2.2× the 14-inch viewport, so it was split into
Composition / Connection / Boundary. Scroll contract: every tab stays ≤ 1.3× viewport.

#### Census strip (always visible, 2026-09-06)
- Four equal-height tiles above the tab bar (`InsightsCensusStrip`): concepts (kind chips and the share held by a domain), relations (top types, the hidden remainder named, density), health (the verdict in words, blocking and advisory counts, orphans · islands · cycles), and the last 12 weeks (hairline bars from `weeklyTotals`, a quiet week drawn as a baseline tick). It replaced the corner census line, the audience banner, the Composition hero and the Freshness aggregate trend, which all counted the same folder. Decision: `docs/DECISIONS.md` 2026-09-06.
#### Header
- Title + subtitle
- `TabBar` — Do next (default) / Composition Inventory / Connection Connections / Boundary Boundaries / Freshness / Flow. Tab state in `?tab=`; the first four badges count what their tabs are about (verdict total / nodes / edges / cross-domain relations). Freshness and Flow leave the badge slot empty because neither has an honest single count. Legacy `?tab=structure|overview` → Composition, `?tab=relations` → Connection, so bookmarks and agent return-chip links stay alive.

#### Tab 1 — Do next
- **One row per finding group** (2026-09-06, `lib/do-next-groups.ts`): name · count · disclosure, five rows per opened group with its own "N more"; the first group starts open so the most urgent files are named without a click. Group counts are the verdict's own signal counts re-keyed and `tests/contract/do-next-group-sum.contract.test.ts` pins their sum to the title count. The badge is the single verdict model (`insights-verdict`) shared with the body. The picks band and the readiness gauge are gone.
- **Fix these together** (containment only): a blocking sheet lists one row per proposed write naming the domain document and the key, all ticked and untickable; the plan (members, mtime) freezes when the sheet opens, each row's justification is re-checked at Apply, and a file changed since or a concept whose domain moved is skipped and named rather than written. Writes go through `updateFrontmatter` with `expectedMtime`, one document at a time.
- **「First My Share」 two work groups** — the queue is split by the *nature of the work*, not by who you are. **Meaning work / You can fix these right now** (meaning: missing definition · missing area · similar names · promotion candidates — answered by product knowledge) and **Code work / Hand these to a developer or an AI** (neglected hubs · unlinked concepts · dependency cycles — answered by reading the implementation or a dependency direction). With your own folder open the meaning group is **first on screen**, so "83 items, none of them mine" becomes "N mine + M to hand off". Same data, only the order is in human language. Group headings render only when that group has visible rows.
- **Session-ability translation, not role gating** — there are no accounts (local-first, permanent). Three facts the app already knows drive the row actions: ① can this session write to the vault ② has an agent been observed in this folder (heartbeat) ③ does this concept own a document (`hasOwnDocument`). Read-only sample → 「Edit in Workshop」 becomes 「View in Workshop」 plus a copyable command, and the group order flips (hand-off work first, since hand-off is the only completion this session has). No agent observed → 「Verify as Agent」 becomes 「Copy Handoff Command」. **No greyed-out disabled buttons** — a disabled control that does not say why is the same dead end.
- **One-sentence inline write / inline one-field write** (`MeaningGapSection`) — rows for **Meaning not specified** (no `description` *and* no body prose) and **Area not specified** (capability/element with no `domain:`) expand in place: a one-line input, or area chips built from the domains that actually exist in the vault. No new route, no modal, no trip to the workshop. Safety contract: the confirm line names the exact file and key before you press ("File to fix `capabilities/pay.md` · This sentence is in the description"), **cancel changes 0 files** (and a second press is required when you have typed something), the save locks in the pressed frame so double-clicks write once, and `expected_mtime` means a concurrent human/agent edit is never silently overwritten — the row says so and reloads, and the retry merges (their keys survive, only this one line is added). The write target is `resolveNodeDocument(node).ownSlug` — the same single source of truth the workshop uses, so a concept without its own document never gets someone else's file written to.
- **Similar names — are they the same?** (duplicate suspects) — concept pairs whose names/slug/kind/domain/neighbours overlap heavily, top 3 with the shared words as evidence, the overlap percent, a map deeplink to the node worth keeping, and a per-pair `merge_concepts` dry-run handoff. The score is a mirror of the MCP engine's `similar_nodes`, locked by `tests/contract/duplicate-pairs.contract.test.ts`, so screen and agent never name a different pair. Only nodes that own a vault document are considered (a node born from another doc's `elements:` ref has no file to merge). **0 suspects renders no section** — an empty "no duplicates" card is ink without a decision.
- Queue sections show 3 rows each plus their total; the rest is the agent handoff's job (scroll contract).

#### Tab 2 — Configuration Inventory
- **Kind census** card — kind → glyph + bar + count, tallest bar highlighted
- **Domain capacity** card — domain → bar (capability/element sub-counts), hidden when there are no domains

#### Tab 3 — Connections
- **Relation breakdown** — every edge type as a bar row with a `OntologyMapTraceMark` (solid=containment, dashed=depends/relates) + count + percent of total; empty vault gets a "connect them on the map" hint
- **Hubs** — top nodes by degree: kind glyph + title + relative bar + degree, map deeplink per row, "top N / M total" folded into the single footnote line

#### Tab 4 — Boundaries
- **Domain coupling** — a domain×domain **heat grid** (rows send, columns receive; the diagonal is inside-one-domain connections in neutral). Cell shade is a 4-step indigo alpha ladder and every non-zero cell keeps its number, so the card never speaks in colour alone. Picking a cell opens that pair's relation-type counts and real example edges (map deeplinks) in a slot that is reserved whether or not anything is selected. Top 6 domains by cross activity; beyond that the footnote says "top N of M domains" and how many cross links fall outside the grid. Same `computeDomainCouplingMatrix` output as MCP `domain_matrix` — no new calculation.
- **Boundary pressure** — per-domain inside vs cross ratio; a high cross share signals a leaking boundary
- Cold start (fewer than 2 domains or no cross edges) shows one explicit empty state **with a next step** (map editor link) instead of a misleading table

#### Tab 5 — Growth (formerly Freshness; `?tab=freshness` still lands here)
- **What the folder holds, and how it got there** (2026-09-09, `VaultHistorySection`) — the tab opens with the folder's present: four layers (concepts, architecture, wiki pages, raw sources) each drawn as a bounded pile of blocks that assembles itself row by row over a fixed 600ms, whatever the folder's size. **The pile is a fixed size and the block carries a stated quantity** — the largest layer fills 36 blocks and every other layer is drawn against the same block, so a folder of forty and a folder of forty thousand produce the same picture and only the sentence under it ("one block = N files") changes. Magnitude is the numeral under each pile; the pile carries accumulation and proportion. A layer at a true zero keeps a dashed rule, so "none" and "not counted" never look alike. The present needs neither Git nor timestamps, so it draws everywhere.
- **Week by week, where Git can say so** — on the installed app the same four layers also draw as weekly tracks, replayed backwards from the folder's own Git history (`git log --name-status`, 1500-commit window) and held only while the screen is open; nothing is stored, and a rules version is stamped so an old picture is never redrawn by new counting rules. Never a stacked area and never a blended total: on this repository concepts fell 107 → 71 while documents rose, the comparison a moving baseline destroys. Under the chart, in words, the two facts a forty-pixel column cannot state: the week a layer began and the week it grew most. Four states — a browser has no Git bridge, a folder may have no commits, a read can fail, and each says which rather than drawing zeroes. Reduced motion draws both figures finished on the first frame with no schedule. Decisions: `docs/DECISIONS.md` 2026-09-09.
- **Domain freshness heatstrip** — one row per domain, a week-by-week heat strip (neutral ramp, current week in indigo) built from real vault `updatedAt` values (`FRESHNESS_WINDOW_WEEKS`); domains with no dated docs are excluded from the stale count rather than counted as stale ("unknown" ≠ "old"); stale domains get a dashed "stale" tag
- **Recent updates** — most recently touched nodes with kind glyph, domain, and ISO date; footer shows total stale-domain count

#### Tab 6 — Flow
- Answers “what is this product and how does it move?” with an agent-written narrative rather than an invented graph score.
- Analysis owns one ACP dock outside the keyed tab panel. Every tab can explicitly seat its own read-only question in that one conversation; merely switching tabs never sends, replaces a draft, changes the request origin, or starts another session. Replacing a non-empty draft requires a second explicit action.
- Shows the exact Flow request before handoff. In the installed app, **Explain the flow with ACP** opens that Analysis-owned dock and prefills the composer without sending; the person still owns Send and stays on Analysis.
- In the browser or built-in sample, where no local agent process can be launched, the same request remains visible and copyable instead of presenting a dead control.
- The request asks the agent for exactly six `###` scenes over one representative meaning-to-implementation chain. It permits only Atlas MCP reads, caps full-body reads at 12 concepts, requires at least one exact fully-read slug per scene, and preserves `partial`, `visible-gap`, `unknown`, `stale`, and `unverified` limits.
- A completed answer offers **Present this answer** only for the exact app-authored Flow request sent in the current turn. Each scene needs at least one `body: full` anchor from that turn; only fully read anchors become evidence badges. Mentioned neighbours are not promoted to read evidence. The tool audit accepts matching Claude and Codex Atlas envelopes, and written typed relations must match the loaded graph, including kind-checked containment aliases. Missing anchors, foreign tools, invented relations, and out-of-range scene counts fail closed.
- Presentation is an ephemeral projection inside the Analysis ACP dock, not another result record or route. Back/Next changes only the current scene; citations remain visible evidence, and **Follow on the map** is a separate explicit action. Limited scenes use an explicit label and dashed amber boundary; **Ask about this scene** only prefills a follow-up. Nothing auto-sends, writes, or persists, and restored chat history does not recreate a presentation.

#### Bottom handoff row (`InsightsHandoffRow`)
- One copyable `query_ontology(...)` chain per active tab — the tab's question translated into the agent's execution order (connections → `centrality` then `blast_radius`; boundaries → `domain_matrix` then `match_edges`). It stays available in the browser and whenever the installed-app ACP dock is closed; the open dock replaces rather than duplicates it.

Empty state (0 nodes): link to `/docs` (open vault).

---

### `/topology?workbench=edit` — contextual meaning editor and change review

- 2026-09-06: the reason field (`Why this relation exists`) grows with its text from three rows to eight, then scrolls inside itself (`Textarea autoGrow`/`maxRows`); the map's utility rail (fit, tour, shortcuts, replay) waits one `--motion-base` before collapsing its labels, so a pointer crossing the 8px gaps between tiles no longer sees them blink.

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
  "Confirm and write" creates the file.
- ACP keeps read tools frictionless. Every Atlas write tool pauses the same
  conversation on a typed change card, hides `allow_always`, and resumes only on
  `allow_once`; rejection is `reject_once`. The tool-mode policy is checked against
  the generated `tools/list` surface so a new tool fails closed as a write.
- Batch writers preserve and display every requested row in protocol order. The
  review accordion selects one exact item at a time for the map preview, while
  allow/reject applies honestly to the whole batch; the first item is never used
  as a stand-in for hidden rows.
- `/ontology/studio` and `/ontology/edit` remain only as compatibility addresses.
  `node/mode/edit/via/review` are translated to `p/workbench/edit` on `/topology`.

<details>
<summary>Retired Compass Stage details (historical reference)</summary>

The following behavior described the removed Studio UI. It is retained only to
explain old screenshots and decisions; none of it is a current destination.

- This is the **write screen** that fills in a concept's description and relationships. It places the node currently being edited large and centered on the screen, fixing the direction for each relationship type: up = parent concept (is_a), down = what this concept contains (contains), right = what this concept depends on (depends), left = similar concepts (relates). Directions must always remain constant so users do not need to re-read them every time. It opens from the "Workshop" in the left vertical menu. **There is only one screen, differing only in how much is filled, with no mode-selection tabs.**
- **Enhancing existing nodes**: Opens an existing node (specified via a `?node=<id>` link; if unspecified, it automatically selects the capability with the most relationships) to fill in missing relationships. Already-filled relationships are drawn as indigo solid lines with small cards at their ends, while still-empty relationships are drawn as **empty spaces** with dashed lines (these are empty cells with only lines, not decorative icons). A "Start filling here" prompt is attached to only one of them.
- **Creating new nodes (`?mode=create`)**: Opens the same screen entirely blank — a draft card for kind/name/domain/definition and empty relationship slots in four directions. Before saving, it separately notifies the user of "1 new node, N relationships." If the name is similar to an existing node, the user can choose between "Open existing node" and "Create anyway." However, if the kind and name match so closely that the file slug also overlaps, only "Open existing node" remains available; saving, save-previews, and change-previews are all blocked. The name input field is linked to this warning so screen readers announce it as well. Results are previewed in real-time while typing.
- **Files change, not just the screen**: Filling an empty relationship slot writes directly to the frontmatter relationship list of the actual `.md` file (`localVault.updateFrontmatter`). In read-only vaults (e.g., samples), it instead copies a **bundle of MCP commands** for the AI agent to the clipboard. The target to connect with is selected from the list that appears immediately at that spot or created via "Create new."
- **Concepts without their own files are asked first**: Many concepts in the vault exist only because other documents listed their names in relationship lists, meaning they lack their own `.md` file (in this repository's vault, 198 out of 294). Since relationships are stored within a concept's file, one must create a file first to link relationships to such concepts. Because creating new files on the user's disk is something the user has never explicitly requested, **the system shows the file path to be created and asks for confirmation once** at the moment of saving. If cancelled, no files change (written content remains as a draft). If confirmed, a document containing both the relationships and the **path already pointed to by existing documents** is generated in a single write operation. If the kind cannot be determined, it does not arbitrarily decide but lets the user choose. In read-only vaults, it provides an MCP command bundle including `add_concept`.
- **Enabled actual saving of parent concepts (is_a)**: "What kind of thing is this node a kind of?" was the most frequently empty item in the vault. Therefore, we added the `broader` key (the name used in SKOS standards) to the frontmatter and actually added it to graph calculations, schemas (mcp/cli), and gates so all components recognize this key. When filled, the dashed line becomes a solid line.
- **How to show how much is filled**: Displayed via the borders of the four sides of the central card (dashed for empty sides, solid for filled sides). Below that is an easy-to-understand explanation ("Filled 2 out of 4"), and in the top-left corner is a small compass icon indicating what to do next. Game-style displays like percentage pie charts, levels, or grades are not used.
- **Separated two seemingly similar questions (2026-07-28)**: The top button row is for selecting the node's **kind**, and the relationship slot in the up (↑) direction is for recording the **`broader` relationship**, i.e., "is a sub-concept of which concept." These are different facts. Therefore, the button row has a visible single-word label "Kind / Kind" connected via `aria-labelledby`. The English question in the upper relationship slot is `What is this node a kind of?` — the previous phrase `What kind of thing is this node?` was corrected because it literally read as asking "the kind of this node."
- **Does not open below 1024px width and explains why (2026-07-28)**: This screen consists of a fixed-width card and relationship slots placed around its perimeter, making it unworkable on narrow screens (the installed app has a minimum width of `minWidth 1040`, so such widths do not appear at all, and the Workshop is excluded from mobile bottom tab bars). Links entering in `<lg` width from three sources ("Edit Relationships" in node details, Insights, Document frontmatter) now receive a single card explaining **why** (1024px width is required and it opens immediately when the window is widened) and **where to go** (Map · Desktop app). The Workshop screen itself is not drawn, nor does the first-visit guide appear on it — because introducing a non-existent screen would be a lie.
- **Design**: Follows the same rules as the rest of the app — achromatic + one indigo + using only `--color-*` tokens. Amber (orange) is used solely as a signal for "places that should naturally be filled but are empty." **Gems · particles · gold as rarity are still out**; glow and gradients are allowed since 2026-09-08 when they mark a state (the game-style exception was abolished on 2026-07-24, and the product-wide bans lifted on 2026-09-08). The only motion is a change in opacity and color over 200ms when filling a relationship slot, and even that stops under the `prefers-reduced-motion` setting. All screen text uses plain language ("What kind of thing is this node?").

</details>

**2026-09-06, the conversation and the workbench**: the meaning workbench keeps one 50px header band, a `tablist` of its sections (Meaning · Findings and history · Conversation) and one close button; the transcript, slash menu, history and presentation body scroll under `.atlas-scroll-quiet` (no visible bar, scrolling intact) and follow new text smoothly within one viewport, instantly beyond it, never under reduced motion; runs of three identical lookups fold onto one row with a count; the permission card caps at 45% of the panel with Don't and Allow outside its scroller. A dock with no header of its own (Library) wears `AcpDockHeader`, title and one close, so no screen has two. Later the same day the owner read the Meaning and Findings views as walls of same-grey prose: the Meaning view now leads with the one action (analyze) and its caveat, then what is picked on the map, then the map-label switch, then the glossary folded under one question; the Findings view puts the version picker, refresh and re-analyze on one control row, the scope as heading with outcome · basis · evidence count as one caption, the findings (with the map-question switch only when there are any), the answer, the details, and the caveat once at the foot; hairlines set the groups apart. The conversation's default width moved 420 → 460px (`CHAT_WIDTH_DEFAULT`). The Meaning view also counts the relations in scope whose `relation_notes` sentence is empty and offers **Write N missing connection reasons**: one bounded agent turn (12 notes) that reads both documents with `get_concepts(body: full)` and proposes the sentence on the source document through `patch_concept(expected_mtime)`, every write stopping at a permission card. On the map, an edge's hover card and click card lead with that recorded reason when it exists and drop the templated sentence ("A holds B") to a caption; without one the template stands. Measured 2026-09-06 on the dogfood graph: 31 of 242 edges carried a reason, and no containment edge did. Later the same day: the edge card opens beside the dock too (it used to yield to the workbench, which only renamed its header) and says in one caption when no reason is recorded; the conversation's status word carries a clock ("thinking · 1m 12s") and the corner chip says how long the agent has been at it, from the turn's own start; closing the dock while a turn runs keeps the panel mounted so the session finishes; a saved analysis arrives as a toast with "open saved result" instead of a permanent footer; a permission card titles the change in plain words derived from typed facts ("Writes 8 connection reasons in ontology-atlas"; a missing target gives "Updates this document", never a guess), leads with an operation chip and the document address, names frontmatter keys as words with the raw key as provenance, renders a map of sentences one target per line, stacks before above after only where the change set holds a previous value, and keeps the buttons outside its scrolling body; the Library's off-template callout and the conversation's notices dropped their amber fill for the neutral surface, amber staying only where a write leaves the person's own folder. A readability pass the same afternoon gave both views one control step (every button, chip and select 32px, 12.5px text, one filled primary per view), sans section labels in place of the mono caps eyebrow (Korean read as spaced glyphs in mono), a version picker that no longer truncates at 460px, and fewer hairlines (Meaning with nothing picked 3 → 1, Findings 4 → 2). That evening the toasts left the bottom-right corner, where the agent dock hid them, for the top centre under the map toolbar (`--app-toast-top-offset`, 72px on the map, 16px elsewhere), centred over the map area rather than the viewport when a dock stands on the right (`--app-right-dock-width`, now published from the dock's own width state); the box is drawn from the design tokens (elevated surface, hairline, one 14px status icon in the tone's ink, `text-body` message, one quiet indigo action, a close button that appears on hover at the right end), and a message raised twice while its toast is still up refreshes that toast instead of stacking a twin. The conversation's default width moved 420 → 460 → 520px (`CHAT_WIDTH_DEFAULT`), now a ceiling rather than a fixed number: a width nobody chose leaves the map 540px rather than the 480px floor a drag may cross, so the app's smallest 1040px window opens the conversation at 436px and only a 1124px window or wider gets the whole 520 (`defaultChatWidth`, and double-clicking the edge returns to that same screen's number). Its composer's footer became a container that answers to its own box rather than the window: below 540px of composer width the tool and mode pickers take a row of their own and the status word, its clock and the session buttons take the row beneath, and a picker never renders narrower than 104px, so a long name truncates to its first word instead of to its chevron. Measured on the built export at 1512: 211px per picker at the default width, 111px at the panel minimum of 320px, and one row again from a 632px panel. The Meaning view also counts the relations in scope whose `relation_notes` sentence is empty and offers **Write N missing connection reasons**: one bounded agent turn (12 notes) that reads both documents with `get_concepts(body: full)` and proposes the sentence on the source document through `patch_concept(expected_mtime)`, every write stopping at a permission card. On the map, an edge's hover card and click card lead with that recorded reason when it exists and drop the templated sentence ("A holds B") to a caption; without one the template stands. Measured 2026-09-06 on the dogfood graph: 31 of 242 edges carried a reason, and no containment edge did. Later the same day: the edge card opens beside the dock too (it used to yield to the workbench, which only renamed its header) and says in one caption when no reason is recorded; the conversation's status word carries a clock ("thinking · 1m 12s") and the corner chip says how long the agent has been at it, from the turn's own start; closing the dock while a turn runs keeps the panel mounted so the session finishes; a saved analysis arrives as a toast with "open saved result" instead of a permanent footer; a permission card titles the change in plain words derived from typed facts ("Writes 8 connection reasons in ontology-atlas"; a missing target gives "Updates this document", never a guess), leads with an operation chip and the document address, names frontmatter keys as words with the raw key as provenance, renders a map of sentences one target per line, stacks before above after only where the change set holds a previous value, and keeps the buttons outside its scrolling body; the Library's off-template callout and the conversation's notices dropped their amber fill for the neutral surface, amber staying only where a write leaves the person's own folder. A readability pass the same afternoon gave both views one control step (every button, chip and select 32px, 12.5px text, one filled primary per view), sans section labels in place of the mono caps eyebrow (Korean read as spaced glyphs in mono), a version picker that no longer truncates at 460px, and fewer hairlines (Meaning with nothing picked 3 → 1, Findings 4 → 2).

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
- **Construction review** — `Open verification results` reads one local qualification envelope into React session state only and places a full-width review directly below the hero. The default depth keeps purpose, current/next decision, first blocker/diagnostic, red/unknown/conflict, human approval, and exact plan counts visible. `View rationale/diagnostics` expands the same artifact's CQs, source-bound witnesses and citations, examples/counterexamples, seven quality axes, diagnostics, exact review/write plans, and digest equality. The same disclosure also exposes a session-only expert draft for CQ wording, witness source references, and the exact plan; edits are visibly dirty, can be restored, never mutate the receipt/vault/localStorage, and require qualification again before any write. Malformed, wrong-project, digest-mismatched, or unequal-plan envelopes fail closed; post-write maintenance is shown separately and never rewrites the completed qualification verdict. Nothing is uploaded, remembered, or written to the vault.
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

### Library — ask about a passage, and a graph that explains its marks (2026-09-07)

Select eight or more characters in a wiki page and one bar stands just above the first
selected line — where does this come from, does anything disagree with it, explain it in
plain words — with a line for the person's own words at its end. While the bar is up the
rest of the page steps back to quaternary ink, so the selection and the questions are the
only bright things; a press outside the page or Escape clears both. (The first shape that
day, a chip under the selection opening a list beside the text, covered three lines of the
page and took a second press; the owner rejected it on sight.) The chosen question goes to
the docked agent as one read-only turn with
the exact passage quoted, the page named, and the rule to read the page and its originals
and cite them (`buildAskBrief`). A page that cites several originals folds them under one closed line naming the count
(`Disclosure`, 2026-09-07); open, they are chips on a wrapping row, each a press that opens
the source. Six full rows had pushed the Summary below the fold of the installed app. A
page with one original keeps its single row. The graph's legend line becomes a description while a mark
is under the pointer or the keyboard: an original file, a wiki page, or a concept on the
map, each with what its lines mean and what pressing does; the **Names without a page**
header carries a tooltip saying why only map kinds can be proposed.

**Search, and a page of your own** (2026-09-07). One field above the lists filters both:
a source by its path, a page by its title or by the text the Library already holds for
the contract check, with a line saying how many of each matched; the headers keep the
folder's totals. **New page** starts a page a person writes by hand — the contract's
sections, `created_by: human`, empty `sources:` — opens it, and leaves the writing to any
editor; the folder watcher brings the text back and the list says what the page still
lacks.

**Check results, a page in the pane** (2026-09-07). The check's closing block also lists
its findings — a disagreement, a superseded claim, a missing link — each with the pages it
touches. When the check ends the pane opens *Check results*: the last check's record at
the head, one section per kind with every summary whole and each page a press, a **Fix**
chip per row, then **Names without a page** with its Propose chips; the *Check results N*
row above the wiki list reopens it, and a wiki never checked gets the Check door itself. The
page takes the pane only when nothing else has it and only after a check that completed; a
cancelled or failed turn opens nothing and clears nothing, and the focus stays where the
person had it, because a completion is not a press. In the 280px column these had been three-line clips that pushed the page list
off the screen (installed app, six findings and seven names). Fix
starts one agent turn on those pages with the same rules the compile brief holds: both
values with both citations for a disagreement, the current value first for a superseded
claim, links both ways for a missing link, nothing outside those pages. The edits land or
stop at the card exactly as a compile's do, and `wiki/_log.md` records the turn as `fix`.

**After the council** (2026-09-07, evening). A finding a Fix turn completed wears *Fixed ·
check again* in place of its door until the next check re-judges the pages; Fix and Propose
wait while any turn runs. The *auto-allowed* notice in the conversation carries two doors —
*Open* the page that landed, and *Ask next time*, which writes the same setting Settings
owns. *New page* and *File the answer* toasts carry *Undo*, which removes the file just
written. The *Check results* page has the reader's outline rail from two sections up and
the same back-to-top. Below 420px of reading column at `lg` and above the index folds on
its own and unfolds above 460px; unfolding it while narrow is the person's choice and
stands. The fold is one icon control in one place — the panel glyph on the column's
eyebrow line closes it, and the same glyph at the pane's top-left opens it — and the
reader's way back reads *Graph*, the thing it shows, with no arrow (owner, 2026-09-07). A search whose matches all sit on the other half of the switch says so under the empty list and offers the switch, instead of a count over nothing. A page whose first line is a section heading no longer carries the section gap above it. A *Conversation* chip on the graph's status row and on the reader's top row reopens the dock after it was closed; before, closing it was the end of the transcript. The conversation's composer has one quiet row at its bottom, the way chat composers are laid out elsewhere: the tool with its model as one text picker (*Codex · GPT-5.6-Sol (low)*) and the mode on the left, the status word, past conversations, new conversation and send on the right; a tool that has run out of plan is named as a limit with the hour it lifts, not as a generic problem with a retry. The app's Claude follows the terminal login at every session start, and which place holds that login is measured rather than assumed: both of Claude Code's keychain items and `~/.claude/.credentials.json` are compared by digest, carriers that agree settle it themselves, carriers that disagree are settled by whichever the terminal wrote last, and carriers that settle nothing install nothing at all. The winner is mirrored into the app's own keychain item, so an account switched in the terminal reaches the app without a repair. The account name beside a login is a cache each side refreshes on its own clock, not a fact about the token, so the terminal's name travels into the app folder only when it is the fresher of the two. A door pressed into a broken session restarts the session and then sends, instead of waiting behind the old error. The writer label prints only on the rows that are the exception to the
folder's majority writer. The scroll-end gate measures the Library's own scrollers. The
end of a page now keeps room for the floating *Back to top*: the last line stands clear of
the pill instead of ending behind it — on a wiki page, on *Check results*, and on the Docs
reader, which is the same pane — and below `lg` the pill itself stands above the bottom tab
bar rather than behind it (owner, 2026-09-08).

**Observed work stays visible outside the conversation** (2026-09-08). Exact
structured tool targets bind reading, provisional writing and permission waits
to source/page marks without moving the knowledge graph. Unknown targets never
light a guessed file. A bounded, session-local receipt strip distinguishes tool
reads and proposals from observed wiki revision changes or confirmed local writes;
it is not a durable audit log or an attribution of every change to the agent.
Waiting is still, reduced motion retains the state markers, and idle work emits
no animation frames. Existing write permission and validation policies are unchanged.

**Closing the dock puts the conversation away** (2026-09-08). Pressing X on the Library's
conversation used to end it: the panel unmounted, its ACP session stopped, and the adapter
process was killed — so a turn in flight died with the press and the transcript went with
it. The panel now stays mounted behind the shut frame. The frame is what closes, in the
same width movement as before, and while it is shut it is `inert` and `aria-hidden`, so
nothing behind it can be tabbed into or read out. A turn keeps running, its clock keeps
counting, and a permission card raised while the dock was shut is still waiting when it
opens. The conversation ends when the person leaves the Library, which is when the screen
that started it goes away. While a turn runs behind the shut dock, the same *Conversation*
chip — right end of the graph's status row and of the reader's top row — says which step is
running and what it is on (*Editing · Write wiki/contractor-quotes.md*, *Waiting for
approval · …*) with one indigo dot beside it; there is no second resting surface, because
one door to one conversation is enough. And reopening lands in **this folder's latest
conversation** rather than a blank one: the dock asks the adapter for its conversations in
this folder, resumes the newest, and the past-conversations door is reachable from the
first ready frame instead of only after a turn. An adapter with no session list, a folder
with no past conversation, and a conversation the adapter will not reload all fall through
to a new one, which is what happened before. *New conversation* still means new.

**File the answer** (2026-09-07, ordinary conversation included 2026-09-09). After a question from the conversation or passage menu ends, a chip in the conversation,
directly under the answer and above the composer, writes the last answer as a page under
`wiki/answers/`: the question is the title and summary,
every answer line with a `[[src:…]]` citation becomes a fact, the cited files become
`sources:` with `unmeasured` receipts, and uncited lines go under "Not in
sources". A citation an agent wrote loosely in prose, `sources/<file>#p3` bare or in
backticks with or without `src:`, is rewritten into the wiki form first, since it names
the same place (the first installed-app answer cited every fact that way and was refused
as uncited); the ask brief now names the form outright. Plain-text file references such as `sources/notes.md:7` and ascending `:5-6` ranges are also normalized to explicit line anchors; binary-document pages are not inferred. Ordinary follow-up questions do not inherit an earlier Compile or Check request, and their capture does not change tool permissions. The page meets the same validator
as every other; an answer that cites nothing is refused by name (`no-cited-fact`), and one
that does not fit is not written and the first problem is said instead. The summary ends
with "See also" links to every page that already writes up a cited source, so the folder
check's `shared-source-unlinked` has nothing to raise on a filed answer.
Passive source hashes do not establish which bytes the answer used. Filing an
older answer after its source changed therefore keeps that answer unverified
and does not clear the outstanding source revision. Its citations still need
review; a cited sentence is not automatically a supported claim. Undo removes
the newly filed answer while preserving the original source and existing pages.

**Reading a DOCX without a shell** (2026-09-07). The MCP server's `read_source` returns the
text of one file under `sources/` in the units a citation names — a DOCX by heading, an
XLSX by sheet and row, a CSV by row, text and HTML by line — each unit with its anchor. The
Compile, Check, Fix and ask briefs point the agent at it, so a turn that only reads no longer
raises an execute permission card for `unzip -p … | sed …`; a PDF the runtime reads itself,
page by page. Nothing is converted and kept: the file is read on request. This is the LLM Wiki pattern's "answers
can be filed back", done by the app rather than by another agent turn, so nothing is
claimed that the answer did not cite.

### First run — what the folder holds (2026-09-06)

"Just start" and "Create" open one question before writing anything: a documents wiki, an
ontology map of a codebase, or both. The answer is written as files — the wiki's
`wiki/_template.md`, the map's starter nodes and skills — and every folder of the fixed
`atlas/` tree is made either way. Nothing is stored as a preference: `describeVaultShape`
reads the folder, so a teammate who pulls it sees the same thing. A wiki without a map lands
on `/library`. Settings › Workspace carries an add-only row, "This folder holds", whose one
chip writes the missing part's starter files; the tabs follow the files.

### `/git` — Record (primary desktop destination; redesigned 2026-07-27)

Architecture was added without replacing this destination. Git keeps its primary
desktop rail tile, uncommitted-change badge, `G G` shortcut, and contextual
change-review, snapshot, and history links.

**One sentence on what this screen does**: Verify what concept I changed and decide whether to leave it in one git commit. Therefore, the most prominent things on the screen are **the list of changed concepts and the "Leave" button** pair; everything else is either evidence for that judgment or merely the top/bottom borders of the screen.

The screen layout splits into two stages. First, **is this screen even in a state to do work** (`data-stage`) — if the browser can't run git or the vault hasn't been selected yet, it stops here. If it can work, it then splits by **whether there is something to decide now** (`data-shape`).

#### State where work cannot start yet (`web` · `no-vault` · `not-initialized` · `loading` · `error`)
- These states are all drawn in **the same size, same position** (`--git-setup-measure`
  one 520px cell, centered on screen). If the width changes per stage, users feel like they're jumping to different pages every time
- Shows what to do in one line: Open app → select folder → start recording.
  Registering a remote repository is optional so it's not included in this line. No additional menus or decorative links here
- In the browser, `Get App` is the primary button, and copying CLI commands for terminal use is secondary

#### State with uncommitted changes (`decide`)
- Left: One line of status totals at the top, then **file rows grouped by kind**
  (status symbols `+ ~ − →` · folder names larger · how many lines added/removed). Clicking a row shows changed lines from that document on the right
- Non-concept files (`.gitignore`, etc.) are **collapsed by default** — they go into the commit but aren't things humans need to judge. The number of collapsed lines is shown numerically so it's not hidden
- Bottom fixed bar: Indigo-filled `Leave N items` button → confirmation step (preview of the actual commit title line + whether to push remotely, default off). Text explaining what is being recorded is also here — because files are actually written here
- Right: Area showing evidence — `Changed lines` (file-by-file +/- lines with git internal notation removed) and `Previous steps` (previous commits). **Drawn only when there is content to show**
- The width for splitting into 2 columns is `xl` (1280). Making it 2 columns at 1024 compresses the list and cuts off concept names

#### State with nothing to leave (`recall`)
- Does not split into 2 columns. A single-screen view where **the previous commit list is the body** (`--git-single-measure`)
- What's in one commit line: how recent · simple summary (`Added 3 · Modified 2`) · author · short hash. Expanding shows full hash · ISO format time · **original commit title** (record needed for later tracking)
- The primary button position remains inactive (`All left`). If the button disappears entirely based on state, users have to figure out what to press next every time

#### Only simple language on screen
- Commit titles automatically created by Atlas (`ontology snapshot: +3 concepts, …`) are converted to human language when shown on screen. Conversely, manually written commits or those made by other tools are left as-is since the original text is already human language (`describeSnapshotSubject`)
- Git's internal notation (`diff --git` · `index <sha>..<sha>` ·
  `@@ -a,b +c,d @@`) is not exposed on screen. However, a dashed line is **left** for skipped sections — hiding the fact that it was skipped makes that diff a lie

#### Nothing is written until the user clicks
When the screen first opens, only read-only tools are called (`git_status` / `git_diff` / `git_history`). Tools that change something (`git_init` · `git_set_remote` · `git_snapshot`) are executed only when the user presses their button (`onClick`).

### `/agents` — Agent (new 2026-08-20, catalog 90)

**One sentence on what this screen does**: **Get · install · attach · fix · and start conversation with** the AI coding tool on this computer.

- **List** — Tools actually verified on this device are shown first, others are collapsed.
- **Connection check** — Re-evaluate eight steps (does tool exist · can it launch · does it ask outside folder · is downloaded item intact · app-side settings · credential link · old login records · login). **Fixable things are fixed right there.** For unfixable ones, write what the human needs to do.
- **App-specific installation** — Downloads Node and tools only inside the app folder. Fixes versions, and after downloading Node, **compares hashes** (if mismatched, delete and stop). Shows the original text before executing anything. Progress and completion remain on screen — even if you close and reopen the window.
- **Reconnection** — Deletes only what the app created and recreates it. This is not "logout": this app has no app-side login, and links to the login the user did in the terminal, using it as-is.

**Why it came out of settings**: Settings is **where you choose values**, and this is **an operational task with progress state**. A modal blocks the background and owns Esc, preventing you from seeing the map while receiving 52MB. **API Keys and workspaces remain in settings** — the former has a "Path Freezing" decision on 2026-08-16 (promoting destination is itself an emphasis), and the latter's axis answered by vault is different.

**On the web**: The screen still appears, but states why it can't do what the browser can't (launching programs on this computer) along with the reason. It's not "Connection unavailable" — MCP is **attached to the folder**, not the screen, so web users are also connected (catalog 2026-08-01). That row names the place and links to it, because since 2026-09-05 the place is `/mcp` and not a section of this screen.

**2026-09-06**: the screen wears `PAGE_FRAME_FORM` (960px) like `/mcp`, and the frame carries the desktop bottom breath itself.

**What left on 2026-09-05**: the folder's own MCP connection and the connectors moved to `/mcp`. This screen keeps the runner list, the connection checks, the app-only install and repair, and opening a conversation.

**What changed on 2026-09-07**: only the tools Atlas confirmed on this machine are listed inline. The rest open in a dialog with a search field and a scrolling list — the same dialog primitives the connector dialog uses, so setting up a coding tool and attaching an MCP server feel like one product. Nothing left the list; a fold of 36 rows had nowhere to put a search.

### `/mcp` — MCP (new 2026-09-05)

**One sentence on what this screen does**: everything MCP — the folder's own server
(share this folder with a coding tool) and the external connectors an in-app agent may
reach — under one address, on two tabs (`?tab=`).

- **Share this folder** — the three steps that put a ready config in front of each tool,
  the connection status those files add up to, the first-contact proof packet an agent
  pastes to prove it attached, and a collapsed "Not working?" fold holding file status,
  CLI verification, and connecting from another code folder.
- **Connectors** — the attached list: one line per connector carrying the service mark, the name,
  what will actually run, the switch, and one more-actions button; that button's dialog holds the
  keychain fields and removal, and removal confirms first because forgetting a token cannot be
  undone. Adding opens one blocking dialog that searches what this machine already registers and
  takes a by-hand entry.
  A row wears a service's own mark **only where that service's published brand guideline was read
  and permits monochrome use to show an integration** — GitHub today. Simple Icons is CC0, but CC0
  waives copyright and not trademark, so every other service falls back to the generic connector
  glyph rather than to an assumption that nobody would mind.

**Why it came out of `/agents`**: that destination had grown two jobs sharing only the
word "agent". "Which coding tools does this computer have" needs programs on this
machine; "what does an agent reach over MCP" is a wire that behaves identically in a
browser, and it was the taller half of the screen. The owner asked for the split and
approved a longer rail: the desktop rail now carries eight destinations.

**On the web**: the whole screen works, because MCP attaches to **the folder**, not to
an Atlas screen. Two halves are app-only and each says so where it is missing — reading
what this machine already registers, and keeping a token in the OS keychain.

#### Connectors — the external MCP servers a folder may reach (new 2026-09-05)

**One sentence**: attach an outside MCP server — Notion, GitHub, Atlassian, or one
somebody wrote themselves — so the in-app conversation's agent can use it beside the
vault server.

- **Atlas runs none of them.** The descriptor is passed into the ACP handshake and the
  coding agent spawns the process or opens the connection. This is the extension
  mechanism `.claude/rules/forbidden.md` allows: MCP inside a program the person
  already trusts, never third-party code inside Atlas.
- **Found for you, in the app.** The already-registered servers in `~/.claude.json`,
  the folder's `.mcp.json`, `~/.codex/config.toml`, and `~/.cursor/mcp.json` are read
  **read-only**, and only their names, transports, commands, addresses and
  environment/header **key names** — never a value.
- **Off until switched on**, one at a time. Before the switch, the row states what will
  actually run (the command and its arguments, or the address), where the traffic goes,
  and that `.ontology-atlas/llm-audit.jsonl` records Atlas's own model calls only and
  does not cover it.
- **The list lives in the folder**, at `.ontology-atlas/connectors.json`, which carries
  its own ignore rule. **No token is ever written there**: a credential-shaped variable
  holds a keychain reference, and the writer refuses a literal.
- **The token stays out of the browser process too.** The reference becomes a value in
  Rust, one line before it leaves for the agent.
- **Name collisions are called out first.** Codex silently drops an ACP-supplied server
  whose name a config layer already holds.

**One list under one search (2026-09-07).** The add dialog is one scroll: *Already on this
computer* (this machine's own config files), *Ready to attach* (the catalogue, its capture
date beside the heading), and *Not in the list? Add it by hand*, a folded row at the bottom
that unfolds the full form. One search box narrows every group at once, because somebody
typing "notion" does not yet know which of them will answer. Close is the corner control
and Escape. The tabs this replaced lasted one afternoon; the record is in
`docs/DECISIONS.md` (2026-09-07, one list).

- **One rule for the button.** A press attaches what asks nothing — a hosted OAuth address,
  a local program with no required variable — and the row lands in the folder switched
  off. A row that needs a value unfolds a panel under itself: the command written out, one
  password field per required variable with a link to where it is issued, and the press.
  Where there is no keychain the field is not offered and the sentence says what to do.
  Every row shows the address or command it would write, verbatim, before the press.
- **The catalogue is a committed file**, `src/shared/config/mcp-catalogue.generated.ts`,
  written by `pnpm mcp:catalogue` from the official MCP Registry (whose metadata is
  CC0-1.0) plus vendor pages a person read on a stated date. **Nothing is fetched while
  the app runs** — the same rule `scripts/build-acp-registry.mjs` already follows. It
  carries no download count, no ranking and no "recommended", and the screen states its
  size, its capture date, that Atlas has audited none of it, and that *By hand* reaches
  everything it does not list.
- **Only what the press can make work.** A hosted address that signs in with OAuth
  (Notion's, Atlassian's, GitHub's, and the rest) is **not** offered: measured on
  2026-09-07 against claude-agent-acp 0.75.0, such an address handed to the in-app session
  reports "requires authentication", the adapter says the session cannot open the sign-in
  window, and no tool registers; a token earned in the terminal for the same name and
  address did not carry over. The generator refuses that shape. What remains is a **local
  program** that asks for exactly one credential, with a link to the page that issues it,
  and an **address that asks nothing** (Context7). Four services today: Notion, GitHub,
  Context7, Playwright. The hosted rows return when an adapter is measured running the
  flow.
- **The program is chosen, not typed.** `resolve_connector_runtimes` resolves a fixed
  allow-list — `npx`, `node`, `uvx`, `python3`, `docker` — to absolute paths on this
  machine and shows them. It opens no file, lists no directory and executes nothing. This
  replaces a field that asked a person to type a full path, which existed because the
  agent's child inherits no `PATH`.
- **A variable is a name and a value on one row.** Marked secret, the value goes to the
  keychain and the folder's file gets the name; a credential-shaped name cannot be
  unmarked.
- **Where a row came from is recorded.** `origin` holds `catalogue:<id>@<capture date>`,
  so the folder can say which entry and which capture produced it.
- **An install link only pre-fills.** `ontology-atlas://mcp?install=<base64>` — registered
  with macOS by the installed app, and reachable as `?install=` on `/mcp` in any browser —
  opens the dialog filled in and waits for the press. An unknown field refuses the whole
  payload, no value survives, and every argument is rendered verbatim — the lesson of
  CVE-2025-54133, recorded with its sources in `docs/benchmark/MCP-ONE-CLICK-2026-09-07.md`.
  The app answers that one address and nothing else, a second press routes the window
  already open, and a refused link is logged and dropped rather than followed.

**On the web**: adding, editing and removing connectors work (the list is in the folder,
which a browser holds), and the catalogue and the by-hand form work unchanged; a catalogue
row that needs a token offers no field there and says so. Finding
what is already registered, resolving a runtime path, and keeping a token are app-only,
and the panel says so with somewhere to go.

## 3. MCP server (current runtime inventory)

AI agents read/write the same vault as humans. Two ways to get the server running, and only two:

| Channel | How the agent starts it | What the user does |
|---|---|---|
| **Installed desktop app** (primary; macOS 2026-07-27, Windows beta 2026-08-01) | The app ships a compiled MCP server inside its own bundle (`Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp` on macOS, `ontology-atlas-mcp.exe` beside the Windows executable). The agent client spawns that binary directly, so it keeps serving while the app is closed. | Open the vault folder in the app and press **Connect agent**. The app writes `.mcp.json` / `.codex/config.toml` with the bundled binary's absolute path and the vault's real path already filled in — no terminal, no Node, no install step. |
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
| **Explicit live activity CLI** | Agents or humans can still publish `.ontology-atlas/agent-activity.json` through `ontology-atlas agent-activity` when a handoff needs it. The automatic PreToolUse heartbeat hooks were removed during the token-budget pass; routine shell commands no longer update the sidecar implicitly. | `cli/src/commands/agent-activity.mjs` · `src/entities/vault-session/model/agent-activity-status.ts` |
| **`/ontology-bootstrap` skill** (cold start) | Empty vault → evidence-earned first graph. `analyze_repo_structure` side-effect-zero → exact non-writing review plan → maker-independent CQ/source-hidden qualification whose claims bind to that plan with `proposalRefs` → user accepts that digest and every visible gap → only the released unchanged rows reach batch writers → validate/compile/source-connect/finalize. Missing evidence, proposal coverage, or independent evaluation stops without writes. Node count is an observation, never a target or cap. | `.claude/skills/ontology-bootstrap/SKILL.md` / `.agents/skills/ontology-bootstrap/SKILL.md` |
| **`/ontology-sync` skill** (code change) | "I'm done with this task — please sync the ontology now" loop. git diff + context → MCP write tools | `.claude/skills/ontology-sync/SKILL.md` / `.agents/skills/ontology-sync/SKILL.md` |
| **`/ontology-extract` skill** (prose ingress, R+) | User shares prose (meeting note / PR / RFC / Notion paragraph) → `find_evidence` + `similar_nodes` cross-check → candidate table → user picks → land. LLM hallucination guard via prose-source citation in body | `.claude/skills/ontology-extract/SKILL.md` / `.agents/skills/ontology-extract/SKILL.md` |
| **`/ontology-absorb-confluence` skill** (wiki ingress, agent-mediated) | User already has a third-party wiki MCP (e.g. Atlassian's official Confluence MCP) registered in the session. That MCP reads the page (read-only); this skill feeds the returned markdown into the existing `absorb_document` tool (dry-run → user approval → `confirm:true`), then cites the source page URL in each landed node's body. Not a Confluence integration this repo ships — an *agent-mediated* path that reuses Slice 0's absorption pipeline for any structured wiki export (Confluence, Notion, on-prem wikis) once the user has wired the read side themselves. | `.claude/skills/ontology-absorb-confluence/SKILL.md` / `.agents/skills/ontology-absorb-confluence/SKILL.md` |
| **Agent config scaffold** | CLI `init` and the installed app starter write ready-to-use `.mcp.json` and `.codex/config.toml` files into the vault folder. Claude Code / Cursor attach after opening the configured folder; Codex additionally loads the project-local `.codex/config.toml` only after that canonical folder is trusted, so `codex mcp list` and `connection_info` are required proof instead of treating the file's presence as a connection. The empty-vault CTA previews the agent verification path before creation, both empty and existing-vault CTAs include a copyable prompt for Claude Code/Codex that falls back to the CLI setup gate when MCP is unavailable, CLI proof packet, and automation JSON gate, the Workspace palette exposes the same prompt whenever a local vault is loaded, and the local vault tools menu validates and counts only the two active client files, `.mcp.json` and `.codex/config.toml`; `.mcp.json.example` remains a copy/merge template outside the readiness denominator; it summarizes how many active setup files are ready, names the next missing or invalid config, shows a three-step non-developer checklist (config files → agent restart → JSON gate before edits), and offers a repair action that creates missing files or atomically rebinds only the single parseable Atlas entry while preserving unrelated servers/sections. Invalid or duplicate active Atlas config stays untouched and returns a review state. Parseable review templates preserve unrelated content while only Atlas is rebound; malformed templates are preserved and receive a `.ontology-atlas-current.example` sidecar carrying the current binding. Grouped copy buttons provide a complete setup packet (preferred `agent-setup <vault> --root <codebase> --write` repair command + MCP/Codex templates + restart guidance + verification prompt + CLI fallback + automation JSON gate), the same read-first verification prompt (this whole setup panel is now the `VaultAgentSetupPanel` merged into **App Settings → MCP/Agents**, B2 2026-07 — the old docs-header vault tools dropdown was retired to remove the duplicate surface; the local vault picker moved to **App Settings → Workspace**), matching installed-CLI graph runbook (`validate` → `workspace-brief` → `agent-brief --prompt` → `agent-brief --graph-db-pack` → `agent-brief --verify-fallbacks` → `cycles` → `growth` → `maintenance` → `hubs --plan` → `hubs` → `mcp-verify`), a separate one-click automation gate (`agent-brief --verify-fallbacks --json --exit-zero --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`) with visible command preview, the visible first-contact proof contract (`config_state` → `mcp_verify` → `json_gate` → `graph_briefs`), a separate codebase-root `agent-setup` repair command copy button, codebase-root `.mcp.json.example` template, codebase-root Codex `.codex/config.toml` template, and a one-line `codex mcp add ...` command for users who prefer Codex CLI registration; the starter README gives the same first-contact verification loop plus the `agent-setup /absolute/path/to/this-vault --root . --write` existing-vault repair path before any agent edit. `agent-setup --json` includes `docs.modeComparison` for the CLI-only, MCP-connected, graph DB pack, and setup gate modes, so AI tools can explain the right setup path without scraping Markdown. `agent-brief --verify-fallbacks` runs fallback commands through a bounded parallel queue, prints a human setup-gate line (`ok`, `performanceOk`, wall time, slow count, failed count) before per-command elapsed time plus the slowest fallback, and `agent-brief --verify-fallbacks --json --exit-zero` emits the same check as a compact machine-readable timing report for Claude Code/Codex automation with output samples only on failed rows, so local graph query latency is visible without flooding connector-less setup checks. Each fallback command has a 15s default timeout, configurable with `--fallback-timeout-ms N` or `OATLAS_AGENT_FALLBACK_TIMEOUT_MS=N`, and timeout rows report `timedOut:true` for fail-closed setup automation. Passing-but-slow rows are counted under `slow`, marked with `slow:true`, and summarized by `performanceOk:false` when they exceed the 5s default `slowThresholdMs`, tunable with `--fallback-slow-ms N` or `OATLAS_AGENT_FALLBACK_SLOW_MS=N`; fallback concurrency defaults to 4 and is tunable with `--fallback-concurrency N` or `OATLAS_AGENT_FALLBACK_CONCURRENCY=N`, so automation can distinguish broken setup from local graph latency drift without making the setup gate unnecessarily slow. Root-level CLI init writes matching cwd configs for codebase-root sessions; a repeated init rebinds those root-local Atlas entries to the newly requested active vault and still requires a client restart plus `connection_info` proof. | `cli/src/index.mjs` · `src/entities/vault-session/lib/ontology-starter.ts` · `src/entities/vault-session/model/use-local-vault.ts` · `src/widgets/app-settings-menu/ui/VaultAgentSetupPanel.tsx` · `src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx` · `src/views/docs-vault/ui/DocsVaultPage.tsx` |
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
- Effect: When files are edited via IDE · AI agent · CLI, the graph updates and toasts appear within ~1.5–5s without the user needing to click the web tab again.

#### Read tools (20)
1. **connection_info** — active vault/repo roots plus the actually advertised `readOnly`, `toolCount`, `toolNames`, and `toolsetHash`; explicit `OATLAS_REPO_ROOT` wins, otherwise repo root is auto-discovered from the active vault's Git top-level before falling back to process cwd
2. **git_status** — vault-scoped working-tree state and risk; no writes or remote transport
3. **git_history** `{ limit? }` — newest-first commits that touched the active vault pathspec only (default 20, max 100), with `limited` / `hasMore`, shallow-repository state, and `historyComplete` so truncated evidence is not mistaken for complete history
4. **list_concepts** `{ kind?, domain?, since?, summary?, offset?, limit? }` — every node as `{uid, slug, …}`, optional filters, deterministic slug ordering, mtime, summary preview, and explicit `{returned, limited, pagination:{offset,limit,total,returned,hasMore,nextOffset}}` metadata for lossless large-vault traversal
5. **get_concept** exactly one of `{ slug }` or `{ uid }` — full detail with both identities, frontmatter, prose, neighbors, edges, and `mtime`; UID lookup survives rename and never falls back to fuzzy matching
6. **get_concepts** exactly one of `{ slugs }` or `{ uids }` — batch read (max 50), order-preserving partial results with both identities and per-node warnings
7. **find_evidence** `{ title }` — partial-match across title / capabilities / elements / body; each match carries `{uid, slug}`, `domain`, `mtime`, and prose excerpt
8. **find_backlinks** `{ slug }` — every referencing node as `{uid, slug, …}` (frontmatter arrays + wikilinks/markdown)
9. **find_neighbors** `{ slug, direction?, types?, includeNodes?, limit? }` — one-hop local graph around a node, with canonical incoming/outgoing `edges[]` and `{uid, slug}` neighbor summaries (`includeNodes` defaults true, `limit` defaults 100/max 500); public relation type aliases like `depends_on` are normalized to stored graph keys
10. **find_path** `{ from, to, maxHops? }` — shortest undirected BFS across graph frontmatter, including `domains` / `domain` containment (default 5 hops, includes aligned `{uid, slug}` `nodes[]` summaries plus `edges[]` of `{from, to, via, rationale?}`, the rationale being the stored `relation_notes` sentence when one exists)
11. **list_kinds** — vault kind census `{ total, byKind: { capability: N, … } }`
12. **find_orphans** `{ kind?, excludeKinds? }` — isolated `{uid, slug}` nodes across graph frontmatter, including `domains` / `domain` containment (defaults exclude `project` and `vault-readme`; pass `excludeKinds: []` to include every kind)
13. **query_concepts** `{ filter, limit? }` — typed filter DSL with AND/OR/NOT on `kind` / `domain` / `slug` / `title` / `has(arrayKey)`; match rows carry `{uid, slug}`
14. **compile_ontology** `{ includeIndexes?, summary?, nodesLimit?, nodesOffset?, edgesLimit?, edgesOffset? }` — deterministic graph artifact with UID-required `nodes[]`, slug-based `edges[]`, identity indexes (`uidToSlug`, `slugToUid`, `mergedUidToSlug`), graph-array canonicalization actions, semantic `graphHash`, and pagination; invalid identity fails closed
15. **query_ontology** `{ operation, ... }` — graph-engine query over the compiled artifact (`neighbors`, `path` with aligned `nodes[]`, `all_paths` with per-path `nodes[]` plus `limit` / `searchBudget` / `exhaustive` / `truncatedByBudget` / `totalPathsExact` metadata and `evidence` guidance, `query_plan` with executable run/narrow advice, filter-preserving `suggestedQuery`, and filter-aware `estimate.totalMatches` for `match_nodes` / `match_edges`, `centrality`, `communities`, `similar_nodes`, `explain_relation`, `reachability`, `pattern_walk`, `impact`, `blast_radius`, `subgraph`, `builder_context`, `overview`, `schema`, `facets`, `match_nodes`, `match_edges`, `node_profile`, `domain_profile`, `domain_matrix`, `project_scope`, `project_map`, `relation_check`, `components`, `lineage`, `containment_tree`, `cycles`, `topological_order`, `recommend_relations`, `growth_plan`, `maintenance_plan`, `agent_brief`, `workspace_brief`, `health`) for graph-database-like answers without pulling the full compile payload. `builder_context` keeps its compatibility operation/response name but emits the current Workshop focus URL, persisted bounded neighborhood, `canvasPosition`, `expected_mtime`, and safe low-level write handoff while declaring that unsaved UI drafts are not included. Repeated read calls inside one MCP server session reuse the compiled artifact while the vault document signature is unchanged, so first-contact agent run orders do not pay the full compile cost for every graph query. `match_nodes` returns a `followUp` packet for the first returned row with ready-to-run `node_profile`, incoming/outgoing `match_edges`, and `blast_radius` MCP calls plus CLI fallback commands, so a graph scan can become focused evidence without another round of tool-selection guesswork. `match_edges` returns a `followUp` packet for the first returned real edge with ready-to-run `explain_relation`, `path`, and `relation_check` MCP calls plus CLI fallback commands, so edge scans move directly into evidence and write-preflight instead of being treated as raw proof. `match_edges.filters`, `match_edges.edges[].relationType`, `followUp.focusEdge.relationType`, and `query_plan(match_edges).normalized` expose public names such as `depends_on` next to canonical frontmatter `types` or `via` values such as `dependencies`, so terminal and MCP clients can show the relation name users typed while keeping executable graph keys. `node_profile.edges.incoming/outgoing.byRelationType` and edge `relationType` expose public names such as `depends_on` for node detail views; `domain_matrix.filters.relationTypes`, `connections.rows[].byRelationType`, and connection examples do the same for coupling views, while canonical `types`, `via`, and `byRelation` stay available for graph-key callers. The UI semantic coupling matrix and CLI node deep dive can be rerun from Claude Code, Codex, or terminal fallbacks with the same user-facing names. `agent_brief` returns Claude Code/Codex handoff readiness, a copyable `handoffPrompt` (also printable via `ontology-atlas agent-brief --prompt`), graph entrypoints, first MCP calls, structured `graphDbQueryPack` (`facets` / `schema` / `query_plan(match_nodes)` / `match_nodes` / `query_plan(match_edges)` / `match_edges` / `domain_matrix` / `query_plan(centrality)` / `centrality` / `query_plan(all_paths)` / `all_paths` / `explain_relation` / `business_questions` outcome, domain-boundary, capability-claim, and implementation-evidence scans), investigation playbooks including `graph_traversal` (`schema` → `query_plan(all_paths)` → `all_paths` → `pattern_walk` / `project_map`), `traversalStrategy` (`plan_before_enumeration` → `bounded_path_evidence` → `containment_cross_check`) for plan-first bounded traversal, per-playbook `evidence[]` and `stopWhen[]` checklists, write guardrails for `add_relation` / rename-merge / post-change sync, relation preflight before `add_relation`, a `relationDecisionGuide` for the `skip_existing` / `review_inverse` / `safe_to_add` / `review_new_schema` outcomes, `resultContracts` requiring `all_paths` callers to report completeness fields and requiring `match_nodes` / `match_edges` callers to report `totalMatches`, `limited`, and `followUp` details before treating scan rows as evidence, and read-first write policy. The CLI companion `ontology-atlas agent-brief [vault] --graph-db-pack` turns that pack into a shell-pasteable graph scan script for sessions without MCP. `relation_check` validates relation `type` before endpoint slug resolution, so relation typos such as `depend_on` still return nearest-value hints even in empty or project-less vaults, and returns `matchingEdges`, reverse-direction `inverseEdges`, and a recommendation decision (`skip_existing`, `review_inverse`, `safe_to_add`, or `review_new_schema`). Non-dependency relations may expose an `add_relation` `proposedAction`; a new `depends_on` returns no executable args and instead exposes `approvalGate.writeAllowed:false` until observable ability, rationale, explicit human approval, and nonblank `why` are present. `maintenance_plan` actions include stable `id`, cursor resume via `afterActionId`, explicit `cursor.reason` metadata, executable graph-array canonicalization, count-safe summary fields, `byPhase` / `bySeverity` / `byKind` remaining-queue buckets, `executable`, current-page `nextExecutableAction`, current-page `nextReviewAction`, plus `executableOnly` / `phases` / `severities` / `kinds` filters; ready pages report `cursor.found=true` with `cursor.reason=null`, while unknown cursors return an empty page with `cursor.found=false`, zero remaining actions, and no next actions. `phases`, `severities`, and `kinds` are enum-validated so typoed work-queue filters fail instead of returning an empty plan. Health results include a typed `relationCensus`: `summary.edges` and `compiledSummary.edges` count compiled frontmatter declarations, while the app's unavailable-to-MCP comparison unit is deduplicated normalized typed edges across the loaded ontology.
`impact` and `blast_radius` follow only the `depends_on` relations that humans have explicitly written. Structural relationships such as what contains what are excluded from impact scope and risk calculations — for such structural questions, `reachability` and `subgraph` provide the answers. Each dependency edge is marked as either `review_required` (needs human review) or `declared_with_rationale` (reason provided), depending on whether a rationale is recorded. Until there is a current-source receipt confirming that each relationship remains factually accurate, the completeness and `risk` of this answer remain `unknown`.

16. **validate_vault** — whole-vault health check with per-file issues and grouped summary, including required/valid/unique UID claims, merge identity history, graph-array canonicality, and dangling graph references

Optional explicit `sourceReads` return bounded implementation lines in a separate
`sourceEvidence` packet with exact file/range hashes, byte limits, continuation
and refusal state. Proposal/release replay checks those bytes again; source
access does not promote semantic authority or grant writes. The
[MCP source-read contract](../mcp/README.md#bounded-implementation-source-evidence)
owns the limits and evidence boundary.

`analyze_repo_structure`'s semantic discovery scans only up to 200 Markdown files and 1,000 directory entries across all three roots. General semantic documents stop reading at 256 KiB before being read. Visited real directories, archives, broken symlinks, or symlinks outside the repository do not expand the scan.

The portable Markdown/RST evidence row prefers the document-title section plus
explicitly classified purpose, architecture, and ability sections; documents
without a named semantic category use the same bounded eligible-section
fallback. Its risk scan consumes only that model-visible selection, so an
unrelated unselected peer section cannot taint the selected claim. If one selected row mixes current evidence with
future, negated, or deprecated prose, the current excerpt remains candidate
evidence and the policy unit stays beside it as typed, line-scoped
`reviewRequiredEvidence`. That unit is visible counterevidence but cannot support
a proposal claim. Hostile instructions still taint the whole row, and a split
that cannot fit the bounded packet falls back to row-wide review. The validator
also blocks definitions, boundaries, relation rationales, and completed
competency answers that overlap a review unit without a different current
claim-aligned semantic source.

The same fixed 1,200-character excerpt gives every selected safe section an
initial deterministic share before unused short-section capacity returns by
semantic priority and source order. No packet cap grows. One exact current
semantic unit plus a matching implementation witness may form only a
sub-0.8-confidence capability review proposal; implementation is not a second
semantic authority and grants no domain, completeness, answered-CQ,
qualification, approval, or write authority.

Semantic evidence also preserves exact repository path case. A lowercase root
or workspace `readme.md` remains that exact address through proposals and source
receipts instead of inheriting the analyzer seed spelling. Exact entries win;
ambiguous folds, missing entries, non-files, and symlink escapes fail closed,
while package contracts still require exact conventional names.

Direct workspace members of `apps/*` and `packages/*` also become candidates for the same 6-document packet, including their static name+description `package.json` and package `README.md`. Only up to 48 members per conventional root are scanned; scripts/dependencies are not read, nor are package names automatically promoted to business meaning.

Business capability candidates follow the same principle. They are proposed only when bounded outcome prose and implementation evidence are both confirmed; implementation-oriented folder names like UI, transport, policy, or telemetry are not automatically promoted to business meaning. Without evidence, they remain implementation review targets, and the analyzer does not write to the vault.

17. **analyze_repo_structure** `{ rootPath?, maxDepth?, ignore?, sourceReads?, proposal?, qualification? }` — side-effect-free bootstrap candidates from package / README / source layout plus the executable construction lifecycle. A valid complete proposal first returns an exact non-writing `reviewPlan`, plan/source digests, eight phase states, every `requiredGapId`, and a shadow-only `admission` receipt (`self_qualified`, `partial_visible_gap`, `human_review_required`, or `hard_block`); `self_qualified` is an auto-write candidate signal, not write permission. `canWrite` remains false and `writePlan` is absent until the existing human acceptance gate is satisfied. A separately identified evaluator then measures approved executive/employee/agent CQs plus optional project-owned FDE CQs, current claims/citations, seven quality axes, the complete source-hidden task, and cold-start/prior-CQ regression. After the user sees the exact plan and accepts its digest/revision plus every visible gap, the unchanged proposal and `constructionQualification:v1` packet may release a `writePlan` exactly equal to the reviewed rows. Generated concept bodies use the parser's canonical full-body representation; after persistence every released body must full-read byte-for-byte equal before source connection or finalization. Maker-only evaluation, missing authority, `not_measured`, stale/private provenance, red mandatory axes, source/plan drift, regression failure, or an unaccepted gap fails closed. Acceptance is declared provenance, not authenticated identity or a truth certificate. Its five proposal competency answers still carry `answered` / `partial` / `visible-gap` plus typed concept, relation, evidence, and path witnesses, and the project body preserves that audit. `Excludes` is reserved for sourced product/concept boundaries: unknown or unmeasured evidence belongs in `Uncertainty` or a competency gap, and `epistemic-exclusion-boundary` blocks a proposal that would persist those unknowns as scope. Root `ARCHITECTURE.md` and classified Markdown under bounded `docs`, `site`, and `website` discovery can join the existing six-document semantic packet; archive-like paths and repository-escaping symlinks cannot. README extraction preserves purpose, responsibility/architecture, and ability blocks inside the existing 1,200-character budget instead of letting sponsor/backer/TOC sections consume it. Root package contracts remain bounded evidence, not meaning nodes: Rust reads allowlisted `Cargo.toml` package/features fields and returns separate literal `cfg`/`cfg_attr` provenance without evaluating predicates, executing code, or allowing relation writes. Python reads bounded static package evidence and import-participating boundaries; unused or unsafe inputs are skipped. Root Go modules contribute at most 24 import-participating package-directory element candidates, never path-derived capabilities. A proposal call recomputes the existing read-only import receipt so selectively proposed TS/JS/Python/Rust file endpoints and Go file/package endpoints are validated without relying on prior-call state, and import-backed `depends_on` must match observed direction. After the exact released rows land, the agent validates, compiles, connects the source, and finalizes project meaning.
18. **infer_imports** `{ rootPath?, sourceFolders?, ignore?, maxFiles?, reviewMode?, afterReviewId? }` — side-effect-free TS/JS, root-package Python, deterministic Rust, and root-module Go import evidence. Rust uses the existing file/module envelope for resolvable `use`, file-backed `mod`, and exact literal path/include forms; each file is capped at 256 KiB and 256 dependency statements. It does not expand macros, evaluate `cfg`, execute Cargo/compiler/network code, resolve symbols, or turn direct source direction into runtime/business impact. Conditional, escaped, non-literal, or otherwise ambiguous forms remain unresolved. External crate names are observed candidates only; package-contract evidence and review decide importance. Go remains separate as `packageImportEvidence` contract `goPackageImports:v1`, preserving exact importing files and repository-relative package directories without inventing target files. File and package receipts distinguish source role and usage; `value` does not claim runtime execution. Every collapsed edge includes whole-edge counts, their joint `productValueCount`, and up to five exact evidence receipts. Missing vault edges and Go package evidence are review-only, never executable write proposals. Compact and focus delivery surface Go counts plus the explicit full-evidence call instead of silently dropping a large package graph; CLI bootstrap approval plans derive candidate and unresolved totals from that validated compact summary rather than treating omitted full arrays as zero. CLI `infer-imports --apply` is disabled, and bootstrap/index cannot auto-create import endpoints or semantic `depends_on`; an agent must inspect both concepts, explain the meaning-level dependency, obtain human approval, and supply nonblank `why` before one explicit write.
19. **index_project** `{ rootPath?, maxFiles?, threshold?, skipImports? }` — side-effect-free project indexing checkpoint that combines repo structure analysis, file-import and Go package-import indexing, and vault validation. It reuses one full import receipt for analyzer evidence, reports file and package relation counts separately, and preserves coverage instead of reducing uncertainty to one count. `plan.conceptDelta` separates raw candidates into existing, ambiguous-alias review, and genuinely new buckets, and `next.reviewCalls` gives exact calls for retrieving full rows before applying anything.
20. **inspect_architecture** `{ rootPath?, profileSlug? }` — reads one reviewed `architecture-profile/v1`, scans current imports with the same bounded source analyzer, and returns the profile's governed import usages, usage-qualified role edges and receipts, violations, explicit unknowns, and the required `architectureChangePlan:v1` fields. Unknown usage stays fail-closed and cannot be declared away. Side effect 0; named architecture patterns remain declarations rather than inferred source facts.

For first-pass construction, an `unqualified-project-exclusion` is an exact
human-acceptance gap rather than a qualification-time hidden block.
Source-hidden review keeps unverifiable raw-source detail partial until
source-aware citation checking. After persistence, health does not recommend a
duplicate direct-domain edge for an element whose `domain` membership and
resolved containment owner already exist; genuinely unowned elements and
missing capability containment remain review work.
Mandatory proposal warnings that are not human-gap eligible block the first
review plan before qualification work begins, so a pass-shaped analyzer result
with unsafe citation/evidence warnings is a rejected draft rather than a
candidate release.

The first candidate's exact claim ids, statements, and `proposalRefs` can be
sealed once and handed to isolated source-hidden and source-aware review lanes
in parallel. The lanes do not share source or answers, any manifest mutation
blocks their join, and human acceptance remains after that join; this is an
agent orchestration receipt rather than a new server permission or schema.
In source checkouts, the mirrored bootstrap skill provides a deterministic
scratch helper for those receipt stages. Agents still decide every meaning,
answer, evidence mapping, and citation verdict; the helper only removes repeated
JSON/digest/witness projection and emits non-executing writer-call data after an
exact executable release.
The complete qualification contract is read from one file-backed `schema.json`,
not a potentially truncated display. It publishes exact hidden and audit input
schemas; coverage refs are derived before material claims, payload witness
digests are derived during seal without mutating caller input, and recorded
analyzer responses pass directly without hand-authored wrappers.
The helper requires one human-owned purpose/CQ set whose approval predates the
source-hidden lane, keeps that owner distinct from all construction actors, and
binds the full question projection into the post-join acceptance request. The
same owner must accept the plan; this is declared provenance, not identity
authentication, and it adds no MCP or vault field.
The helper also blocks a failed CQ before join. Required witness kinds come from
the sealed witnesses actually cited by that answer; only measured
partial/unknown results can become exact human gaps.
Several qualification claims may share a concept ref so its material
Definition, Includes, Excludes, and Uncertainty assertions are checked
independently. Source-use wording and analyzer/packet measurement qualifiers
remain exact; neither may be widened into a broader product claim or absolute
absence.
An exact production/value import may verify a reviewed direct
element-to-element source dependency when both roles and paths resolve and the
direction matches. It does not prove runtime, reverse, transitive,
capability/business, or complete impact; the impact competency answer remains
partial without separate current meaning evidence.
Project-source receipts preserve safe explicit repository-root directory paths
from frontmatter and persisted competency Evidence/Paths rows, including literal
repository root `.`, not only paths with a slash or extension. The root witness
proves the bound root rather than a canonical child file. App and MCP derivation
stay aligned; absolute, parent-escaping, malformed, embedded-dot, and
relation-slug lookalikes do not become source witnesses or erase valid siblings.

Agent handoff preserves measurement scope at atomic-claim granularity. When a
body says bounded/static packet, bounded excerpt, or selected evidence, any
`only`, `one`, `none`, `unmeasured`, or absence claim keeps that qualifier in the
same sentence instead of widening a packet-local gap into a source-wide fact.

For `agent_brief`, structural readiness is not meaning confidence. A fresh call
for an explicit project derives `meaningAssessment:v1` from three independent
dimensions: the current graph structure, the versioned competency receipt and
its typed witness inventory, and project-source provenance/currentness. The
overall result is categorical (`verified_current`, `needs_evidence`,
`review_required`, or `invalid`); Atlas emits no combined score or percentage
that could hide a stale source or unresolved witness.

An explicit project now scopes every handoff count, hub, entrypoint, and graph
pack to that project's containment tree; a multi-project vault fails closed
until `project` is supplied. The complete response remains the default. For a
known coding task, opt-in `detail:"compact"` plus a request-local `task` returns
an `agentBriefCompact:v2` projection capped at 12,000 UTF-8 bytes of the complete
serialized JSON object, including its handoff prompt. Display indentation is
excluded; the combined two-call wire guard remains 20,000 characters. It keeps
final source/meaning currentness, the compact meaning-repair and human-approval
guards, a broad persisted capability only when its Definition/Includes/Excludes
agree with the desired work and explicit non-goals, cited element/path evidence,
explicit impact/verification unknowns, bounded full-body reads, and an exact
full-detail follow-up. A conflicting, unsupported, or tied claim returns no
capability instead of a noun-overlap winner. When reviewed
implementation/supporting/test coordinates exist in
the selected element and the bound source is current, `taskNavigation:v1`
verifies only those named files and returns exact current line locators plus the
reviewed non-exhaustive IN/OUT boundary. Stale, missing, ambiguous, unsafe, or
unrecorded evidence returns no exact target; claim-compatible task selection
never searches source, proves code behavior, persists raw task text, or creates
a narrow capability.
The same source fingerprint, revision, and graph hash are checked again after
the named reads; a mismatch detected by the exact-file guards or that final
recheck withdraws every target and downgrades outer currentness. Compact v2
sends typed facts once in `structuredContent` and
the handoff prompt as human text. The current `OATLAS_READ_ONLY=1` frozen-control
run reduced source reads from four to one, wall time by 23.9%, and uncached input
by 19.1%; two order-reversed blind judges preferred the treatment. The two-call
wire path measured 12,928 characters. The full read/write profile and
cross-repository coding speed remain unqualified, so compact and read-only stay
explicit choices rather than defaults.

`query_ontology({operation:"cycles"})` returns each cycle as the canonical slug
path plus aligned `nodeSummaries[]`, so dependency-cycle diagnostics are readable
without extra node lookups.

#### Write tools (16)

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
15. **connect_project_source** `{ projectSlug, rootPath?, confirm?, repair? }` — dry-run/confirm binding of one project to a local source folder, with a measured source receipt; private absolute paths stay in the gitignored vault sidecar.
16. **disconnect_project_source** `{ projectSlug, confirm? }` — dry-run/confirm removal of that binding and receipt without touching ontology Markdown or other projects.

---

## 4. Cross-cutting UI

**feat/rail-rollout** collapsed the old 3-tier nav (`OperationsNav` top tabs +
`OntologySubNav` inline sub-tabs + `BottomTabBar`) into one ownership model: a
persistent left rail on desktop and `BottomTabBar` on mobile. They share the
same active-destination resolver while exposing inventories appropriate to
their viewport. `OperationsNav` and `OntologySubNav` are retired (deleted, not
just unmounted).

### `AppNavRail` (desktop, `lg:` and up — left side, on every page)
- 9 destinations: Map (`/`, `/topology`) · Harness (`/architecture`) ·
  Docs (`/docs`) · Library (`/library`) · Insights (`/ontology/insights`) ·
  Projects (`/projects` or `/project/*`) · Agents (`/agents`) · MCP (`/mcp`) ·
  Git (`/git`). Workshop remains the map's contextual relation-writing surface.
  The ninth tile is what moved the button's own padding from `py-1.5` to `py-1`
  (list pitch 64 → 60): measured on the rendered rail at the app's 1040×720
  window floor, nine tiles then stand in 12–550 of a 616px pane with 66px to
  spare and the gear still 48px above the window edge. The fixed tokens — 38×32
  tile, 20px icon, 11px label — did not move.
- Bottom utility tier: the `settingsSlot` plus the web-only Get App tile.
  `AppShell` supplies the app-wide settings trigger by default; a page can
  override the slot for a surface-specific control.
- Active-item detection: shared `resolveActiveNavDestination`
  (`src/shared/lib/nav-destination.ts`) — `BottomTabBar` uses the same semantic
  resolver, so a route has one destination even when mobile intentionally
  omits its button.

The rail draws only the destinations the folder earns (`destinationsForVaultShape`, 2026-09-06):
a wiki without a map hides Map, Architecture, Docs, Insights and Projects; Agents, MCP, History
and the Library stay (the Library holds `sources/` for any folder); a map, an empty folder, or no
folder shows all nine.
The phone tabs and the `G` keys read the same verdict.

### `AppSettingsMenu` (app shell + contextual page headers)
- The old 5-tab settings modal is now one compact settings sheet
  (`src/widgets/app-settings-menu`): screen controls, workspace, and the AI
  agent entry are scanned in one column. `LocaleSwitch` is an immediate screen
  control; the long MCP connection proof stays behind the AI agent drill-in.
- **AI Connection** (`AiConnectionPanel`, 2026-07-26) — a second drill-in row for
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
  - **Connect by Address — Models Running on My Computer (2026-08-01).** Below
    the three named vendors, the fourth row is not a specific vendor but a single
    **entry point** that accepts any runner (runner = the program actually executing the model). Enter the runner address
    (default `http://localhost:11434`) and press [Check Connection]; this single request
    answers three things together: "Is it alive? · Does it speak in OpenAI-compatible format? · Which models can be selected?". Installed models arrive as a list, so the user **only needs to choose** (no typos from typing names). No API key is needed — this branch bypasses the key vault entirely. Ollama · LM Studio · llama.cpp server · vLLM all enter through this single entry point (addresses use OpenAI-compatible `/v1/*`. If each runner required a unique custom API, separate conversion code would have been needed for each runner).
    - **Different messages are shown for each failure reason** — distinguishing cases where the runner is down (connection itself fails), another program is running on that port (404), or no models are installed, and noting what to do next for each.
    - **Unencrypted `http` is allowed only within this machine (loopback).**
      To point to an external machine, `https` is required, and addresses containing username/password are rejected — because the address remains in logs as-is.
    - **"Does not go out" is stated only when true.** If the address points to this computer, it writes "It does not leave this computer, and the log records the destination as `localhost:11434` — that is proof it did not leave." If the user points to another machine via `https`, this sentence is replaced with "This address is outside this computer."
    - This branch cannot be used in web browsers (browser pages cannot send requests to the user's computer localhost). Therefore, a card stating "Not available here" explains the reason **separately** from the API key vault story and links to `/download`.
  - Every recorded call names its destination host. The audit line carries
    `host` (e.g. `generativelanguage.googleapis.com`), and the screen states
    that host before you press check — the strongest claim we can prove for a
    named vendor is "it only goes to the official address compiled into the
    code". `host` was added without bumping the schema `v`, so lines written
    before it exist read back fine with a `null` destination.
  - Unregistered vendors collapse to a one-line `name · [Add key]` row that
    expands in place, one at a time — three always-open password fields would
    turn a settings sheet into a form gate.
- **Runtime** (`AcpRuntimeSettings`, 2026-08-16, desktop app only) — A section where the app finds and displays coding agents (Claude Code, Codex, etc.) already installed on this computer. The one thing this section does is **tell you what can be used right now**.
  - The list splits into two branches: "Ready to use" is expanded, while "Requires installation" is collapsed. Reasons for not being usable are split into four categories: requires installation / needs Node / needs uv / manual installation. Since the user's task differs per category, they are not lumped together as just "installed/not installed." Press [Re-check] to scan again at any time.
  - **The list comes from an ACP registry snapshot committed at build time**
    (`src-tauri/src/acp-registry.json`, `scripts/build-acp-registry.mjs`,
    updates via `pnpm acp:registry`). It does not call a CDN at runtime, so the list remains available offline, and changes are recorded in git diff. Icons are also fetched at build time and bundled in `public/acp-icons/` for the same reason (since the registry spec uses 16×16 monochrome SVGs, brand colors do not enter the app).
  - **In-app chat requires an app-owned permission gate.** Claude Agent qualifies through an isolated `CLAUDE_CONFIG_DIR` and linked existing credential. Codex qualifies through the newest upstream `@agentclientprotocol/codex-acp` adapter (1.10.0 as of 2026-09-07), isolated `approval_policy = "on-request"`, a forced `read-only` mode that since 1.8.0 is a workspace-write sandbox, and the server-owned Atlas write-consent checkpoint. Direct writes inside the vault may land without a card and are undone through Git (owner direction, 2026-09-07); Atlas MCP writes still ask, and both injected and self-registered Atlas MCP writes wait for `reject_once` or `allow_once`; every `allow_once` is consumed by one request.
  - **Atlas MCP and provider traffic are separate boundaries.** The Atlas MCP server is a local stdio child with no daemon, port, or network request. The coding agent using it may send prompts, context, and tool results to its own provider.
  - Modes measured to remove the permission gate are hidden. Unmeasured modes remain explicitly unverified; they are never treated as safe by default.
  - Processes cannot be launched in browsers. On the web, a single line explaining why it doesn't work and where it does replaces the list.
- The persistent shell mounts the rail settings trigger. Current agent work is
  exposed by `AgentActivityChip` in Topology's contextual map controls, while
  `AgentActivitySettings` controls its visibility and notifications in the
  settings sheet; neither is a navigation destination.

### `BottomTabBar` (mobile only, `lg:` hidden)
- 5 persistent destinations: Map · Architecture · Docs · Insights · Projects.
  Contextual relation writing, Agents and MCP entry points, and Git keep their
  existing narrow-screen paths. Web adds Get App as a sixth utility, not a destination.
- Min height 56 px (safe-area)
- Hidden only on the standalone `/download/` surface. Root without a loaded
  vault is the gateway; after a vault loads, root shares the map destination.

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
- **Round 10 / 10b** — Removed `/login` / `/signup` / `/account` / `/reset-password` / `/settings/*` / `/admin/*` / `/review/*` / `/diagnostics/*` / `/knowledge/*`. Also stripped out Firebase / Firestore / Auth / Storage SDKs, screenshot uploader, and the modal for manually adding nodes/edges to the cloud, reverting to fully local-first.
- **Round 11** — Created `pnpm vault:validate` / `vault:migrate`. MCP v0.7.0 added `rename_concept` / `merge_concepts`; the live `tools/list` remains the inventory authority. Unified three frontmatter parsers into one contract. Added a mechanism to prevent concurrent edit conflicts using file modification time (mtime).
- **Round 12** — Defined the primary user as developer + AI agent (reversed the previous decision to target planners as primary users). Added 4 CLI commands (`init` plus `list / validate / add / find`). Increased package contract checks from one to four. Reduced unconnected nodes in our own vault from 8 → 1.
- **Round 13** — Measured for the first time how well AI agents use this vault (Claude Code + Codex, sample size 2). Added `instructions` field to MCP (v0.7.1). VSCode plugin v0.1.0 → v0.9.0 (removed in R15).
- **Round 14** — *Made changes fixed by AI agents automatically reflect in the vault.* Implemented a 4-layer visibility system for immediate web display (5-second polling / new node highlighting / additional toast / modification toast). Standardized frontmatter formatting by kind and aligned three entry points (MCP · CLI · web) to use the same format. Added CLI `import` command (to organize external `.md` files into this format). Added `/ontology-sync` skill and AGENTS rule to read the vault while coding. Added SessionStart hook to automatically inject a vault count summary at session start.
- **Round 15** — Removed VSCode plugin (surfaces reduced from 4 → 3). Made CLI `init` create `.mcp.json` directly (for both working directory and vault), eliminating one step of manual MCP registration. Later follow-up extends this to Codex by writing repo-local `.codex/config.toml` in cwd + vault and making the app starter write vault-local `.mcp.json` / `.codex/config.toml`. Changed `--auto-prefix` for `add` / `import` to default on (to avoid conflicting with initial folder structure); use `--raw-slug` to disable.
- **Round 16** — fresh repo bootstrap path. `analyze_repo_structure` / CLI `analyze` propose project/domain/capability/element candidates from package metadata, README headings, and source layout with side effect 0.
- **Round 17** — import-derived dependency evidence. `infer_imports` / CLI `infer-imports` parse TS/JS, bounded static Python, deterministic bounded Rust, and root-module Go package imports, resolve supported internal paths, and return review-only evidence without mutating the vault.
- **Round 18+** — the first workbench loop consolidated Browse / Builder / Query handoffs. Those standalone surfaces were later retired: `/ontology`, `/ontology/edit`, and `/ontology/studio` are compatibility redirects into the topology workbench; relation writing is contextual on `/topology`, and Insights is the six-tab board with five measured maintenance questions plus Flow. Graph query packs remain agent/CLI handoff material, while `pnpm dogfood:graph-db` fail-closes on setup self-check, `health --json`, graph scan follow-ups, public relation-name parity, structural `pattern-walk` / `project-map` traversal, bounded path completeness, relation preflight, and relation explanation contracts.
- **Round where all pages were recreated based on approved drafts (2026-07-18, PR #355~#366)** — Updated full-screen views in `docs/prototypes/` according to approved drafts. Removed: old 4-tab unique type system for `/ontology/insights` (proof/collaboration/agent/census presets, session evidence lines, collaborator brief, query-recipe cockpit, ~6,200 lines) — replaced with Overview/Relations/Freshness 3 tabs; card list with search/filter/pagination for `/projects` — replaced with embossed count header + recent activity line + full-width cards + dashed "Next Project" placeholder (`ProjectQuickCreatePanel` remains as a component but no longer appears on this page); "More info" collapsible section and tag/stack/link display on `/project/[slug]` — moved to quick edit and full edit. Added: increased topology data sheet from 288 → 352px and moved evidence groups up; `OntologyMapSettingsGear` (right tool rail); `/ontology/edit` 3-split (240 · canvas · 340, always visible on `xl`) + `BuilderWriteConfirmBar`; permanent Pinned/Vault/Recent sidebar (280px, `lg`+) for `/docs` + `DocFrontmatterBlock` + bottom backlinks line; honest facts line for `/download` (says "recorded at publish" when size/checksum are unavailable) + spctl trust panel + changelog preview.
- **Agent-loop vault freshness (R+)** — Created CLI `preflight`: matches staged git files against vault `path:` / `elements:` frontmatter and shows which nodes this commit affects *before* committing (notification only, no blocking — always exits 0; silently passes if no matching nodes). Installs pre-commit hook via `agent-setup --install-pre-commit-hook` (appends if hook already exists, idempotent across multiple runs, respects `--no-verify`). `.github/workflows/vault-freshness.yml` is a reusable workflow for other repos and also applies to this repo's PRs: `scripts/vault-freshness-drift.mjs` (dependency-free node script) detects cases where source files pointed to by vault nodes changed in the PR, but the corresponding `.md` did not. Ends without comment if none found; leaves exactly one comment on the PR if any are found (updates or removes existing comments to avoid spam).

---

## 7. Deferred (future rounds — wait-for-signal)

- `/ontology/edit` builder reconsideration — **SUPERSEDED 2026-07-24: the ERD builder was retired.** It had been kept as a constrained workbench surface (focus a saved slug, preview source-file frontmatter writes, run relation preflight, hand off to Insights/Topology). The later workshop was folded into contextual writing on `/topology`; `/ontology/edit` and `/ontology/studio` now preserve legacy links through redirects. Users who prefer direct markdown still edit frontmatter in `/docs` or CLI/MCP.
- ~~Phase 4 PM polish~~ — **dropped** (R11 #25, PRODUCT-DIRECTION v3). Reversed the decision to target planners as primary users.
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
