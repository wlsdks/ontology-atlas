---
uid: 97600489-2fec-49d2-9b64-d33ede5f3671
slug: elements/map-camera
kind: element
title: Map camera
display_en: Map camera
display_ko: 지도 카메라
domain: domains/human-workbench
path: src/widgets/ontology-map/engine/camera.ts
created_by: "agent:claude-code"
---

Holds what part of the graph is on screen and at what scale, and how the view travels when something else asks it to move.

## Includes
- The viewport position and zoom, and the easing that carries it from one framing to the next.
- Fitting the view to a selection or back to the whole graph.

## Excludes
- Choosing what to look at; the camera moves, it does not decide.
- Drawing the contents of the view.

## Uncertainty
- Witnessed as an import of the frame loop, and used there alongside separate easing, momentum and spring modules. Only the file name and that relationship were read; how much of the motion behaviour is here rather than in those neighbours is unverified.