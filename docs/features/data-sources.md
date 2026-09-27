---
title: Mode branching (data source)
doc_type: feature
status: current
area: architecture
routes: []
---

# Mode branching (data source)

This file describes where the workbench's data comes from — a local vault or
the bundled web sample — and the surfaces that depend on that choice. It is for
anyone changing how a folder is opened, seeded, or read.

## 1. Mode branching (data source)

`useDataSourceMode()` resolves to one of two modes:

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

**Single source of truth**: `LocalVaultProvider` mounts once in `app/[locale]/layout.tsx`. Its many `useLocalVault()` consumers (`RootEntryPage` / `AppNavRail` / `HomePage` / `DocsVaultPage` / `useDataSourceMode` / `useProjects` / `useProjectMutations` / `useVaultOntology` and the persistent app shell) share one state instance, one IDB rehydrate, one filesystem walk.

## 2. Bootstrap from existing docs

Opening a folder that has markdown but no `kind:` frontmatter shows a topology
empty state that acknowledges the found documents and offers **Build the map from
my documents** — a blocking dialog that proposes candidates from the already scanned
manifest (root README → project title · 1-depth folders → domains · each doc →
element with `domain:`), and on confirm writes only frontmatter to the accepted
docs (bodies untouched) plus one new `project.md`. Candidate derivation is pure:
`src/features/docs-vault-local/lib/bootstrap-candidates.ts`, the browser
equivalent of CLI `bootstrap` / MCP `analyze_repo_structure`, so all three
ingress paths converge on the same shape. The dialog never says "ontology".

## 3. Meaning and time surfaces

- **Edge popover** — edges are clickable on the map: a click within 7px opens a
  popover with a plain-language sentence ("A leans on B"), the formal type, both
  endpoints (click = focus), the declaring `.md` (with its change-date label),
  an optional **why** line (`relation_notes`), and an edit-relation deep link.
- **Relation rationale (why)** — `relation_notes: {ref: one-line-why}` in
  frontmatter; MCP `add_relation` takes `why` and writes relation + note in
  one frontmatter write; `rename_concept` rewrites note keys (collision:
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
- **First-map reveal** — after "Build the map from my documents", nodes assemble out
  of the project position and spring-settle into place (reduced-motion
  arrives instantly).
- **Idle frame gate** — the canvas stops physics+paint after 1.2s of true
  idle (rAF stays alive; any state change resumes next frame).
- **Canonical census** — every surface that says "N concepts" uses one
  derivation (`computeCanonicalCensus`). Its callers are the Topology index
  (`src/views/home/model/use-topology-index-read-model.ts`), Insights
  (`src/views/ontology-insights/lib/census-health.ts`) and project detail
  (`src/views/project-detail/ui/ProjectDetailPage.tsx`); a surface-specific
  subset is labeled as a subset rather than presented as the vault total.
- **Library on the web** — the local-vault gate is capability-based
  (File System Access), not runtime-based: the same browser session that
  writes via the meaning editor or the document editor can read and edit in
  the Library.
- **Relation vocabulary** — one dictionary (formal/plain × 7 types × ko/en)
  feeds the map legend, Insights, the meaning editor, and datasheet
  (contract-tested); the "?" sheet footer defines domain/capability/element in
  plain language.

## 4. Desktop first run

In the installed app (Tauri — detected via `isDesktopShell()`,
`src/shared/lib/desktop-shell.ts`), `/` with no vault renders **FirstRunPage**
(`src/views/first-run/`): local-only actions to open a vault folder or create
one, plus a local-first trust line. **Just start** (`first-run-just-start` in
`FirstRunPage.tsx`, and the create menu of `FirstRunFolderActions.tsx` when
known folders are listed) needs no picker: it creates `~/Ontology Atlas/<name>`
on real disk, numbering `-2`/`-3` on a name clash, and seeds it like a new
vault. It is the no-project path; a project's own map uses the project-local
vault below. Bundled demo vaults are web-only; no demo or
download CTA appears inside the installed app. Creation doors hand the starter
seed to the open itself (`open`/`openRecent` with `starter`), so it lands before
the folder is first shown. A seed that cannot be written is said in a toast that
points to Settings › Workspace.

**Project-local vault**: the map lives inside the project it describes, at
`<project>/atlas`. One name — `PROJECT_VAULT_DIR`,
`src/shared/lib/project-vault-dir.ts` — is shared by the door that creates the
folder (`src/features/first-run-starter/model/use-build-from-code.ts`) and the
open path that finds it
(`src/entities/vault-session/model/resolve-picked-vault-folder.ts`). Choosing a
project only computes and describes: the screen renders the exact path before
`confirm` creates anything, an existing `atlas/` is reused and reported rather
than overwritten, and picking the `atlas` folder itself is named as a mistake
instead of proposing `…/atlas/atlas`. Opening a project root that carries an
`atlas/` holding Markdown redirects into it and says so, so the source tree is
never read as a vault. The picker, recent-project list, and app-start restore
share that resolver and persist the canonical child before building its
manifest. Rationale: `docs/DECISIONS.md`.

**Vault-carried agent skills**: every scaffolded vault — CLI `init` and the
in-app/web starter alike — ships `.claude/skills/atlas-{review,grow,absorb}/SKILL.md`.
The app launches the coding agent with the vault as its working folder, so
these appear in the composer's `/` menu tagged `(project)`. They encode order
and stopping conditions the tool list alone cannot: review reads
`validate_vault` + `health` and writes nothing, grow filters `growth_plan`
candidates against evidence before proposing, absorb checks for duplicates
before extracting. All three refuse to write until a person picks. Byte-parity
between the CLI templates and the web starter constants is gated by
`tests/contract/starter-templates.contract.test.ts`.

## 5. Web first open

On hosted web with no vault selected, `/` shows the gateway
(`GatewayLandingPage`, chosen by `src/views/root-entry/ui/RootEntryPage.tsx`;
see [`gateway.md`](gateway.md)). `/topology` draws the bundled sample
read-only, with a first-run starter module inside the INDEX panel (`FirstRunStarterModule`,
`src/features/first-run-starter/`). Opening a folder from it first shows a
guide sheet (`VaultOpenGuideSheet`, `src/features/docs-vault-local/`): any
markdown folder is fine; Atlas opens it locally and does not upload it to an
Atlas backend, while a connected coding agent is a separate provider boundary;
an empty folder gets starter docs. A returning user whose vault handle restores
from IndexedDB goes straight to their own workspace. The product introduction
lives on `/download` ([`download.md`](download.md)).
