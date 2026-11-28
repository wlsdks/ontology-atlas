---
title: Mode branching (data source)
doc_type: feature
status: current
area: architecture
routes: []
---

# Mode branching (data source)

This file describes where the workbench's data comes from — the vault folder
the installed app has open, or no folder yet — and the surfaces that depend on
that choice. It is for anyone changing how a folder is opened, seeded, or read.

## 1. Mode branching (data source)

`useDataSourceMode()` resolves to one of two modes:

| Mode | Condition | Behavior |
|---|---|---|
| **local** | a vault folder is active, picked or restored in the installed app | vault manifest is the source of truth |
| **static** | no folder is loaded: first run, a cold restore or folder switch in progress, or a destination that opens without a folder | nothing is read; the screen shows its own "no folder loaded" state |

This is the app's "no folder loaded" state; it holds no bundled data, and no page of the
website reads a folder at all.

**Effect**: until the restored or newly selected local manifest is ready, the shell commits no
destination content; a route change then mounts against that one provider before paint.
Mutations (create / edit / connect) are mode-aware: local → show an exact change review, then
write to vault `.md`; with no folder loaded → ask for a folder instead of presenting a dead
editor.

**Single source of truth**: `LocalVaultProvider` mounts once in `src/app/routes/$locale/_app/route.tsx`, and once more in `src/app/routes/$locale/_site/route.tsx` for the public pages' mobile tab bar; a move between the two remounts it, which restores the remembered folder as a first load does. Its many `useLocalVault()` consumers (`RootEntryPage` / `AppNavRail` / `HomePage` / `DocsVaultPage` / `useDataSourceMode` / `useProjects` / `useProjectMutations` / `useVaultOntology` and the persistent app shell) share one state instance, one IDB rehydrate, one filesystem walk.

A project's missing-code-location remedy opens the exact affected concept from
its current graph. The inspector names the concept and missing relative path;
the copied project-source handoff retains both without the private source root.
Deleted, foreign, ambiguous or changed claims ask for a new measurement before
navigation. The compact inspector and full-detail action share this resolution;
opening the concept performs no document write.

## 2. Bootstrap from existing docs

Opening a folder that has markdown but no `kind:` frontmatter shows a topology
empty state that acknowledges the found documents and offers **Build the map from
my documents** — a blocking dialog that proposes candidates from the already scanned
manifest (root README → project title · 1-depth folders → domains · each doc →
element with `domain:`), and on confirm writes only frontmatter to the accepted
docs (bodies untouched) plus one new `project.md`. Candidate derivation is pure:
`src/features/docs-vault-local/lib/bootstrap-candidates.ts`, the in-app
equivalent of MCP `analyze_repo_structure`, so both ingress paths converge on
the same shape. The dialog never says "ontology".

## 3. Meaning and time surfaces

- **Edge popover** — edges are clickable on the map: a click within 7px opens a
  popover with a plain-language sentence ("A leans on B"), the formal type, both
  endpoints (click = focus), the declaring `.md` (with its change-date label),
  an optional **why** line (`relation_notes`), and an edit-relation deep link.
- **Relation rationale (why)** — `relation_notes: {ref: one-line-why}` in
  frontmatter; MCP `add_relations` takes a `why` per row and writes relation + note in
  one frontmatter write; `rename_concept` rewrites note keys (collision:
  existing new-key note wins). The read side returns the same sentence as an
  optional `rationale` on `get_concepts` rows' `outgoingEdges[]` and on
  `query_ontology` path/impact rows (omitted when none is stored). The
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
  idle and then schedules no frames; input, new data, a resize, a theme or
  motion-preference change, and `requestOntologyMapFrame()` wake it.
- **Canonical census** — every surface that says "N concepts" uses one
  derivation (`computeCanonicalCensus`). Its callers are the Topology index
  (`src/views/home/model/index-panel/use-topology-index-read-model.ts`) and project detail
  (`src/views/project-detail/ui/ProjectDetailPage.tsx`); a surface-specific
  subset is labeled as a subset rather than presented as the vault total.
- **Library needs a loaded folder** — the same vault session that writes via
  the meaning editor or the document editor can read and edit in the Library.
- **Relation vocabulary** — one dictionary (formal/plain × 7 types × ko/en)
  feeds the map's relation guide, the meaning editor, and datasheet
  (contract-tested); the "?" sheet footer defines domain/capability/element in
  plain language.

## 4. Desktop first run

In the installed app (Tauri — detected via `isDesktopShell()`,
`src/shared/lib/desktop-shell/desktop-shell.ts`), `/` with no vault renders **FirstRunPage**
(`src/views/first-run/`): local-only actions to open a vault folder or create
one; the local-first sentence lives only in the chooser's help dialog. **Just start** (`first-run-just-start` in
`FirstRunPage.tsx`, and the create menu of `FirstRunFolderActions.tsx` when
known folders are listed) needs no picker: it creates `~/Ontology Atlas/<name>`
on real disk, numbering `-2`/`-3` on a name clash, and seeds it like a new
vault. It is the no-project path; a project's own map uses the project-local
vault below. **Start from a code project** (`first-run-code-project`, the first
door on a first run and a row of the create menu when known folders are listed)
is that project path on the launch screen: it picks the project, shows
`<project>/atlas` in the confirm dialog, creates and opens it, and asks a coding
agent for a first draft only when one is ready at the press
(`src/views/first-run/model/use-code-project-handoff.ts`); without one the
folder opens and no request waits. The app bundles no demo vault, and no demo or
download CTA appears inside it. Creation doors hand the starter
seed to the open itself (`open`/`openRecent` with `starter`), so it lands before
the folder is first shown. A seed that cannot be written is said in a toast that
points to Settings › Workspace.

**Project-local vault**: the map lives inside the project it describes, at
`<project>/atlas`. One name — `PROJECT_VAULT_DIR`,
`src/shared/lib/vault-folder/project-vault-dir.ts` — is shared by the door that creates the
folder (`src/features/first-run-starter/model/use-build-from-code.ts`) and the
open path that finds it
(`src/entities/vault-session/model/local-vault/resolve-picked-vault-folder.ts`). Choosing a
project only computes and describes: the screen renders the exact path before
`confirm` creates anything, an existing `atlas/` is reused and reported rather
than overwritten, and picking the `atlas` folder itself is named as a mistake
instead of proposing `…/atlas/atlas`. Opening a project root that carries an
`atlas/` holding Markdown redirects into it and says so, so the source tree is
never read as a vault. The picker, recent-project list, and app-start restore
share that resolver and persist the canonical child before building its
manifest. Rationale: `docs/DECISIONS.md`.

**Vault-carried agent skills**: every scaffolded vault — CLI `init` and the
in-app starter alike — ships `.claude/skills/atlas-{review,grow,absorb}/SKILL.md`.
The app launches the coding agent with the vault as its working folder, so
these appear in the composer's `/` menu tagged `(project)`. They encode order
and stopping conditions the tool list alone cannot: review reads
`validate_vault` + `health` and writes nothing, grow filters `growth_plan`
candidates against evidence before proposing, absorb checks for duplicates
before extracting. All three refuse to write until a person picks. Byte-parity
between the CLI templates and the starter constants is gated by
`tests/contract/vault-format/starter-templates.contract.test.ts`.

## 5. The website's first open

In a plain browser, `/` shows the gateway (`GatewayLandingPage`; see
[`gateway.md`](gateway.md)), `/sample` draws the Storefront sample read-only, and any other
address shows the app-only page. None of them opens, reads or remembers a folder. A browser
that kept a remembered folder from the old browser workbench has that database (`demo-kv`)
deleted at its next visit; the folder on disk is not touched. The product introduction lives
on `/download` ([`download.md`](download.md)).

In the app, the first-run page's open button calls `vault.open()`
(`src/views/first-run/ui/FirstRunPage.tsx`), which shows the system folder chooser at once and
loads the chosen folder; no guide sheet comes first. A returning user whose folder record
restores from IndexedDB goes straight to their own workspace.
