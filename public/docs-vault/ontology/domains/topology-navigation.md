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
