---
title: Projects
doc_type: feature
status: current
area: projects
routes: [/projects, /project/[slug], /project/[slug]/edit, /project/new, /project/fallback]
---

# Projects

### `/projects` — Project list (rebuilt 2026-07-18)

**The door depends on the folder** (2026-09-19, decision "With one project, the Projects door opens that project"): with exactly one project the rail, its keyboard shortcut and the mobile tab bar open that project's page instead of a list of one row; with none or several they open this list. The list stays one press away as the breadcrumb at the top of every project page, and it is still where a project is created. One hook answers for all three doors (`useSoleProjectHref`), so the rail and the tab bar cannot disagree.


The project index uses the shared page frame and compact rows so several project
documents can be scanned by name and authored purpose. There is currently no
in-page filtering.

#### Header
- H1 + project-only count + "New project" CTA
- The bundled example state is labelled as a loaded sample rather than presented as the user's folder

#### Rows (one `<article>` per project, sorted by `updatedAt` desc)
- Project name linked to its detail page. The name is the locale's `display_<locale>` when the document carries one, the canonical `title`/`name` otherwise (`projectDisplayName`, 2026-09-19, decision "A project is drawn by its locale display name on every screen"): the map, the INDEX and the Library already drew the project by that word, and the list and the page said the canonical title beside them
- One-line explicitly authored frontmatter description, with neutral fallback when missing
- Relative last-updated time
- Clearly labelled "View details" primary action and "View on map" secondary action. "View on map" opens the project's own node (`?p=project:<slug>`), whose datasheet carries the code evidence and the control that connects the code folder (2026-09-25 — it sent the bare slug, which opens the project drawer, where neither exists)

#### Empty state
- No projects at all → guidance to create a project document; the header's "New project" action remains available

### `/project/[slug]` — Project detail (composition board, 2026-09-19)

One page, no tabs, one level below `/projects`: identity, then what this project
has built on each Atlas surface, then the domains, then what its document says.

#### Top bar
- Breadcrumb: Home → Projects → `{Name|Slug}` · documents door · copy-link button · global census (concepts/relations, md+). The documents door opens **this project's own Markdown file** (`/docs/?slug=<doc>`) when the file is found in the open folder or the loaded sample, and the vault root otherwise (2026-09-19 — the page had no door to the one file it is drawn from)

#### Zone 1 — hero band
- Project kind glyph + inline-editable name (`InlineEditable`, when `canManageProject`; the word shown is the locale's `display_<locale>` when present, and editing it in place edits that key, otherwise the canonical name with starter displays following) + hero meta (Hub label or plain label · status) + updated date + inline-editable description. The heading's accessible name is the project name; the field label ("Project name") is only the input's label in edit mode and the button's description in editable view (2026-09-19 — an `aria-label` on the `h1` used to replace the name for screen readers). Editable, it stays the page's level-1 heading and the press that edits it is a block inside it (2026-09-25 — the button role sat on the `h1` and left the page with no level-1 heading for the people who can edit it). The description's cap is the reading-column box (`--measure-doc-column`), not a per-line `ch` count
- "View topology" link, which opens the project's own node on the map (`?p=project:<slug>`, 2026-09-25), + `ProjectQuickEditPanel` (quick-edit: name / description / owner / tags — the fast path; stack/links/dependencies/dates stay in the full editor). The action cluster stands beside the name only when the hero band itself is at least 64rem wide (`@5xl` of the `project-hero` container); below that it takes its own row under the description (2026-09-19 — at 1024 the name column was 250px and at 768 80px while the four controls kept their width; a viewport breakpoint then failed the same way with the agent dock open at 1280)
- **Construction review** — `Open verification results` reads one local qualification envelope into React session state only and places a full-width review directly below the hero. The default depth keeps purpose, current/next decision, first blocker/diagnostic, red/unknown/conflict, human approval, and exact plan counts visible. `View rationale/diagnostics` expands the same artifact's CQs, source-bound witnesses and citations, examples/counterexamples, seven quality axes, diagnostics, exact review/write plans, and digest equality. The same disclosure also exposes a session-only expert draft for CQ wording, witness source references, and the exact plan; edits are visibly dirty, can be restored, never mutate the receipt/vault/localStorage, and require qualification again before any write. Malformed, wrong-project, digest-mismatched, or unequal-plan envelopes fail closed; post-write maintenance is shown separately and never rewrites the completed qualification verdict. Nothing is uploaded, remembered, or written to the vault.
- **No figures in the hero** (2026-09-19) — the engraved metric strip left, because the composition board one block below said the same five numbers again. The hero keeps identity: glyph, name, kind, updated, definition
- **Action order and weight** — "View topology" stands first and filled as the page's primary action; the construction-review picker and the quick-edit trigger follow in outline, so the row is one filled control and its outline siblings rather than three weights (2026-09-19; the quick-edit trigger was `ghost` and the row read as crooked)
#### Composition board (2026-09-19, decision "The project page is a composition board, not a document reader")
One cell per Atlas surface, in one band under the hero, replacing the hero's figure chips and the overview/composition tabs:
- **Ontology** — this project's domains, capabilities and elements as figures; a note line saying how many relations it holds and how many domains name a capability but hold no element yet. Door: the map, focused on this project
- **Library** — the folder's sources and wiki pages. A folder with neither says so instead of drawing two zeroes. Door: the Library
- **Harness** — no figure: the harness is read from the source tree the folder belongs to, which needs a native path, so the cell names what the destination holds. Door: the Harness
The caption beside the heading says that sources and wiki pages count the whole folder, because only the ontology half is scoped to this project. Cells are equal height with their doors on one line; three equal columns from `@3xl` of the page column and the ontology cell worth two of the others from `@5xl`.

#### Domain composition
Domain rows (one per domain, uniform height), in a card in the left track beside the summary rail, no longer behind a tab. Each row carries the shared capability:element ratio bar; clicking a row expands its full capability list in place, and the expanded panel links into topology focus for that domain. The former radial mini-map and card grid were retired 2026-08-13 (the map promised size-by-count it could not render — 4.7px between 17 and 6 — and the cards said the same numbers a third time)

#### Body + summary rail
- **Overview card** (left, below the domain rows) — the project document's opening paragraph, a contents line naming its `##` section titles, and a door that keeps reading in the Ontology document. The whole body used to be poured out here; the owner's verdict on 2026-09-19 was that it is too long and does not need to be shown whole
- **Summary rail** (right, 400px from `@5xl`):
  - **Connected projects** card — dependency + `relates`-graph projects, dedup'd, first shown + "+N more" note
  - **Continue with your AI** card — one place for agents on this page: the overview lay-out ask (which opens the in-page agent dock in the installed app with a guarded runtime, and copies the instructions everywhere else), then the copyable MCP/CLI snippet for this exact project slug

#### Footer
- Slug + "file" + the Markdown path this page is drawn from, engraved mono caption (2026-09-19; the updated date, a second copy of the hero's, stands here only when no document is known)

#### Mobile / narrow
- `ProjectQuickEditPanel` doubles as the mobile quick-edit entry (hamburger menu context)
- Search palette (`⌘K`, this page's own project palette) and shortcut sheet (`?`, the shell's) open as overlays (not a route change) so context isn't lost

#### Empty / not-found
- Invalid slug → "Project not found" panel + back-to-workspace button
- Loading → "Loading project data" gray panel

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

### `/project/new` — Create (restructured 2026-07-27)

Empty submission focuses the name and leaves the automatic address folded until it can be derived. Create-and-return confirms the saved project by name and offers a direct detail link, even when its list card is below the fold.


Create is a **different screen from edit**, not the same one with fewer values. Creating asks for one thing — make a project — so the screen asks for exactly the four fields that make one, and nothing else is on top of them.

- **Four essential fields, first screen, no scroll** — name · category · status · short description. Measured at 1512×950: name at y=292, category/status at y=395, description at y=472, primary action at y=698; the whole screen fits without scrolling (also verified at 1024 and 768).
- **The document address (slug) is a caption, not a field.** It is derived from the name; "Set it myself" opens the real input inline (validation errors targeting it open it automatically).
- **Everything else is folded into "Fill in more"** — nameEn, detail, tags, stack, links, dependencies, dates, owner, icon, progress, hub flag. The user opens it; a validation error inside it opens it too.
- **Actions come after the form** — Create & continue / Create & return / Cancel. The old top save cluster is gone in create mode (it let you press "create" before seeing a single input); edit mode keeps its sticky bar.
- **One place teaches.** The four teaching surfaces that used to stack above the form (two tip cards on the page, one header help line, one "1-minute tip" disclosure) all said the same sentence and pushed the actual fields off screen. They are replaced by one subtitle line directly above the fields, plus per-field captions.
- `ProjectQuickCreatePanel` still exists as a component but is no longer surfaced from `/projects` (2026-07-18); this full form remains the canonical create path.

### `/project/fallback` — Static-export fallback

Used when a non-existent slug is hit in static export. Redirects or shows "not found" panel.
