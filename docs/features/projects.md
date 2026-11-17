---
title: Projects
doc_type: feature
status: current
area: projects
routes: [/projects, /project/[slug], /project/[slug]/edit, /project/new, /project/fallback]
---

# Projects

### `/projects` — Project list (rebuilt 2026-07-18)

**The door opens the selected project** (2026-09-19, decision "With one project, the Projects door opens that project", widened 2026-11-17): the rail, its keyboard shortcut and the mobile tab bar open the selected project's page. The selected project is the one whose page was opened last in this app session for the open folder, while it still exists; otherwise the folder's only project; with several projects and none opened yet the door opens this list. The selection is kept in memory only, per open folder, so a folder switch or a reload does not carry it. The list stays one press away from every project page through the control at its top left, and it is still where a project is created. One hook answers for all three doors (`useProjectsDoorHref`), so the rail and the tab bar cannot disagree.


The project index uses the shared page frame and compact rows so several project
documents can be scanned by name and authored purpose. There is currently no
in-page filtering.

#### Header
- The shared header bar: the title, the project count on its baseline (hidden below 640px, kept for screen readers) and, for the bundled sample, the open-folder action; adding a project lives in the section under the cards, or on the stage while no project exists
- The bundled example state is labelled as a loaded sample rather than presented as the user's folder
- The lede says what choosing does: with several projects that the Projects tab opens the one picked, with one that the folder has one project and the tab opens it
- With at most one project the lede, the cards and the add section are one stage centred in the window; from two the grid starts under the bar. While a browser folder opens, a centred wait names it

#### Rows (one `<article>` per project, sorted by `updatedAt` desc, the selected project first)
- The selected project's card carries a "Selected" tag beside its name and the strong border at rest, and its name link is `aria-current`. With one project that project is the selected one; with several, a card is marked only after its page was opened in this session
- Project name linked to its detail page. The name is the locale's `display_<locale>` when the document carries one, the canonical `title`/`name` otherwise (`projectDisplayName`, 2026-09-19, decision "A project is drawn by its locale display name on every screen"): the map, the INDEX and the Library already drew the project by that word, and the list and the page said the canonical title beside them
- One-line explicitly authored frontmatter description, with neutral fallback when missing
- Relative last-updated time
- Clearly labelled "View details" and "View on map" actions, both secondary: the page has at most one indigo action, "New project", and only while no project exists (2026-10-15 — N cards gave N indigo chips beside the tile's own). "View on map" opens the project's own node (`?p=project:<slug>`), whose datasheet carries the code evidence and the control that connects the code folder (2026-09-25 — it sent the bare slug, which opens the project drawer, where neither exists)

- Adding a project: a section under the grid, separated by a hairline and not drawn as a card, with the heading "Add a project" and two columns from `md` (stacked below): the "New project" form and the request to copy for an agent, each under the sentence that explains it. The grid holds project cards only; an odd last card leaves its partner cell empty
- A project added on its own page rises 8px and fades in over `--motion-base` when the list reopens, and the add section glides on the surface spring; a reload or a folder switch shows every card still. Reduced motion fades in place over `--motion-fast` (2026-10-16)

#### Empty state
- No projects at all → one centred stage in place of the lede and the add section: artwork of a project card being composed (name, definition line, domain rows whose bars fill once on arrival), the primary "New project" action, the secondary request to copy for an agent, and the `kind: project` note. When the first project appears the stage fades out where it stood and the card rises; reduced motion shows the composed card still

### `/project/[slug]` — Project detail (the brief beside what to check, 2026-11-17)

One page, no tabs, one level below `/projects`. It answers four questions in
order, the first three inside the first screen: what the product is, what to
check now and why, what changed lately in the recorded meaning, and what it is
made of; then one quiet closing line. The 2026-11-15 decision "The project
page reads as a brief" set the order and removed the boxes; the 2026-11-17
decision "The project page sets what to check and what changed beside the
brief" narrowed its one column after the owner asked why the right half was
empty. Sections are separated by spacing and a hairline; no section sits in a
box, and nothing on the page unfolds in place: no `<details>`, no chevron row.

#### The band beside the brief
- Under 64rem of page column everything is one column: name, lead text, actions, "To check", "Changed". From 64rem the brief sits beside "To check" and "Changed" runs under both as one strip of three equal slots; from 90rem the brief, "To check" and "Changed" sit side by side. The arrangement changes by container width only; nothing animates between them
- **To check** lists at most three concepts of this project, each once, under the highest-ranked of its typed reasons: raised for a person, changed after a person checked it, a source file changed after the document was written, could not be checked, no definition sentence. A concept with no document of its own gets no "no definition" row. No reason takes more than two slots while another has a row waiting. A row is the kind glyph, the name, its domain, and the reason as a sentence: a raised row is a fixed label followed by the agent's note in the locale's quotation marks, and a stale row names the file, the changed one before a missing one. It opens the concept on the map, or its document when the reason is about the document; its accessible name is what it shows, and where it opens is its description. The heading and "View all N" count concepts; the centred dialog lists every reason group
- One sentence under the heading says where the stale count comes from: how many of this project's capabilities that name a source file have one that changed after their document, that Git history is being read, that only the desktop app reads it, that it could not be read, or that no capability of this project names a file. Its height is reserved for the tallest of these, so it does not move when the Git walk ends
- **Changed** lists at most three concepts of this project changed in the adaptive recent window (seven days by default; Git dates in the app, file dates on the web), name and day, each opening the concept on the map; "View on the map" opens the map's recent filter
- Three row slots are always reserved in both lists, so rows arriving after the Git walk shift nothing (band and page height step 0 px, sampled per frame). "Nothing to check" waits for both the review queue and the Git walk and fades in place; a re-read keeps the previous rows until the new ones arrive
- Evidence states come from the Git walk the map uses (`useMapEvidenceStates` in `src/features/vault-ontology/`): a screen that mounts shows the folder's last answer and walks again in the background, joining a walk already running for the same paths; a failed walk is never kept, and one folder never shows another's answer. Paths go to Git in batches of 512. The facts are built only under a found project in the installed app; the page computes no new fact, writes nothing and sends nothing

#### Identity
- One chip at the top left leads to the list, named for what the list offers from here: "Other projects" when the folder has several, "Add a project" when it has one, "Project list" on the not-found and loading states. There is no breadcrumb: the name is the heading below it
- Project kind glyph and inline-editable name (`InlineEditable`, when the project can be managed; the word shown is the locale's `display_<locale>` when present, and editing it in place edits that key, otherwise the canonical name). The name stays the page's level-1 heading for the people who can edit it, and its accessible name is the project name
- One meta line: Hub label, or "Individual project" when the folder holds several, the status when set, and the updated date
- The authored description (inline-editable) at `text-title`, then the project document's lead paragraph at reading size and the prose measure: the paragraph above the first `##`, else the first section's, starting after the sentence the description already says, with wikilinks read as their labels. The numbered list of the document's own headings is gone. "Keep reading in the Ontology document" opens this project's own Markdown file (`/docs/?slug=<doc>`), or the vault root when the file is unknown
- The read-only sample says so in one line beside the open-folder action
- The lead paragraph sits inside the first screen at 1280x720 (`tests/e2e/projects/project-brief-page.spec.ts`)

#### Actions
Beside the name where the page column is at least 64rem wide (`@5xl` of `project-page`), under the lead text below that:
- One filled action, "View topology", which opens the project's own node on the map (`?p=project:<slug>`)
- One outline action, "Copy map-reading starter", with a quiet "Preview what gets copied" text button under it that opens the shared centred `Dialog` with the same text
- One overflow menu ("More"), which opens under its trigger with right edges aligned on the elevated menu surface: copy link, the Ontology document, quick edit (only when the project can be managed; it opens `ProjectQuickEditPanel`), import review JSON, the overview instructions, and new project (`/project/new`). The overview instructions open a dialog with the sentence that says what the agent will do, the prompt itself, and the action: copy it, or, in the installed app with a guarded runtime, open the page's agent dock with it

#### Construction review
`Import review JSON` reads one local qualification envelope into React session state only and places a full-width review between the identity and the composition. The default depth keeps purpose, current/next decision, first blocker/diagnostic, red/unknown/conflict, human approval, and exact plan counts visible. `View rationale/diagnostics` expands the same artifact's CQs, source-bound witnesses and citations, examples/counterexamples, seven quality axes, diagnostics, exact review/write plans, and digest equality, and a session-only expert draft for CQ wording, witness source references and the exact plan; edits are visibly dirty, can be restored, never mutate the receipt, vault or localStorage, and require qualification again before any write. Malformed, wrong-project, digest-mismatched, or unequal-plan envelopes fail closed. The completed read moves keyboard focus to the result or error region; errors offer another file picker in place. Nothing is uploaded, remembered, or written to the vault.

#### What it is made of
- One heading line, "Composition", carrying this project's counts in words: domains, capabilities, elements and the relations among them
- One legend line: the bar's two segments, what its length means, and, only when evidence was measured, the amber dot ("source changed after the document")
- The domains as master and detail across the whole page column (list `4fr`, at least 20rem; detail `8fr`). Left: a listbox ordered by concept count; each row is the domain glyph, the name, a bar, an amber dot and the count of its capabilities whose source changed (when above zero, named in words for assistive technology) and the concept count. The bar's length is the domain's concept count against the largest domain's, and its two neutral segments, a 1px seam apart, are capabilities and elements. Past twelve rows the list scrolls inside itself. One row is always selected, the first on arrival; arrow keys, Home and End move the selection and focus
- Right: the selected domain's name with "Open this domain in the map" and its capability and element counts on the heading line, the first sentence of its own summary when it has one, then its capabilities as a grid of one, two or three columns (kind glyph, name, an amber dot when its source changed after its document, a teal dot when it changed in the recent window, the elements under it when above zero), each opening that concept on the map; twelve, then "View N more". Both dots carry their meaning as an accessible name and a tooltip. The detail reserves its height, so selecting another domain never changes the page height. Below `@3xl` of the page column the list sits above the selected domain
- When nested domains make the rows' sum exceed the heading's counts, one note under the list says a concept in several domains counts once per domain
- A project with no domains says so in one line with the door to connect one on the map

#### Closing line
One quiet line under a hairline: the Harness door only where the desktop app can read the folder, the Changes door, the folder's source and wiki page counts with the Library door, only when the folder has any (with "Sources and wiki pages count the whole folder" when it holds several projects); the first connected project (dependency or `relates` graph) and how many more; and the slug with the Markdown path this page is drawn from, or the updated date when no document is known.

#### Mobile / narrow
- The actions take their own row under the lead text, then "To check" and "Changed" one under the other; the domain list sits above the selected domain
- Search palette (`⌘K`, this page's own project palette) and shortcut sheet (`?`, the shell's) open as overlays (not a route change) so context isn't lost

#### Empty / not-found
- Invalid slug → "Project not found" panel + back-to-workspace button
- Loading → "Loading project data" gray panel

### `/project/[slug]/edit` — Full editor

`ProjectForm` in `mode="edit"` (640px centered form column + 260px companion column; 4 sections + sticky save bar). **Create and edit no longer share one layout** (2026-07-27) — see `/project/new` below.

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
- Save & continue · Save & return · Cancel. Unsaved Cancel, Back and Duplicate actions open an in-app confirmation: Keep editing preserves the form; Discard and leave follows the requested destination. Modified link clicks keep native new-tab behavior. `beforeunload` still guards a browser unload.
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
