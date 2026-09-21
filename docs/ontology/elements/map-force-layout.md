---
uid: 103c2acf-7f96-4674-a3e5-84f88a071232
slug: elements/map-force-layout
kind: element
title: Map force layout
display_en: Map force layout
display_ko: 지도 힘 배치
domain: domains/human-workbench
path: src/widgets/ontology-map/model/force-layout.ts
created_by: "agent:claude-code"
---

Decides where each node sits by simulating attraction and repulsion, so the shape of the graph is something a person can read rather than an arbitrary arrangement.

## Includes
- The simulated forces that settle nodes into positions, and the separation that keeps them from overlapping.

## Excludes
- Drawing anything.
- Persisting positions; a saved layout is a separate concern from computing one.

## Uncertainty
- Witnessed as an import of the frame loop and read by name only. The repository states that a third-party library supplies one layout algorithm while the renderer is custom, and which parts of layout live here rather than in that library was not traced.