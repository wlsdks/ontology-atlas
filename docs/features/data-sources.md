---
title: Mode branching (data source)
doc_type: feature
status: current
area: architecture
routes: []
---

# Mode branching (data source)

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
picker at all: creates `~/Ontology Atlas/<name>` on real disk
automatically, numbering `-2`/`-3` on a name clash, connects it with the
same starter seed as "create new vault", and the success
toast names the exact path — real disk, not OPFS, so an AI agent/MCP can
still read it; hidden when the real Tauri invoke bridge is absent, e.g. a dev
`?shell=desktop` browser override) / open vault folder / create new vault
(the seed is written only when the picked folder is empty — 5 markdown
seeds + agent configs + the agent guide pair + 3 procedure skills) — plus a local-first trust
line. Bundled demo vaults are web-only; no demo or download CTA appears inside the installed app.
Both creation doors hand the seed to the open itself (`open`/`openRecent` with `starter`), so
it lands before the folder is first shown: the first-run screen is replaced as soon as the open
begins, and a seed left to it was never written (2026-09-25). A seed that cannot be written is
said in a toast that points to Settings › Workspace.

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
reveal — in the 3D views every concept is already drawn, so it says the count
and stops (2026-09-05; it used to open with the project count, which is 1 in
every vault anyone has opened, and then tell the reader to zoom in and reveal
125 dots that were already there). The former
`LandingPage` and its hero/value-chain/evidence-instrument content moved to
`/download` (see below) — a returning user whose vault handle restores from
IndexedDB goes straight to their own workspace, no starter surfaces at all.
