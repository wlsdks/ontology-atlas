---
slug: capabilities/topology-analysis-modes
kind: capability
title: Topology Analysis Modes
domain: views
elements: [topology-analysis-bar, topology-analysis-state]
---

`/topology` exposes explicit Map / Graph / Focus / Path / Health modes so the Sigma graph reads as an analysis workspace instead of a decorative map. The mode switcher remains reachable on mobile, so small-screen topology is not reduced back to a passive map. Path prompts and results are offset below the mobile mode switcher so the click-through workflow remains legible on narrow screens.

The Graph mode (`mode=graph`, 2026-07) is the Obsidian-style living graph: the full ontology node set under an always-on d3-force simulation (Web Worker), single-node elastic drag (grabbed node pins to the cursor, neighbors respond through link springs, release hands the node back to physics), hover ego highlight, and an always-visible `contains` backbone drawn with opaque pre-blended ink tokens (`--topology-graph-edge-*`) because the WebGL edge compositing renders low-alpha colors as effectively opaque. Node clicks keep graph mode (no focus hijack); deep inspection hands off to the Relief modes, whose agent handoff contracts are unchanged.