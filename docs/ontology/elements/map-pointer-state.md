---
uid: 82e323f3-b995-4dc7-b573-b6afd86c056b
slug: elements/map-pointer-state
kind: element
title: Map pointer state
display_en: Map pointer state
display_ko: 지도 포인터 상태
domain: domains/human-workbench
path: src/widgets/ontology-map/interaction/pointer-state-machine.ts
created_by: "agent:claude-code"
---

Decides what a pointer is actually doing (selecting, dragging a node, panning the view, or opening a menu), so one gesture cannot be read as two different commands.

## Includes
- The states a pointer moves through from press to release, and which action each ending produces.

## Excludes
- Keyboard navigation, which is handled by its own modules alongside this one.
- Performing the action it identifies.

## Uncertainty
- Witnessed as an import of the frame loop and read by name only. Its behaviour with touch and coarse pointers, which the repository's audits do measure, was not examined here.