---
uid: cc95edb1-2eab-4752-941f-8bcf99d19769
slug: elements/ontology-map
kind: element
title: Topology Map V2
display_ko: 지도 렌더러 v2
domain: domains/topology-navigation
path: src/widgets/ontology-map
created_by: "agent:unknown"
dependencies: [elements/knowledge-graph]
relation_notes: { elements/knowledge-graph: "The canvas renderer draws the node/edge model the knowledge-graph entity derives; src/widgets/ontology-map imports @/entities/knowledge-graph." }
---

Custom canvas-2D graph renderer core. Core implementation evidence for capabilities/topology-browsing. AGENTS.md Tech stack: "The graph renderer is ours".

Galaxy is an explicit flat presentation of the same graph with its own stable three-arm layout. The project is the core, real domains anchor contiguous constellations, and containment descendants form nearby deterministic clouds. Every real concept remains present; the overview hides the default edge mesh and reveals actual adjacent relations on hover or selection. Concepts paint as borderless circular light cores with radial coronas, deterministic bounded twinkle, and kind-temperature ink; INDEX and inspector text keep kind explicit. Revealed typed relations become source/target-temperature luminous filaments while preserving solid/dashed, direction, selection, and walked-path precedence. Seeded dust and an occasional procedural meteor are atmosphere only, never graph records, activity, or agent execution; reduced motion freezes stars and omits meteors.

Galaxy inspection keeps expansion mounted, smoothly approaches the selected star in the free canvas beside the detail panel without zooming out a closer view, and restores the pre-selection camera on close unless the person navigated meanwhile. The opt-in 3D views remain inside this widget: cone/strata ownership layouts and the relation-driven Neural arrangement project into the same canvas and camera.

## Evidence

- Primary implementation: `src/widgets/ontology-map/ui/use-topology-loop.ts#useTopologyLoop`
- Galaxy visual model: `src/widgets/ontology-map/model/galaxy.ts`
- Galaxy spatial model: `src/widgets/ontology-map/model/galaxy-layout.ts`
- Galaxy paint: `src/widgets/ontology-map/render/node-shapes.ts#drawGalaxyNodeStar`
- Focused interaction test: `tests/e2e/map-selection-framing.spec.ts#Galaxy inspection approaches the star, returns context, and yields to later camera input`
- Design contract: `tests/contract/galaxy-living-sky.contract.test.ts`

## Includes

- The custom canvas-2D graph renderer, draw loop, hit testing, camera, and the `?e2e=1` inspection hook sharing one per-frame position map.
- Flat and Galaxy presentations plus the Cone, Strata, and Neural projected arrangements inside the same renderer.
- Galaxy-specific stable positions, atmosphere, attention-based relation reveal,
  and reversible selection framing without changes to ontology facts.

## Excludes

- Any alternative graph-rendering library: Graphology supplies ForceAtlas2 layout only.
- INDEX, hub rail, search, and detail surfaces around the canvas, each owned by its own widget.
- The knowledge-graph node/edge model this widget draws, owned by elements/knowledge-graph.
