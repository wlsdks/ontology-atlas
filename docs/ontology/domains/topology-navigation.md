---
uid: 1d2e6601-19af-4547-9e3b-bddf98ce9a77
slug: domains/topology-navigation
kind: domain
title: Topology Map Navigation
display_ko: 토폴로지 지도 탐색
display_en: Topology Map Navigation
capabilities: [capabilities/topology-browsing]
elements: [elements/domain-capacity-bar, elements/full-detail-a1, elements/gesture-hint, elements/global-search, elements/recent-node-row, elements/search-hint, elements/search-palette, elements/shortcut-sheet, elements/topology-controls, elements/topology-index-panel, elements/topology-map-v2]
created_by: human
relation_notes: { capabilities/topology-browsing: "Drawing the whole vault graph on the canvas and searching it is the visual way in, with a compact popover on click and full detail only as an explicit second step.", elements/domain-capacity-bar: "The INDEX rows show a domain's capability and element composition through this bar, so a person can size a domain before opening it.", elements/full-detail-a1: "Seeing everything about one node is an explicit escalation from the compact popover, and this panel is that step.", elements/gesture-hint: "A touch visitor has no way to discover the map's gestures, so a one-time hint appears on coarse pointers and stays gone once dismissed.", elements/global-search: "Reaching a concept by name is the other way into the graph besides the canvas, and it states which scope it searched.", elements/recent-node-row: A concept that changed recently is offered as a row that links straight to its place on the map., elements/search-hint: "The map toolbar carries search, relayout, and expand all, and it gives those controls up by what room the panels leave rather than by screen size.", elements/search-palette: "The map's own palette finds a project or document in the loaded vault without leaving the canvas.", elements/shortcut-sheet: "Keyboard travel over the map has to be discoverable, so the sheet groups shortcuts by the screen a person is actually on.", elements/topology-controls: "The hub rail keeps the map's main projects one click away and says what to do when no vault or no matching node exists.", elements/topology-index-panel: "The INDEX tree is how a person walks domains, capabilities, and elements when reading the canvas alone is not enough.", elements/topology-map-v2: "The canvas renderer is the map itself, drawing and hit-testing from one per-frame position map in both the flat view and the opt-in 3D one." }
---

## Definition
canvas-2D graph browsing surface (map, search, index panel): The product's primary entry point for visually navigating the entire vault.

## Evidence
- docs/ARCHITECTURE.md: "the current route model converges browsing on Topology, writing on Workshop, maintenance on the six-tab Insights page: five measured questions plus Flow" (risky-citation warning: cross-verify by citing with AGENTS.md)
- AGENTS.md: Routes ("`/topology` is the map's address, not `/`")

## Inclusions / Exclusions
- Inclusions: topology-map-v2 renderer, search palette, index panel
- Exclusions: Graph editing (Studio, graph-modeling domain)

## Confidence
medium-high (0.85): Cross-referenced against two independent sources (ARCHITECTURE.md + AGENTS.md)
