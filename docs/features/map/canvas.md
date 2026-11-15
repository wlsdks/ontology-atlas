---
title: Canvas
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Canvas

#### Canvas (`ontology-map` — custom canvas-2D engine; Flat positions come from the dial, and Graphology ForceAtlas2 moves concepts only while one is dragged)

The Flat overview is the dial: [`flat-dial.md`](flat-dial.md).

- **Click node** → on the Flat map the selection is made in place: the camera frames the selection and its lit reach between the panels, zooming in only while every far end it showed stays in view ([`flat-dial.md`](flat-dial.md)), INDEX stays open from 1280 px wide (below that, and in every other view, it folds for the selection), the chrome under the panel fades where it stands (in Hex too, which keeps its two-press Escape), and the right-side panel opens. Clicking the selected node again keeps it; a background click or Escape deselects. A selection from any other source (double-click, Enter, search, INDEX, a panel link, a deep link, an arrow key) frames the node; on the Flat graph INDEX, search, a panel link and a deep link frame it as a click does ([`flat-dial.md`](flat-dial.md)). One Escape clears a Flat selection and its chrome and, whatever made the selection, returns the camera to where it was before the selection framed it unless the reader has panned or zoomed since; a selection a deep link arrived on returns to the overview. The panel: the 352px node datasheet for every kind, a project node's carrying its code-evidence receipt (see "Node datasheet" below). The `ProjectDrawer` opens only for a bare project slug (`?p=<slug>`, the hub rail and a document's project link); the Projects list and a project's page address the project's own node (`?p=project:<slug>`) instead (2026-09-25)
- **Drag node** → reposition (releases back to physics)
- **Drag empty canvas** → the map moves with the pointer in every view; in 3D a drag turns the tree instead (see **3D** below), and in Neural a drag that starts on the structure turns it while one that starts beside it pans. Panning in Neural also stops idle rotation, so the structure does not resume turning after the pan. At the default speed the map stays under the pointer: a 300 px drag moves the drawing 300 px with no smoothing, drawn 5–7 ms after the event at 120 Hz (static export, 2026-10-02). A Neural turn follows the pointer just as directly when the pointer reports as often as the display draws; a slower pointer's step is spread evenly over the frames before the next one, so a 60 Hz mouse on a 120 Hz display turns Neural every frame, half a step behind at most. Letting go while still moving glides as far as 180 ms at the release speed (time constant `--motion-base`), slowing like friction with no bounce back; letting go after stopping holds still, and reduced motion never glides. Hex does not glide.
- **Zoom** → a wheel notch zooms ×1.26 about the pointer and lands 90% of the way in about 0.1 s while the point under the pointer stays put; `+` / `-` step ×1.25 about the centre the same way (Flat, 3D, Neural and Hex) and `0` returns to the fit. A trackpad pinch follows the fingers exactly, read from Chromium's Ctrl-wheel pinch events and from WebKit's gesture events: a Ctrl-wheel run that starts under 50 px stays a pinch until it pauses for 300 ms, even when a busy page merges its events into larger ones, and a run that starts larger (Ctrl with a mouse wheel) zooms one notch at a time. A plain two-finger trackpad scroll zooms rather than pans, and deltas under 4 px are ignored as resting fingers.
- **Speed** → Settings → Map → *Drag speed* and *Zoom speed* (0.5×, 0.75×, 1×, 1.5×, 2×; default 1×, kept on this computer) apply to every view at once: drag speed multiplies how far the map (or the tree's or Neural's turn) moves per dragged pixel and the glide after it, never a dragged node; zoom speed is the power each wheel notch, pinch and `+` / `-` step is raised to (2× turns a ×1.26 notch into ×1.59).
- **Double-click node** (or **Enter** on the focused map) → on the Flat overview, selects and zooms in to the node, never toggling a selected one off; one Escape clears the selection and returns the camera it moved from unless the reader moved the view since; inside a realm, opens or folds its children, the same act as its `+N` chip, and keeps it selected (the "local graph" mode this line once described does not exist; 2026-09-19)
- **Right-click node** → context menu (Focus / Local graph / Copy detail URL)
- **Shift-click 2 nodes** → highlight shortest path
- **The trail you walked** → every node that takes focus is appended to a session trail. The map leaves footprints beside the relation lines actually crossed (offset along the line's own curve, never on it) and a step number beside each visited node; the top-centre **History** chip opens a newest-first mini timeline. Each row carries, under the title, how that step connects to the step before it: the relation word plus the reason recorded on that edge (`relation_notes`), the relation word alone when no reason is written, or "Not directly related" when the two share no edge. **Copy prompt** copies the same per-step lines into a prompt for the agent, so the argument the walk made travels with the names. Earlier history is archived in the vault folder.
- **Dense-group cluster chips** → the Flat overview folds nothing; inside a realm, a parent with more than 12 direct children (e.g. a domain with 108 capabilities) folds its whole subtree into a single `+N` chip instead of spilling hundreds of overlapping nodes/labels. Click the chip to expand just that parent (nodes fan out as a bounded phyllotaxis disk); click the `−` chip to collapse again. Expanded parents live in the URL (`?open=slug1,slug2`) so a shared link or an AI agent reproduces the same expansion. Nested dense children get their own chips once their parent is expanded. Double-clicking the parent node itself does the same as its chip — opens or folds the children — and keeps the node selected; before 2026-09-19 the second click of a double-click undid the first, so the gesture selected and deselected and opened nothing. A second quick click on a node without children keeps the selection too: a repeated click is never an undo (`DOUBLE_TAP_WINDOW_MS`, 350 ms). Selecting a node holds its neighbours in *other* folded parents open — drawn, named, and joined by their lines — so the ego graph shows every relation the panel lists (before 2026-09-19 a capability whose dependencies lived in two folded domains drew 1 of its 3 relations), and each folded parent's chip claims only what still folds. The focus camera target is clamped to the same leash the physics keeps around the focused node; a target outside it made the spring and the clamp fight at full frame rate for the whole selection. Selecting a node holds its neighbours in *other* folded parents open — drawn, named, and joined by their lines — so the ego graph shows every relation the panel lists (before 2026-09-19 a capability whose dependencies lived in two folded domains drew 1 of its 3 relations), and each folded parent's chip claims only what still folds. The focus camera target is clamped to the same leash the physics keeps around the focused node; a target outside it made the spring and the clamp fight at full frame rate for the whole selection. That leash is sized to the screen (2026-09-20): half of the free extent beside the open panels less a 120px edge pad, on each axis, with `--map-camera-focus-pan-margin` as its floor, and the fit scale respects it, so a wide ego graph is centred in the free area instead of its far side landing under the detail panel (measured at 1512: two dependencies at x 1349 and 1369 behind a panel from 1128; after, both left of it).

- **A large folder is drawn while it is still being read** (2026-10-02) → opening a
  folder reads the project first, then `domains/`, `capabilities/` and `elements/`, then
  everything else. In a folder of 400 or more documents, once the read has run 0.2 s, the
  map draws what has arrived, at most once a second: each finished subfolder, and a quarter
  of a subfolder of 400 or more only among the first three draws. It draws documents only,
  never a relation-only node a later file might own. In a folder of up to 2,000 documents
  (`ARRIVAL_GLIDE_CONCEPT_CEILING`), marks already drawn glide to their new places on the
  homing spring and the camera keeps the overview framed until a hand moves it; above that,
  arrival takes the reduced-motion path, as layout picks past 6,300 concepts crossfade: the
  opening rise fades in place, marks land without travel and the camera refits at once. The INDEX names the folder and says "reading N of M documents" until the last file;
  nothing else on any screen reads the part, the previous folder's documents are dropped
  when the first part arrives, and nothing can be written until the read ends. The finished
  map is the one a full read builds. The app reads 64 Markdown files per native call (each
  at most 4 MiB, Markdown only, never through a link into a dot file), eight calls at a
  time; the browser keeps 64 reads in flight. Measured at 120 ms per native answer on the
  static export (median of 3): a 2,000-document vault drew its first frame at 0.87 s
  instead of 16.5 s and finished at 2.0 s; 10,000 documents drew at 0.88 s instead of 77.7 s
  and finished at 4.9 s, with no task longer than 343 ms (492 ms before), no homing spring
  at all, and still frames up to 350 ms apart while documents are parsed. In Chrome over an origin-private folder, 10,000
  documents drew at 0.67 s instead of 26.3 s and finished at 6.6 s. Gate:
  `tests/e2e/vault-session/vault-progressive-open.spec.ts`.

- **A name blocked below tries the slot above** (2026-09-20) → the greedy label
  placer walked the candidates by priority and dropped any whose box overlapped
  one already placed, with no second attempt however much room sat beside it.
  Measured on a folder of 20 concepts at 1512x982 with every group opened: the
  map used 49% of the canvas width and still drew one capability without its
  name, beaten by a neighbour 49px away while its own upper slot was clear. The
  frame already computes that upper slot for every node; the placer now takes it
  as a fallback, and drops the name only when both slots are taken.

- **The agent chip closes what it opened** (2026-09-20) → it wore the active
  tone, reported `aria-expanded`, and called only the open path. Measured with a
  folder open at 1512: the first press opened the dock and narrowed the map's
  canvas from 1448 to 1055, and every press after left the state `true` and the
  canvas at 1055. The dock keeps its own close button; the chip is the second
  way, and the one a person reaches for after opening it there.

- **A realm calls its root one name** (2026-09-20) → entering a realm names its
  root in four places at once, and the ledger's header reached past `display` to
  the canonical `title`: on the sample map the chip, the chip's title and the
  node on the canvas read the Korean display name while the header read
  `Payments`. Its own
  boundary rows and subtree were already localized; the header now uses the same
  `display ?? title` the rest of the screen does.

- **Closing the shortcuts sheet returns the keyboard** (2026-09-20) → the sheet
  records where focus came from as it opens, but the button that opened it
  unmounts in that moment (raising the sheet turns off that button's render
  condition), so the record was empty and the close fell back to the start of
  the content. Measured: open with the map's `?` button, press Escape, focus
  lands on `main` while the button is back in the page. It now names the control
  to come back to, the way the analysis workbench and the architecture dock
  already do, and looks it up after it remounts.

- **The review chip reports its state and closes what it opened** (2026-09-20) →
  it wore the active tone while the meaning panel was open but carried no
  `aria-pressed`, and its handler only ever opened. Measured with the panel open:
  three presses in a row left the panel present and the map's canvas at 928px,
  so a lit control ignored every press. It is a toggle now, matching the rule
  stated beside the replay control — the active tone and `aria-pressed` last for
  exactly as long as the thing the control names.

- **The constellation chip expands a named region** (2026-09-20) → it claimed
  `aria-haspopup="dialog"` while what opened was an unnamed `div`: zero elements
  with `role="dialog"`, no `aria-controls` on the trigger, no accessible name on
  the panel, so a reader heard "expanded" and found nothing to move to. It is a
  disclosure now — the chip points at a named region — because nothing about it
  is modal: no scrim, no focus trap, focus stays on the chip, the map behind
  stays live, and Escape or an outside press closes it.

- **Discarding a walk takes two presses** (2026-09-20) → the session trail is
  discarded rather than archived and cannot be rebuilt, since it is not in the
  URL, yet one press on the trail popover's 45px clear button erased a
  three-step walk with no confirm, no undo and no notice — while the more
  destructive control beside it, clearing every past walk, already asked twice.
  Both clear controls (the chip's ✕ and the footer) now arm the popover and the
  second press discards; the arming releases itself after four seconds.

- **The relation panel's source link is the document's name** (2026-09-20) → it
  read `storefront.md → Open doc`, an arrow between a name and an action inside a
  link that navigates within the app, which `forbidden.md` refuses. The name is
  the label now and the action stays in the accessible name. The glyph sat in JSX
  between two expressions, the one shape the label-decoration gate's two scans
  cannot see; a measured sweep of `src` and `app` found this was the only one.
- Search results navigate to their selected concept after a completed path, clearing the old
  path and inspected relation. While a path still lacks an endpoint, search continues to supply
  that endpoint. Canvas clicks keep the existing path-building behavior.
- **A path names both of its ends** (2026-09-20) → the path lens keeps its nodes
  at full ink, but their labels ranked as ordinary concepts, so an endpoint
  inside an expanded domain disc lost its slot to that domain and the project.
  Asking how one concept reaches another drew the answer with one end named and
  the other anonymous. A lens's own nodes now take the top label band, the same
  one the constellation lens already had.

- **The INDEX tree states its own shape** (2026-09-20) → its rows are siblings in
  the DOM, with the hierarchy drawn as a left margin, so each row carries
  `aria-level` plus `aria-posinset`/`aria-setsize`. Before this a screen reader
  announced the project and its nine domains as ten peers, and an expanded
  domain's capabilities joined that same flat list.

- **The INDEX tree opens only when the person opens it** (2026-11-13) → a caret,
  an arrow key or a typed search opens rows; a selection never opens or scrolls the
  tree, so the panel keeps its height. The nearest visible row above a hidden
  selection carries a dot before its count, strong ink and the hidden text "the
  selected concept is inside"; opening that row moves the mark down. Clearing a
  search returns the rows that were open before typing. At rest the project is
  open and its domains closed; the folder line shows only while files are read.
  The footer keeps two rows, documents not on the map and documents the checks
  caught; a project without a code folder is repaired from its own panel.

- **"Recent" is dated by Git in the app** (2026-09-25) → the INDEX recent-changes
  window, the `?recent=` spotlight and a node's "changed … ago" read each concept
  document's date from one Git walk:
  its last commit, or its file's
  date when Git shows it edited or new since (the rule the bundled manifest is built
  with). A clone, checkout or restored backup stamps every file with the moment it
  landed, so the file dates alone called 98 of 98 concepts changed today. Until Git
  answers the lens counts nothing and the date slot stays empty; the web build,
  which reads no Git, keeps the file dates.

- **The chrome may not eat the map** (2026-09-20) → the camera's side insets are
  absolute pixels (350 for the INDEX panel, 120 for the tool rail), so they did
  not shrink with the window: on an 820-wide canvas they reserved 57% of it, and
  on a 390-wide canvas more than the whole canvas, collapsing the free width to
  one pixel so only the minimum zoom kept a frame. The fit now reserves at most
  half of each axis, and never less than what an open panel measurably covers,
  so the graph still clears the panel. Measured drawn width as a share of the
  canvas: 1512, 1280 and 1024 unchanged; 820 31%→37%, 640 19%→37%, 390 30%→37%.
- **Expand all** → the top action opens every containment parent in one step and
  fits every rendered node inside the map. It is a temporary overview, not a
  saved default; pressing it again collapses the batch. A route arriving with
  existing `?open=` parents also uses full-bounds fitting on its first frame so
  already-open nodes do not begin off screen.
- **How the chip looks and where children land is a setting** (Settings › Expand, 2026-08-01 — ported from the `.qa-scratch/proto-expand.html` measurement prototype). Five values: the open control (`floating pill` · **`bar above`, default** · `shoulder badge`), the child layout (`spiral disk`, default · `fan` · `ring` · `column`), and three numbers — how many open at once (4–24, default 24), how many names are attempted per parent (3–40, default 8), and how many parents stay open at once (1–6, default 3). The default control is the bar docked directly above the **selected** node: nothing shows until you select a node, and the folded count keeps living on the node body. Its words are its own: the bare verb `Expand` (and its Korean equivalent) when one press opens everything left, `Expand {count}` when the batch is smaller, and `Collapse` to reverse it. "Expand all" belongs to the toolbar button, which opens every folded group on the map — until 2026-09-20 both controls said those same words for the two different scopes (`docs/records/decisions/`, "The expand bar names its own scope"). Rationale and the observation that would reverse it: `docs/DECISIONS.md`.
- **Expand realm** → focus a node (click) and an orbital **Expand realm** button appears just outside its ring (also offered as an action in the node datasheet, for container nodes). Activating it transforms the map into *that node's world*: only its containment subtree remains, re-laid-out with the node as a temporary root at the origin (children map to rings by **depth**, not kind), and everything outside unmounts behind a 1px indigo warding circle. Relations crossing the boundary fade to a stub at the ring. The transition is a 600ms choreography — outside nodes fling out along curved "gravity" trajectories, inside nodes FLIP to their new spots, the camera dollies in to fit the realm (`prefers-reduced-motion` snaps instantly). The active realm lives in the URL (`?realm=slug`) so a shared link or an AI agent reproduces the same world; a top-center **Realm: {title} ✕** chip and **Esc** (highest ladder priority) return to the full map. Click, `?open` density gating, selective ego, and top-K labels all still work inside a realm.
- **Ontology block exchange** — feature to exchange concept bundles folder-by-folder. INDEX's
  **Import Block** reads `.md` folders and, if present, `block-manifest.json`, showing **only what is coming in and what conflicts with existing files first**
  (dry-run — running it tentatively without writing anything). Then only the files approved by the person are written via the vault's existing `createDoc` path. **Export this realm's source .mds as a block folder** on the realm expansion screen copies only the source files of the child nodes contained in that realm. The folder picker window uses
  `showDirectoryPicker()` on the web, and Tauri's own picker following the same `FileSystemDirectoryHandle`
  protocol on the installed app. Canceling that window is neither an error nor a write. For terminal-only use, run `ontology-atlas import <path...>`.
- **Tab** → keyboard cycle to neighbor hub
- **Empty state** (0–1 nodes) → `TopologyEmptyState` explains whether the
  vault lacks projects or relations, then offers the applicable next actions:
  bootstrap from found docs, create a node, open Topology INDEX, open the new-concept editor (`/topology/?workbench=create`),
  or choose a vault.
- **Filter active** → bottom-left "filter · N / TOTAL" badge
- **Five map views, chosen in one picker** — the current-view chip in the top tool
  lane opens **Flat** (the ordinary 2D map, default), **Hex board**,
  **Domain structure**, **3D**, and **Neural**. The **Hex board** gives every capability one hexagonal tile: a domain is a
  contiguous region of tiles around its title tile, the project sits at the centre
  with the folder's concept count (the map INDEX's rule),
  and empty cells between regions keep them apart. A tile's brightness and its row
  of dots count its elements (a gold dot is a stale element); a gold rim is stale
  and a dashed, hatched tile is unknown, by the same rule and Git walk as
  the MCP server. Where the evidence was not read at all (the web, or a folder without
  Git history) no tile is marked and one line under the legend says so. Placement is append-only per folder: a new capability takes a free
  cell of its region and a new domain the next free slot, so nothing already placed
  moves; only a region that outgrows its room re-seeds the board, and the board says
  so. Strokes between regions, thicker with their dependencies, show at rest at
  every zoom and step back while a concept is selected. Hovering a tile shows a one-line summary; hovering or selecting a capability
  routes what it needs and what uses it, and selecting a region routes what it
  needs. Selecting opens the flat map's inspector with those routes kept. Routes run only in the
  gaps between tiles, never across one. "◐ Stale only" keeps stale tiles, naming the
  moved file, and recedes the rest; arrow keys move the selection to the
  neighbouring tile, crossing to the next region when there is none. The wheel scales
  the tiles (8–96 px): names appear once every name fits its face, dots and title
  names from 28 px, and below that each region is one nameplate; "⬡ Region names
  only" holds that band. The address carries `?view=hex`.
  A pick that leaves or enters the Hex board carries each concept
  from where the old view drew it to where the new one draws it on the canvas
  spring: the selected concept (else the project) moves first, the rest follow
  their containment parents 35 ms per step, and hubs travel slower; every concept
  lands within 2% of its place by 606 ms, a concept drawn at the same place in
  both views stays still, and a second pick turns them around without losing
  speed.
  A concept one view does not draw leaves into, or
  rises out of, its nearest drawn ancestor, and the arriving view takes over
  without replaying its own entrance. A press, a wheel, a key, a resize, a display
  change or a hidden tab lands the travel at once. A pick into or out of 3D
  travels the same way: each concept lands on the tree mark that draws it, and a
  concept folded into a closed branch lands on that branch's mark. Into or out of
  Neural, into Flat past 6,500 concepts, and into or out of Domain structure, the
  old picture crossfades instead, as every pick does under reduced motion; between
  Flat and Neural the map's own morph moves each concept in place. A view reached
  by address or from another tab switches without motion. Gate:
  `tests/e2e/map/frame-loop/map-layout-morph.spec.ts`.
  A stored Cone or Strata choice and the address `?view=strata` open 3D; a stored
  Neural choice and the address `?view=coupling` open Neural (`?view=neural`).

  **Domain structure** opens named project/domain/capability/element membership
  without spatial zoom. Press a container to browse its direct children and use
  the breadcrumb to return. Read opens the existing concept/document workbench.
  Membership follows recorded contains and belongs_to directions, retaining
  multiple parents, direct levels, and disconnected concepts. Child lists are
  paged, and reduced motion settles immediately. Old Galaxy choices resolve to
  structure; its renderer, placement, sky, and dedicated probes are removed.

  In Map, **My constellations** saves a named set of current ontology concepts
  with its purpose. Opening a saved constellation focuses that whole set through
  `?constellation=<folder UUID>`; `?constellation=new` opens the creation editor.
  The set is durable task context, not a new graph kind or relation.

  **3D** (2026-11-15) draws the ontology as one tree, a picture the flat map does
  not give. The project is the trunk, each domain a bough, each capability a
  branch end and each element a leaf, so what belongs to what is the shape itself.
  A concept hangs under one parent: one that two domains hold is drawn once, and
  concepts under no domain share one loose bough. Siblings keep the order of
  their ids, so adding a capability moves nothing in another domain. Each domain's
  name stands beside its crown with its capability and element counts, the
  project's under the trunk, and a capability's wherever it covers no mark and no
  other name. No relation line is drawn at rest. The address carries `?view=3d`.
- **Pointing and selecting in 3D** — pointing at a concept lights its path down
  to the trunk, draws what it needs and what uses it as arcs (64 at most) and
  names their far ends; a line beside the pointer gives its kind, whether it is
  stale, and how many concepts it needs, is used by and holds. **A click only
  selects**: it keeps that light, opens the compact panel and leaves the rail in
  place; a click on empty ground or Escape clears it. Enter flies to the selected
  concept. Arrow keys walk the tree: Up to the parent, Down to the first child,
  Left and Right to the siblings.
- **Evidence is leaf colour** — a stale element is an amber leaf, and a stale
  capability or domain, or a folded branch that holds stale concepts, carries an
  amber dot, by the same rule and Git walk as the MCP server. Where the evidence
  was not read (the web, or a folder without Git history) nothing is amber and
  one line under the legend says so.
- **Turning and zooming the tree** — a drag turns the tree about its trunk and
  tilts it between 0.17 and 0.70 rad, resisting at either end; letting go while
  still moving keeps it turning and slows it like friction. The camera fits the
  shape the tree sweeps through a whole turn, so turning never resizes it. A
  wheel notch, a pinch and `+` / `-` zoom about the pointer or the centre; `0`
  and Fit return to the resting view.
- **The tree at scale** — a frame draws at most 1,500 marks. A branch whose
  children would sit closer than a readable gap folds into one ringed mark that
  carries their count and their amber; zooming in opens the nearest branches
  first, and a click on a folded mark flies in until it opens. A selected or
  pointed concept and the ends of its arcs are always drawn, whatever is folded
  around them. Model: `src/widgets/ontology-map/model/tree-view/tree-detail.ts`.
- **Growth** — the first time a folder opens in 3D in a session, the tree grows
  from the trunk outward over `--motion-expressive`; the replay tile grows it
  again. A view switch that arrives in 3D does not replay it, the first input
  settles it, and reduced motion draws the tree grown and lands every flight at
  once. At rest the tree draws no frame.
- **Neural** — the ontology as cells and dependencies. Each domain's concepts
  gather in their own cluster, set on a ring round the spin axis and sized by its
  member count, so no two clusters meet at any turn; relations and deterministic
  relation communities settle positions inside a cluster. Group proximity is
  inferred layout, not a new domain or an accepted relation. A concept is a filled
  cell in the strong ink, a capability larger and with a dark nucleus, both growing
  with the square root of their dependency count; the domain is the ringed heart of
  its cluster and the project its own ink. In the app a stale concept's cell is
  amber, by the rule the MCP server uses (one Git walk); the web has no Git walk, so
  nothing there is amber and the legend's quiet line says why. Kind is not drawn
  by colour, and containment is not drawn as a line: only declared `depends_on`
  relations are, as tapered axons that bow a little inside a cluster and share one
  tract through the gap between clusters. Paint, pointer hit test and measurement
  use the same route. Every domain carries its name and a count line (capabilities,
  elements, stale) above its cluster, or below it when above is taken; capability
  names appear only where they fit, element names only for a focus. **A click only
  selects** the concept the frame painted under the pointer; a double-click or Enter
  flies the node to the front in 800 ms and frames its family, and Esc or Home flies
  back. A focus veils everything else, lights what it depends on in the arc ink and
  what depends on it in the reach ink, names each far end on the side its axon
  leaves free, and sets a plate with its name and counts beside it, on the side with
  fewer lit axons. One signal travels each lit axon once over `--motion-expressive`;
  reduced motion shows none, has no spin, and the fly-to arrives at once. The legend
  at the bottom centre names capability, element and stale, and the two arc keys
  with a focus. Pitch stays between 0.15 and 0.95 rad. After closing the detail
  panel, Fit Map leaves the retained selection and returns to the whole map. Gates:
  `tests/e2e/map/neural/`.
