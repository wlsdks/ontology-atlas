---
slug: capabilities/topology-analysis-modes
kind: capability
title: Topology Analysis Modes
domain: views
elements: [topology-analysis-bar, topology-analysis-state]
---

`/topology` exposes a **two-view rail** — Map (Relief) and Graph — instead of five peer mode tabs (2026-07 owner feedback: the four Relief-family modes looked like the same sparse card screen with different panels, so mode proliferation read as "five confusing siblings"). The mode switcher remains reachable on mobile, so small-screen topology is not reduced back to a passive map.

The rail's Map tab represents the whole Relief family (`overview` / `focus` / `path` / `health` URL modes, all preserved for deep links, agent handoff, and desktop verify contracts). Entry points are re-homed instead of removed: Focus enters via node click (selection state), Path via shift-clicking two nodes or `mode=path` deep links, Health via the 정리-queue count chip on the right side of the rail (hidden when the maintenance queue is empty).

The Graph view (`mode=graph`) is the Obsidian-style living graph: the full ontology node set under an always-on d3-force simulation (Web Worker), single-node elastic drag (grabbed node pins to the cursor, neighbors respond through link springs, release hands the node back to physics), hover ego highlight, and an always-visible `contains` backbone drawn with opaque pre-blended ink tokens (`--topology-graph-edge-*`) because the WebGL edge compositing renders low-alpha colors as effectively opaque. Its side rail uses the compact `--topology-panel-graph-width` so the canvas stays the protagonist. Node clicks keep graph mode (no focus hijack); deep inspection hands off to the Relief views.