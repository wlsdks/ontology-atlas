---
uid: c183b392-62bd-455f-a310-c541f49e7c38
slug: capabilities/topology-browsing
kind: capability
title: "Topology Map Rendering & Search"
display_ko: 지도 그리기와 검색
domain: domains/topology-navigation
elements: [elements/global-search, elements/search-palette, elements/topology-controls, elements/topology-index-panel, elements/topology-map-v2]
path: src/widgets/topology-map-v2
created_by: "agent:unknown"
dependencies: [capabilities/design-token-ramps, capabilities/vault-ontology]
relation_notes: { capabilities/vault-ontology: "The map renderer and search consume the compiled node kinds and typed relation vocabulary; changing the vault ontology schema changes what topology can render, filter, and explain.", capabilities/design-token-ramps: "The topology canvas and panels consume the shared topology, motion, radius, and color ramps from app/globals.css; changing those ramps changes map readability and interaction geometry." }
---

## Definition
The capability to render, pan/zoom, and search the entire vault graph on a custom canvas-2D engine. There is no dedicated folder in src/features/, but it is proposed via widget evidence + documentation description (review-required).

## Evidence
- src/widgets/topology-map-v2, topology-controls, global-search (implementation evidence)
- AGENTS.md: Tech stack ("The graph renderer is ours: a custom canvas-2D engine (topology-map-v2)")

## View Modes
- **3D View (2026-08-18; cone tree since 2026-09-02)**: An opt-in mode that lifts the map into depth. The
  ownership arrangement is a **cone tree** (Robertson, Mackinlay & Card 1991): height is the containment tier
  (project apex → domain → capability → element plane) and every parent is the apex of its own cone whose
  children rest on a base circle directly under it, sectors proportional to subtree size, a single child hanging
  straight down (`layoutConeTree`). It replaced the 2026-08-18 dome of latitude rings after measurement showed
  70% of the nodes crowding one bottom ring (`docs/DECISIONS.md` 2026-09-02). Enabled via the "3D" chip in the
  top toolbar. Auto-rotation (48s/rev; stops if the user drags the view, disabling auto-rotation and re-enabling
  "auto-align"·3D re-entry for that session) · Orbit drag (pitch is ±83° full angle before reaching the poles) ·
  In-plane node drag · Wheel zoom · "Reset to Origin" · Selection reframe (selecting a node aligns yaw and camera
  in one clock to frame that node on the front, reframing based on visible area even when panels are open/closed).
  Default is 2D (cross-verified evidence, `docs/DECISIONS.md` 2026-08-18). Implementation:
  `src/widgets/topology-map-v2/model/dome-view.ts`, config key `atlas.appearance.view3d`.
- **3D Representation Layers (2026-08-18 3rd iteration, re-based on the cone tree 2026-09-02)**: Five rendering
  devices. ① **Straight cone edges for containment, bowed meridians for relations** (`domeEdgeControl` takes the
  edge kind; only `depends` rides the shell), ② **Depth halo** (thickly drawing the same geometry in the
  background color just before ink to hide what's behind. Everts et al. 2009), ③ **Edge painter alignment**
  (farthest first), ④ **Cone-base rings** (the project's domain ring plus one base per parent with two or more
  children, sampled in proportion to radius, each arc with its own depth ink. `DomeModel.circles`,
  `render/dome-rings.ts`), ⑤ **Node 3D shading** (assuming a light source slightly upper-left, Sun & Perona 1998).
  All values are derived from `model/dome-view.ts` and the single token `--topology-v2-dome-ring`.
- **3D Manipulation & Motion (2026-08-18 4th iteration)**: Dragging empty space behaves differently depending on location.
  Inside the dome silhouette (an ellipse inscribed in the bbox of drawn nodes, with 1.08 padding) is orbit rotation,
  outside it is camera panning same as 2D (`isInsideDomeGrip`). The check happens only once on pointerdown, and the cursor indicates two zones (`grab` / `move`). Tier twisting
  uses the **same function** (`chargeTierLag`) for both hand drag and programmatic pose movement.
  Entry involves a pose sweep with its own clock (`domeEntrySweep`); if touched by the hand,
  that angle is injected into the pose to prevent screen jumping (`commitDomeEntrySweep`).
- **Camera Trajectory (2026-08-18 5th iteration)**: Programmatic camera movement changed from axis-by-axis linear interpolation to
  **van Wijk & Nuij optimal path** (`vanWijkCameraKeyframe`, ρ=1.42).
  Scaling is interpolated logarithmically, and for long movements, the camera retreats then dives back in,
  keeping optical flow consistent. Orbit release projects a natural landing point;
  if near a domain meridian, it aims there (`projectOrbitLanding` ·
  `domeFacingYaws` · `snapOrbitLanding`). The time constant for approach is
  inversely calculated from the release speed to ensure velocity continuity (`orbitSnapTauMs`).
- **Arrangement Criteria (2026-08-18 6th iteration; morphing switch 2026-09-02)**: 3D has two arrangement modes. `ownership` (default)
  is the cone tree (height=tier, position=parent), `coupling` is a 3D force
  cloud where relationships determine position (`relaxCouplingCloud`: push all pairs + relationship springs + cooling, ownership coordinates
  warmstart with random 0). The cloud does not draw latitude rings or hull warping. Config key
  `atlas.appearance.map-arrangement`, UI is the picker opened by the "3D" chip at the top of the map
  (`widgets/search-hint/ui/View3dMenu.tsx`). Three lines (flat·cone·cloud) so "Turn off 3D" and "Choose shape" are read in one place.
  A switch while 3D is on rebuilds in frame-budget slices and **morphs** the coordinates over the pose-move cap
  (`beginDomeMorph`), refitting the camera only when the new shape overflows the viewport; a dome that has fully
  left the screen rests its motion state (`settleDomeRuntimeOffscreen`) so the 2D idle gate can fold again.

## Large Map Overview and ACP Exploration (2026-08-22)
- Top "Expand All" opens all containment parents for the session only, and fits all rendered
  nodes into the screen bounds at once. Pressing again collapses the bulk expansion. Individual `+N` and URL `?open=` contracts remain unchanged.
- Newly arrived INDEX roots are opened by default, but roots the user has already closed are not re-opened. Map cold boot uses a central loading visual shared by server and client to indicate only the current work.
- ACP moves only the typed input of Atlas `get_concept` and `find_path` actually called in the current turn to map state. Only real slugs are focused, and paths highlight only exact shortest-path edges. Natural language in agent answers is not a basis for map movement.
- Node details are collapsed into one primary action and edit/more menu; relationship line samples are shown only upon request from existing shortcut help instead of the permanent map legend.
- On 14-inch screens, if the agent dock and node inspector stand together, the top command row moves to the remaining center of the map excluding inspector width and inset, and the central/right chrome collapses into icon density while the dock is open. It reads current panel tokens, not screen pixels.
- Every frame during agent dock·split·window resize, the camera target for overview·focus·realm·
  spotlight (the currently meaningful state) follows to the new available area.
  It follows using a spring for live input, then finalizes the final target and velocity 0 on the dock settling frame to prevent underdamped 2nd-order movement, preserving cameras panned/zoomed directly by the user. Node inspector release targets the safe area after the panel disappears (not DOM width during exit) to prevent residual offset leaving the whole map shifted left.

## Confidence
medium-high (0.85): Explicitly states that the capability candidate is supported only by widgets/ evidence, not features/ folder
