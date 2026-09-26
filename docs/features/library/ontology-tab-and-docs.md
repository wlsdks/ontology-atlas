---
title: Library ontology tab and /docs compatibility
doc_type: feature
status: current
area: library
routes: [/library, /docs]
---

# Library ontology tab and /docs compatibility

### Library → Ontology and `/docs` exact-document compatibility

Library's Ontology tab is the reader, editor, and palette for the five explicitly authored
schema kinds: `project`, `domain`, `capability`, `element`, and `document`. Paths, `describes`,
README metadata, and architecture-profile metadata do not make an ordinary file an ontology
node. Its tree, search, counts, pinned and recent lists, restored tabs, palette, and defaults all
use that same fixed scope; the generic All/Guides/Ontology chooser is absent.

`/docs` without a slug, with a missing slug, or with an ontology-node slug returns to the
integrated Library Ontology tab. An exact existing non-ontology slug remains readable and
editable in a single-document compatibility reader labelled **Document**, with no unrelated
document list or creation action and a clean return to Library. Query source and reader context
survive the compatibility hop; the return removes the incompatible slug, view, and fragment.

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
- **view=doc** (only view — folder-topology retired, P5a): editor (when editing) or viewer + `DocMetaBar` (word count, reading minutes, tags, updated date) + `DocFrontmatterBlock` (2026-07-18 — renders `kind`/`slug`/`title`/`display_<locale>`/`domain`/`depends_on`/`evidence` directly on the page, only when the doc has a `kind:`; the visible proof that "frontmatter is the graph". In a writable local vault, an inline "Edit kind / domain / title / names" action turns this into a quick-patch: kind/domain are typed `<select>`s, title and one display name per app language (`display_ko`, `display_en`; an emptied name is removed) are inputs, saved through the same conflict-guarded `updateFrontmatter` path Workshop and other vault writers use — no raw YAML hand-editing for the most-corrected fields. A kind change on a document filed under its old kind's folder moves it into the new kind's folder in the same save, with every referrer rewritten, and says so before Save; the "outside its kind folder" warning carries that move as a one-press remedy. Moved or not, a document that lists it in the list for its old kind (`capabilities:` …) lists it in the list for the new kind instead when its own kind keeps one (spec §5, the same rule as MCP `reclassify_concept`); the form names each such document and what happens to its list before Save, and a notice names them again after. An entry whose referrer keeps no list for the new kind stays where it was, and that referrer's page flags it — as it flags any entry sitting in a list for another kind. A refused save is said in the form in the reader's language, never the thrown English. A reference the folder has no document for — e.g. after a delete — is marked on its line and named in a warning, as the compiler's `dangling-graph-reference` is) + optional inspector (`DocsVaultDocOutlinePanel`) + bottom **backlinks strip** (2026-07-18, full pane width, dedup'd single source — replaces the earlier duplicate backlinks surfaces)
- **File doors** (2026-09-26): beside the file's address in a writable local vault, **Rename** opens a dialog that asks for a new name (not a slug path), shows the address it becomes and how many referrers are rewritten with it, and moves the file keeping its own `slug:` in step (the MCP `rename_concept` rule); **Delete** opens an alert dialog naming the documents that still point at the file before anything is removed — their references are left in place, as MCP `delete_concept` leaves them with `force`, and flagged on each referrer's page. Both refuse a file changed elsewhere since it was shown (`expectedMtime`). The palette's rename/delete commands open the same dialogs.

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
