---
uid: dc082493-610f-480b-9f7b-d438f1bb5631
slug: capabilities/ontology-map
kind: capability
title: Ontology map
display_en: Ontology map
display_ko: 온톨로지 지도
domain: domains/human-workbench
elements: [elements/map-camera, elements/map-density-gate, elements/map-force-layout, elements/map-frame-loop, elements/map-pointer-state]
path: src/views/home/ui/TopologyMapRenderer.tsx
created_by: "agent:claude-code"
relation_notes: { elements/map-force-layout: You asked for element nodes named by role under the capability that uses them; deciding where nodes sit is this role., elements/map-camera: You asked for element nodes named by role under the capability that uses them; holding what is on screen is this role., elements/map-pointer-state: You asked for element nodes named by role under the capability that uses them; deciding what a gesture means is this role., elements/map-density-gate: You asked for element nodes named by role under the capability that uses them; deciding how much detail to show is this role., capabilities/vault-graph-query: "Considered and rejected as a canvas dependency on 2026-09-22: the canvas draws the home screen's vault-derived nodes and edges, so canvas rendering and the MCP graph engine remain independent readers of the same folder; Gray Area now adds a separate native inspector with fixed private MCP reads (src-tauri/src/gray_area.rs:148-153,233-250; src-tauri/src/gray_area_rpc.rs:124-131), which qualifies the former app-wide no-MCP-call statement without changing the canvas data path.", capabilities/gray-area-discovery: "The map opens Gray Area for its selected concept or Concept set, and the inspector returns to the existing recorded path without adding an inferred relation (src/views/home/model/gray-area/use-topology-gray-area.tsx:23-90).", elements/map-frame-loop: "The canvas branch in src/views/home/ui/TopologyMapRenderer.tsx:279 renders src/widgets/ontology-map/ui/OntologyMap.tsx, which imports useTopologyLoop from ./use-topology-loop at line 12. This element drives that canvas rendering role. The named membership branch at TopologyMapRenderer.tsx:264 renders src/widgets/ontology-map/structure/DomainStructureMap.tsx with local React/DOM state; it does not invoke the canvas loop. Element membership records the canvas implementation role without requiring it for every map view." }
relates: [capabilities/gray-area-discovery, capabilities/vault-graph-query]
---

Lets a person explore the compiled ontology through geometric maps or a named membership browser, read a concept's meaning and relations, and correct it through the existing workbench.

## Includes
- Domain structure browses recorded direct contains and child-side belongs_to relations with named children and a reversible breadcrumb. Shared parents, missing levels, cycles, and concepts outside project paths remain discoverable; it never infers membership from dependencies.
- Layout, selection, hover detail, edge inspection, and a context menu for writing in place.
- The detail panel and edge panel that show what a node or relation says and what proves it.
- Framing the overview on what is actually drawn, centred in the free space between the INDEX panel and the tool rail, and clearing a relation or cluster card the moment the pointer leaves the canvas.

## Excludes
- Storing the graph; the map draws the compiled files and never becomes the record.
- Being the only way to edit; the same changes are reachable from the CLI and MCP.

## Uncertainty
- Domain structure replaces the retired Galaxy renderer. The current static-export browser journey reaches a domain, capability, and its existing reader without spatial zoom; this is presentation evidence, not semantic acceptance or a universal performance result.
- Read from the folder layout under `src/widgets/ontology-map/` and the repository's note that the renderer is custom canvas-2D with Graphology supplying layout only. Nothing was rendered during this scan, so the interactions above are named from file names rather than seen.
- Checked 2026-09-26 on bundles #1874 and #1883: the overview's drawn centre sat 0 px from the free-area centre at 1040, 1280, 1512 and 1920 wide (it had been 64 to 113 px right), measured in Chromium with the `?e2e=1` probe and in the installed app.
