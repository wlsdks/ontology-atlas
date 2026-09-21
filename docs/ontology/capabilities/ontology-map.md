---
uid: dc082493-610f-480b-9f7b-d438f1bb5631
slug: capabilities/ontology-map
kind: capability
title: Ontology map
display_en: Ontology map
display_ko: 온톨로지 지도
domain: domains/human-workbench
elements: [elements/map-camera, elements/map-density-gate, elements/map-force-layout, elements/map-frame-loop, elements/map-pointer-state]
path: src/widgets/ontology-map/index.ts
created_by: "agent:claude-code"
dependencies: [capabilities/vault-graph-query, elements/map-frame-loop]
relation_notes: { capabilities/vault-graph-query: "You asked for what depends on what: the map draws the compiled graph rather than the files, so a change to compiling changes what it shows.", elements/map-frame-loop: "You asked me to turn imports I actually witnessed into dependencies: the scan shows OntologyMap.tsx importing use-topology-loop.ts.", elements/map-force-layout: You asked for element nodes named by role under the capability that uses them; deciding where nodes sit is this role., elements/map-camera: You asked for element nodes named by role under the capability that uses them; holding what is on screen is this role., elements/map-pointer-state: You asked for element nodes named by role under the capability that uses them; deciding what a gesture means is this role., elements/map-density-gate: You asked for element nodes named by role under the capability that uses them; deciding how much detail to show is this role. }
---

Draws the graph as an interactive canvas map a person can move through, and lets them read a node's meaning and edit it without leaving the map.

## Includes
- Layout, selection, hover detail, edge inspection, and a context menu for writing in place.
- The detail panel and edge panel that show what a node or relation says and what proves it.

## Excludes
- Storing the graph; the map draws the compiled files and never becomes the record.
- Being the only way to edit; the same changes are reachable from the CLI and MCP.

## Uncertainty
- Read from the folder layout under `src/widgets/ontology-map/` and the repository's note that the renderer is custom canvas-2D with Graphology supplying layout only. Nothing was rendered during this scan, so the interactions above are named from file names rather than seen.