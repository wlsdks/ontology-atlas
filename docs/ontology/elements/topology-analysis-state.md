---
slug: elements/topology-analysis-state
kind: element
title: Topology Analysis State
domain: views
relates: [elements/ontology-relation-key-inference]
---

# Topology Analysis State

`src/views/home/model/url-state.ts` and `src/views/home/lib/topology-analysis.ts` persist `/topology?mode=<overview|focus|path|health>` and derive the small read model used by the analysis bar.

The default overview mode is intentionally a node-first ontology map. Dense graphs collapse ontology relation lines by default so users first see clusters, hubs, labels, and kind colors instead of an edge cloud. Relation proof remains available through Focus mode, Path mode, impact/health views, and the copyable Claude Code / Codex handoff packets.

`src/widgets/topology-map-sigma/lib/reducer-edge-lod.ts` enforces that policy for dense ontology maps: when no node, path, or impact evidence mode is active and the graph is above the dense-edge threshold, leaf/fan ontology edges stay hidden after the initial layout while containment edges between overview landmarks remain as a readable top-concept skeleton. This prevents saved camera state from reviving the full relation web while still proving that the map is an ontology relation map, not only colored dots.

This state model supports the workbench contract: overview answers "what exists and where are the semantic clusters?"; focus/path/health answer "which exact relations prove this?"
