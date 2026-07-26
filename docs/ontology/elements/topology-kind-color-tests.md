---
slug: elements/topology-kind-color-tests
kind: element
title: Topology Kind Color Tests
domain: views
---

# Topology Kind Color Tests

This node now names a narrower, current test boundary:

- `src/entities/ontology-class/model/tone.test.ts` guards unique categorical
  tones, dark-background contrast, readable text, and unknown-kind fallback.
  Its live UI consumer is the kind distribution chart in Insights.
- `src/shared/lib/domain-color.test.ts` guards the deterministic domain tint
  helper. The helper currently has no production canvas consumer.
- `src/widgets/topology-map-v2/model/freshness.test.ts` guards fresh/stale/hub
  overlays independently of kind.
- topology-v2 render/model/UI tests guard current canvas shapes, tier reveal,
  relation traces, focus, cluster density, labels, and token reading.

The removed Sigma legend, graph-build, owner-tint, and reducer-edge-LOD tests
are not current proof. Topology no longer promises five colored node fills or
a kind-color legend; neutral canvas hierarchy is explained through shape,
glyph, label, tier, containment, INDEX, and the relation-line legend.
