---
slug: elements/topology-map-canvas
kind: element
title: Topology Map Canvas (single-container transform engine)
domain: views
---

`src/widgets/topology-map-canvas/` — the rebuilt map (Relief) rendering engine (2026-07, docs/TOPOLOGY-MAP-REBUILD.md). Card and connector coordinates are written once; pan/zoom is a single container CSS transform (pure camera math in `lib/camera.ts` with unit tests), so per-frame DOM synchronization — the jank source of the previous SigmaSkeletonCards path — is structurally impossible. Cards stay pixel-fixed under zoom via an inverse-scale CSS variable; expand/collapse animates with FLIP (CSS `translate`, reduced-motion aware). Serves the overview/focus/path/health map family; the Graph view and local-graph ego stay on the Sigma engine. Desktop verify checks the canvas contract via `topologyMapEngine` / `topologyMapCanvasCardCount` markers.