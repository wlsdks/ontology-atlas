---
slug: elements/topology-kind-color-tones
kind: element
title: Topology Kind Color Tones
domain: views
---

# Topology Kind Color Tones

`src/widgets/topology-map-sigma/lib/ontology-tone.ts` defines the visible ontology-kind tone contract for the Sigma topology map.

The map uses explicit kind colors so users and agents can distinguish what a node means before opening its detail drawer:

- `project`: red, product/system scope anchor.
- `domain`: blue, shared vocabulary boundary.
- `capability`: amber, user-visible behavior.
- `element`: green, concrete implementation part.
- `unknown`: violet, unresolved or review-needed classification.

The contract intentionally uses stronger categorical hues and high-opacity fills (`0.97`) instead of pale product-chrome tones. Topology is a data-visualization surface, so color separation must be stronger than the surrounding UI while still pairing color with labels, size hierarchy, and the kind legend.

Tests in `src/widgets/topology-map-sigma/lib/ontology-tone.test.ts` lock the exact fill/border values, minimum RGB distance between every kind pair, and the high-opacity fill floor. `src/widgets/topology-map-sigma/lib/graph-build.test.ts` verifies that graph nodes and the legend consume the same tone source, preventing UI drift.

This element supports the dogfood claim: when Atlas maps its own ontology, project/domain/capability/element nodes should be visually separable enough that Claude Code/Codex handoff and human review can talk about the same colored semantic categories.