---
slug: elements/topology-kind-color-legend
kind: element
title: Topology Kind Color Legend
domain: views
---

`src/widgets/topology-map-sigma/ui/SigmaTopology.tsx` renders the topology kind legend that labels the visible node colors for `project`, `domain`, `capability`, `element`, and `unknown`.

The legend reuses `ontologyFillTone(...)` directly, so the visible swatches and graph node fills cannot drift independently. It appears when the audit overlay is off and the map is not in minimal embed mode.

The legend is part of the semantic proof of the map: users should be able to read the graph as an ontology relation map without knowing internal MCP or graph tooling terminology.