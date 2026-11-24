---
uid: dc082493-610f-480b-9f7b-d438f1bb5631
slug: capabilities/ontology-map
kind: capability
title: Ontology map
display_en: Ontology map
display_ko: 온톨로지 지도
domain: domains/human-workbench
elements: [elements/map-camera, elements/map-density-gate, elements/map-force-layout, elements/map-frame-loop, elements/map-pointer-state]
path: src/views/home/ui/map-surfaces/TopologyMapRenderer.tsx
created_by: "agent:claude-code"
relation_notes: { elements/map-force-layout: You asked for element nodes named by role under the capability that uses them; deciding where nodes sit is this role., elements/map-camera: You asked for element nodes named by role under the capability that uses them; holding what is on screen is this role., elements/map-pointer-state: You asked for element nodes named by role under the capability that uses them; deciding what a gesture means is this role., elements/map-density-gate: You asked for element nodes named by role under the capability that uses them; deciding how much detail to show is this role., capabilities/vault-graph-query: "Considered and rejected as a canvas dependency on 2026-09-22: the canvas draws the home screen's vault-derived nodes and edges, so canvas rendering and the MCP graph engine remain independent readers of the same folder; Gray Area now adds a separate native inspector with fixed private MCP reads (`read_gray_area_evidence` in src-tauri/src/gray_area.rs; the tool allowlist in the `call` method of `EvidenceReader`, src-tauri/src/gray_area/rpc.rs), which qualifies the former app-wide no-MCP-call statement without changing the canvas data path.", capabilities/gray-area-discovery: "The map opens Gray Area for its selected concept or Concept set, and the inspector returns to the existing recorded path without adding an inferred relation (`useTopologyGrayArea` in src/views/home/model/gray-area/use-topology-gray-area.tsx).", elements/map-frame-loop: "The canvas branch of `TopologyMapRenderer` in src/views/home/ui/map-surfaces/TopologyMapRenderer.tsx renders src/widgets/ontology-map/ui/OntologyMap.tsx, which imports `useTopologyLoop` from ./use-topology-loop. This element drives that canvas rendering role. Flat and Neural go through this canvas branch; Hex and 3D paint their own canvases outside it." }
relates: [capabilities/gray-area-discovery, capabilities/vault-graph-query]
---

Lets a person explore the compiled ontology through four map views (Flat, Hex, 3D and Neural), read a concept's meaning and relations, and correct it through the existing workbench.

## Includes
- Layout, selection, hover detail, edge inspection, and a context menu for writing in place.
- Building by hand beside the map: a create card (the `N` key, or the concept list's add rows), a relation editor that finds its target by search, and rename, describe and delete in the detail panel. Each write lands at once and a toast offers Undo.
- The detail panel and edge panel that show what a node or relation says and what proves it.
- Framing the overview on what is actually drawn, centred in the free space between the INDEX panel and the tool rail, and clearing a relation or cluster card the moment the pointer leaves the canvas.

## Excludes
- Storing the graph; the map draws the compiled files and never becomes the record.
- Being the only way to edit; the same changes are reachable through MCP.

## Uncertainty
- The Domain structure browser was removed on 2026-11-25 at the owner's request. The INDEX concept list still lists every concept with no kept parent, and cycle members, as top-level rows (`build-tree.ts`). It keeps only a concept's first parent and says nothing of the others, as Flat, Hex and 3D place by first parent; only Full detail's Belongs to group names every parent. Saying so in the list is owed.
- Read from the folder layout under `src/widgets/ontology-map/` and the repository's note that the renderer is custom canvas-2D with Graphology supplying layout only. Nothing was rendered during this scan, so the interactions above are named from file names rather than seen.
- Checked 2026-09-26 on bundles #1874 and #1883: the overview's drawn centre sat 0 px from the free-area centre at 1040, 1280, 1512 and 1920 wide (it had been 64 to 113 px right), measured in Chromium with the `?e2e=1` probe and in the installed app.
- Re-read 2026-11-16 where the Neural view changed: it packs each cluster of concepts as a volume at seven depth levels, and `src/widgets/ontology-map/neural-gl/neural-gl.ts` paints that frame with three.js where WebGL2 runs on hardware, while canvas 2D draws the same frame everywhere else. The other views stay canvas 2D. Seen in Chromium only; the installed app was not checked.
- Building by hand was exercised 2026-11-20 in Chromium through the browser folder path (`tests/e2e/map/build-by-hand.spec.ts`); the installed app was not checked.
