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
relation_notes: { elements/map-camera: "You asked me to turn imports I actually witnessed into dependencies: the scan shows use-topology-loop.ts importing engine/camera.ts.", elements/map-force-layout: "You asked me to turn imports I actually witnessed into dependencies: the scan shows use-topology-loop.ts importing model/force-layout.ts.", elements/map-pointer-state: "You asked me to turn imports I actually witnessed into dependencies: the scan shows use-topology-loop.ts importing interaction/pointer-state-machine.ts.", elements/map-density-gate: "You asked me to turn imports I actually witnessed into dependencies: the scan shows use-topology-loop.ts importing model/density-gate.ts, as a type." }
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