---
slug: elements/topology-kind-color-tones
kind: element
title: Topology Kind Color Tones
domain: views
---

# Topology Kind Color Tones

`src/entities/ontology-class/model/tone.ts` defines the shared ontology-kind tone contract. `src/widgets/topology-map-sigma/lib/ontology-tone.ts` is now the Sigma adapter for that contract, not a separate palette source.

The contract uses explicit kind colors so users and agents can distinguish what a node means before opening its detail drawer:

- `project`: red, product/system scope anchor.
- `domain`: blue, shared vocabulary boundary.
- `capability`: amber, user-visible behavior.
- `element`: green, concrete implementation part.
- `unknown`: violet, unresolved or review-needed classification.

The same colors now appear in the Sigma topology map, the ontology tree kind chips, and the Builder kind palette. This prevents the browse/edit/map surfaces from assigning different visual meanings to the same frontmatter `kind`.

The contract intentionally uses stronger categorical hues and high-opacity fills (`0.97`) instead of pale product-chrome tones. Ontology kind is nominal data, so color separation must be stronger than the surrounding UI while still pairing color with labels, icons, size hierarchy, and the kind legend.

Tests in `src/entities/ontology-class/model/tone.test.ts` lock the shared hue names, minimum RGB distance, and unknown fallback. `src/widgets/topology-map-sigma/lib/ontology-tone.test.ts` verifies the Sigma adapter consumes the same tone source, and tree/palette tests verify the visible swatches render in browse/edit surfaces.

This element supports the dogfood claim: when Atlas maps its own ontology, project/domain/capability/element nodes should be visually separable enough that Claude Code/Codex handoff and human review can talk about the same colored semantic categories.