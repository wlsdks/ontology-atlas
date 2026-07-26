---
slug: elements/topology-kind-color-tones
kind: element
title: Topology Kind Color Tones
domain: views
---

# Topology Kind Color Tones

`src/entities/ontology-class/model/tone.ts` defines the shared qualitative kind
palette used by chips, legends, summaries, and agent-readable kind guidance:
project indigo, domain teal, capability amber, element eucalyptus, and unknown
brick. Labels, icons, and hierarchy always accompany color.

The custom `topology-map-v2` canvas deliberately uses its own neutral engraved
node tokens, so this palette is not a hidden renderer palette. Sigma adapters,
the Sigma folder minimap, the ontology tree, and the xyflow Builder are retired
and have no live consumer.

Domain ownership tint remains a separate semantic channel: kind answers what a
node is, while domain answers which vocabulary or ownership boundary it belongs
to. Focused tone and domain-color tests protect hue separation and dark-surface
contrast.
