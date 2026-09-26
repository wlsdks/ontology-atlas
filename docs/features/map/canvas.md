---
title: Canvas
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Canvas

#### Canvas (`ontology-map` — custom canvas-2D engine + Graphology ForceAtlas2 physics)
- **Click node** → right-side panel opens: the 352px node datasheet for every kind, a project node's carrying its code-evidence receipt (see "Node datasheet" below). The `ProjectDrawer` opens only for a bare project slug (`?p=<slug>`, the hub rail and a document's project link); the Projects list and a project's page address the project's own node (`?p=project:<slug>`) instead (2026-09-25)
- **Drag node** → reposition (releases back to physics)
- **Double-click node** → opens or folds its children, the same act as its `+N` chip, and keeps it selected (the "local graph" mode this line once described does not exist; 2026-09-19)
- **Right-click node** → context menu (Focus / Local graph / Copy detail URL)
- **Shift-click 2 nodes** → highlight shortest path
- **The trail you walked** → every node that takes focus is appended to a session trail. The map leaves footprints beside the relation lines actually crossed (offset along the line's own curve, never on it) and a step number beside each visited node; the top-centre **Trail** chip opens a newest-first mini timeline. Each row carries, under the title, how that step connects to the step before it: the relation word plus the reason recorded on that edge (`relation_notes`), the relation word alone when no reason is written, or "Not directly related" when the two share no edge. **Hand off to AI** copies the same per-step lines into the agent brief, so the argument the walk made travels with the names. Past trails are archived in the vault folder.
- **Dense-group cluster chips** → a parent with more than 12 direct children (e.g. a domain with 108 capabilities) folds its whole subtree into a single `+N` chip instead of spilling hundreds of overlapping nodes/labels. Click the chip to expand just that parent (nodes fan out as a bounded phyllotaxis disk); click the `−` chip to collapse again. Expanded parents live in the URL (`?open=slug1,slug2`) so a shared link or an AI agent reproduces the same expansion. Nested dense children get their own chips once their parent is expanded. Double-clicking the parent node itself does the same as its chip — opens or folds the children — and keeps the node selected; before 2026-09-19 the second click of a double-click undid the first, so the gesture selected and deselected and opened nothing. A second quick click on a node without children keeps the selection too: a repeated click is never an undo (`DOUBLE_TAP_WINDOW_MS`, 350 ms). Selecting a node holds its neighbours in *other* folded parents open — drawn, named, and joined by their lines — so the ego graph shows every relation the panel lists (before 2026-09-19 a capability whose dependencies lived in two folded domains drew 1 of its 3 relations), and each folded parent's chip claims only what still folds. The focus camera target is clamped to the same leash the physics keeps around the focused node; a target outside it made the spring and the clamp fight at full frame rate for the whole selection. Selecting a node holds its neighbours in *other* folded parents open — drawn, named, and joined by their lines — so the ego graph shows every relation the panel lists (before 2026-09-19 a capability whose dependencies lived in two folded domains drew 1 of its 3 relations), and each folded parent's chip claims only what still folds. The focus camera target is clamped to the same leash the physics keeps around the focused node; a target outside it made the spring and the clamp fight at full frame rate for the whole selection. That leash is sized to the screen (2026-09-20): half of the free extent beside the open panels less a 120px edge pad, on each axis, with `--map-camera-focus-pan-margin` as its floor, and the fit scale respects it, so a wide ego graph is centred in the free area instead of its far side landing under the detail panel (measured at 1512: two dependencies at x 1349 and 1369 behind a panel from 1128; after, both left of it).

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

- **The INDEX tree follows the selection** (2026-09-25) → a node selected anywhere
  but on its own rows — a `?p=` link, the canvas, the palette, or a pick from the
  INDEX search that was then cleared — opens the rows above it once and scrolls its
  row into view; a branch folded again stays folded until the next selection.

- **"Recent" is dated by Git in the app** (2026-09-25) → the INDEX recent-changes
  window, the `?recent=` spotlight, the dusty rows, a node's "changed … ago" and the
  Analysis Recent changes tab read each concept document's date from one Git walk:
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
  bootstrap from found docs, create a node, open Topology INDEX, open Workshop,
  or choose a vault.
- **Filter active** → bottom-left "filter · N / TOTAL" badge
- **Six map views, chosen in one picker** — the current-view chip in the top tool
  lane opens **Flat** (the ordinary 2D map, default), **Territories**, **Hex board**,
  **Galaxy**, **Strata**, and **Neural**. Territories is the flat plane with nothing
  folded: every capability is drawn and named on open shelves fanning out from its
  domain's mark, each domain in its own angular territory around the project, with
  no hull around any of them. A capability's disc grows with its element count;
  elements are drawn only when their capability is selected. The ring states the
  evidence with the same rule the analysis brief uses (the app dates cited code
  against the document in one Git walk): solid is current, amber is stale, broken
  is unknown, and the web says every state is unknown rather than guess. Each
  domain's title carries its capability, element and stale counts, and rolled-up
  strokes with a count join domains whose capabilities depend on each other.
  Selecting uses the flat map's inspector; the selected capability shows its
  elements and its own dependency arrows. The view survives in the address as
  `?view=territories`, pans but never zooms, and past about ten domains or seven
  shelves per territory draws discs only, naming them on hover and in focus.
  The **Hex board** gives every capability one hexagonal tile: a domain is a
  contiguous region of tiles around its title tile, the project sits at the centre,
  and empty cells between regions keep them apart. A tile's brightness and its row
  of dots count its elements (a gold dot is a stale element); a gold rim is stale
  and a dashed, hatched tile is unknown, by the same rule and Git walk as
  Territories. Placement is append-only per folder: a new capability takes a free
  cell of its region and a new domain the next free slot, so nothing already placed
  moves; only a region that outgrows its room re-seeds the board, and the board says
  so. At rest, strokes between regions count their dependencies; hovering a tile
  shows a one-line summary and routes what it needs and what uses it, and selecting
  opens the flat map's inspector with those routes kept. Routes run only in the
  gaps between tiles, never across one. "◐ Stale only" keeps stale tiles, naming the
  moved file, and recedes the rest; arrow keys move the selection to the
  neighbouring tile, crossing to the next region when there is none. The wheel scales
  the tiles (8–96 px): names appear once every name fits its face, dots and title
  names from 28 px, and below that each region is one nameplate; "⬡ Region names
  only" holds that band. The address carries `?view=hex`.
  The Cone left the picker on 2026-09-25; a stored Cone choice opens Strata.
  Galaxy gives every real concept a stable
  three-arm position: the project forms the core, domains anchor contiguous
  constellations, and their actual descendants form nearby clouds. The overview
  names the project and domains while hiding the default relationship mesh;
  hovering or selecting a star reveals only its actual adjacent relations.
  Concepts render as borderless light cores with radial coronas and bounded
  deterministic twinkle. Each concept's corona and glint flare independently on
  a distinct 4–8 second interval while its contrast-safe core stays visible.
  Revealed relations become source/target-temperature
  luminous filaments while retaining their solid/dashed and direction semantics;
  seeded dust and an occasional
  procedural shooting star on a varied entry-seeded path sit behind the graph
  and are never graph records.
  In Galaxy, **My constellations** saves a named set of current ontology concepts
  with its purpose. Opening a saved constellation focuses that whole set through
  `?constellation=<folder UUID>`; `?constellation=new` opens the creation editor.
  The set is durable task context, not a new graph kind or relation.
  Two cached diffuse-gas layers carry fine dust through shallow counter-moving
  arcs inside the fixed arms; concept positions and the anchored base field never move.
  Three cached texture draws avoid rebuilding the dust particles on every frame.
  Reduced motion freezes the atmosphere and omits the meteor. Galaxy inspection
  keeps the expanded constellation mounted and smoothly approaches the selected
  star in the free canvas beside the inspector. It never zooms out a view the
  person already brought closer; closing restores the pre-selection camera unless
  the person navigated meanwhile, and selecting another concept retains that
  original return. **Strata** (2026-09-06, the default 3D view since 2026-09-25)
  lays the four kinds out as stacked planes — project on top, then domain,
  capability, element — each drawn as a lit translucent floor, so
  "which level is this on" is a glance rather than an inference. Each plane's
  name stands **beside its own rim** (2026-09-26), just outside the plane's right
  edge or else its left, re-placed as you orbit or morph, and only where it lands
  on nothing: no concept, no other name, no other plane and none of the map's
  chrome. Concept names and relation captions give way to it, and hovering a name
  raises its plane's ring. A plane with no clear place beside it stays unnamed
  rather than named somewhere else; the colour key along the bottom names every
  kind. Measured on the product's own ontology: all four names at 1512x949, three
  at 1040x720. The names replaced a rail at the right edge (2026-09-06) and a
  stack in the bottom-right corner (2026-09-07) that named no plane in
  particular. On a Strata plane
  a node keeps its parent's bearing, which makes every containment drop short,
  near-vertical and unable to cross a sibling's; a node whose parent is not in the
  map falls to the outer rim of its own plane, where "nothing above holds this"
  is a position rather than a missing line. Neural uses all real relations instead of containment coordinates and
  lets relations decide all three coordinates. Switching between any two runs the
  same continuous morph — nodes travel, they do not cut — and the choice is
  remembered. Measured on the sample vault (2026-09-06): Strata leaves 2
  overlapping node pairs at 1512x982, and none of them are same-tier. Geometry:
  `buildStrataTargets` in `src/widgets/ontology-map/model/dome-view.ts`; gates:
  `tests/e2e/map-3d-strata-drawing.spec.ts` and
  `tests/contract/strata-fit-fill.contract.test.ts`.
- **The lit 3D map** (2026-09-25) — Strata and Neural are drawn as light in the
  canvas-2D engine. Each Strata plane is a translucent floor in its kind's colour
  with a faint polar grid, and every domain owns a band of the capability and
  element floors, the same sector its descendants' bearings never leave. Nodes
  emit a halo in their kind colour, and **evidence is the light**: a current
  concept emits fully, a stale one keeps a dimmer core and wears a 1 px amber
  ring, and an unknown one emits nothing and wears a dashed ring. The states come
  from the rule the analysis brief and the MCP server use (one Git walk in the
  app); the web has no Git walk, so everything there is unknown and the legend
  (bottom left: kinds and evidence counts) says so. Neural gathers its clusters
  around the domains. **A click only selects**; a double-click or Enter flies the
  node to the front in 800 ms and frames its family, and Esc or Home flies back
  to the view it left. A focus lights one subtree, apex to leaves, and sinks the
  rest into a deeper fog (down to 0.28 at the back); particles run only along
  that subtree's dependency edges. Pitch stays between 0.15 and 0.95 rad, so the
  floors are always seen from above. Reduced motion: no spin, no particles, the
  fly-to arrives at once. Gate: `tests/e2e/map-3d-lit-strata.spec.ts`.
- **Neural composition and readable 3D connections** — Neural uses deterministic
  relation communities as a layout aid, with tighter local groups, lit cell bodies,
  and shallow connection arcs. Group proximity is inferred layout, not a new domain
  or an accepted relation. Strata keeps containment straight; other 3D
  relations have bounded curves whose paint, pointer hit test, and measurement
  share the same live endpoints. Reciprocal facts take opposite arcs. Labels are
  larger in 3D; after closing the detail panel, Fit Map remains available to
  leave retained selection and return to the whole map. Relation types, depth occlusion, ink floors,
  keyboard navigation, and reduced-motion behavior remain part of the contract.
- **A click lands on the concept you are pointing at, in every 3D arrangement**
  (2026-09-06) — the pointer answers with whatever the frame painted under the
  cursor, and the small pressable ring around a dot no longer competes with a
  painted disc. Before, a near, larger concept could answer for a smaller one
  drawn beside it: measured on the sample vault by pointing at each drawn centre
  in turn, 4 of 125 answered wrongly in the Cone at 1512x982 and 12 of 125 at
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
