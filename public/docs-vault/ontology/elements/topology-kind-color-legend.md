---
slug: elements/topology-kind-color-legend
kind: element
title: Topology Kind Color Legend
domain: views
relates: [capabilities/topology-kind-legibility, elements/ontology-kind-tone-contract]
---

# Topology Kind Color Legend — retired

This node records a retired UI contract. The former Sigma renderer showed a
five-row `project` / `domain` / `capability` / `element` / `unknown` color
legend. Sigma and that legend were removed with the old topology surfaces.

The current `/` and `/topology` canvas does **not** encode ontology kind through
a five-color node-fill legend. `topology-map-v2` uses neutral engraved surfaces,
kind glyphs, labels, tier, size, containment structure, and the adjacent INDEX
tree so readers do not have to infer meaning from color alone.

`TopologyRelationLegend`
(`src/views/home/ui/TopologyRelationLegend.tsx`) remains visible at medium
viewports and above, but it explains the map's real line encoding—`contains`
solid spine and `depends_on` dashed relation—not node kind colors.

The categorical tone contract still has one live chart consumer:
`src/views/ontology-insights/ui/tabs/OverviewTab.tsx` uses
`getOntologyKindTone(...)` for kind-distribution bars. That chart use does not
restore a topology color legend. See
[[elements/ontology-kind-tone-contract]] for the current boundary.
