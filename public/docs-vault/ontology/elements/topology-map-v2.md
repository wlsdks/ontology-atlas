---
uid: cc95edb1-2eab-4752-941f-8bcf99d19769
slug: elements/topology-map-v2
kind: element
title: Topology Map V2
display_ko: 지도 렌더러 v2
domain: domains/topology-navigation
path: src/widgets/topology-map-v2
created_by: "agent:unknown"
dependencies: [elements/knowledge-graph]
relation_notes: { elements/knowledge-graph: "The canvas renderer draws the node/edge model the knowledge-graph entity derives; src/widgets/topology-map-v2 imports @/entities/knowledge-graph." }
---

Custom canvas-2D graph renderer core. Core implementation evidence for capabilities/topology-browsing. AGENTS.md Tech stack: "The graph renderer is ours".

The opt-in 3D view lives inside this widget rather than in a second renderer: `model/dome-view.ts` lays the ownership arrangement out as a cone tree (height = containment tier, each parent the apex of its own cone since 2026-09-02) and the coupling arrangement as a relation-driven cloud, projects both into the same world 2D the camera already handles, and morphs between them; `render/dome-rings.ts` draws the cone bases. Draw, hit-testing, and the `?e2e=1` inspection hook read one per-frame map, which is what keeps a click during rotation landing where the node was drawn.
