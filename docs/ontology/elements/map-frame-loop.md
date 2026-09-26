---
uid: 01024539-120b-461c-a68b-eef16ba8d327
slug: elements/map-frame-loop
kind: element
title: Map frame loop
display_en: Map frame loop
display_ko: 지도 프레임 루프
domain: domains/human-workbench
path: src/widgets/ontology-map/ui/use-topology-loop.ts
created_by: "agent:claude-code"
dependencies: [elements/map-camera, elements/map-density-gate, elements/map-force-layout, elements/map-pointer-state]
relation_notes: { elements/map-density-gate: "You asked where the import moved after the loop hook was split: src/widgets/ontology-map/ui/use-topology-visibility-state.ts:8 takes ClusterChip from model/density-gate.ts and holds this frame's chips (:40) and not-drawn set (:47) for hit-testing.", elements/map-pointer-state: "You asked where the import moved after the loop hook was split: src/widgets/ontology-map/ui/use-topology-interaction-state.ts:7 imports INITIAL_POINTER_MACHINE_STATE from interaction/pointer-state-machine.ts, and :25 seeds the loop's pointer ref with it.", elements/map-camera: "src/widgets/ontology-map/ui/topology-physics-step.ts:11 imports stepCamera from the camera module and advances it once per frame; the loop runs that step inside src/widgets/ontology-map/ui/topology-camera-frame-stage.ts:243, the stage it creates at src/widgets/ontology-map/ui/use-topology-frame-loop.ts:5.", elements/map-force-layout: "src/widgets/ontology-map/ui/topology-world-motion-frame-stage.ts:17 imports createForceSimulation from the force layout module and calls it at :232 while the world moves; the frame loop creates that stage at src/widgets/ontology-map/ui/use-topology-frame-loop.ts:13." }
---

Drives the map one frame at a time: reads the current state, advances the physics and the camera, and hands the renderers what to draw.

## Includes
- The per-frame step that ties layout, camera, interaction and drawing together.
- The idle and ambient-sleep gates that stop the loop doing work when nothing is moving.

## Excludes
- Deciding where nodes belong, which the layout role owns.
- Deciding what a pointer gesture means, which the pointer role owns.

## Uncertainty
- Identified from its import receipts, which show it reaching 57 modules across the map's engine, model, interaction and render folders, by far the widest fan-out in this domain. Its body was not read, and no frame was ever rendered in this scan.
- Re-read 2026-09-26 where bundles #1874 and #1883 changed `use-topology-loop.ts`: it now carries the measured widths of the strata tier names and forwards the pointer-leave and path-pick handlers. The per-frame role above is unchanged.
