---
slug: elements/topology-kind-color-tones
kind: element
title: Topology Kind Color Tones
domain: views
---

# Topology Kind Color Tones

`src/entities/ontology-class/model/tone.ts` defines the shared ontology-kind tone contract. `src/widgets/topology-map-sigma/lib/ontology-tone.ts` is the Sigma adapter for that contract, not a separate palette source.

The contract uses explicit kind colors so users and agents can distinguish what a node means before opening its detail modal:

- `project`: red, product/system scope anchor.
- `domain`: blue, shared vocabulary boundary.
- `capability`: amber, user-visible behavior.
- `element`: green, concrete implementation part.
- `unknown`: violet, unresolved or review-needed classification.

The same colors appear in the Sigma topology map, the ontology tree kind chips, and the Builder kind palette. The chip backgrounds and borders use stronger alpha than product chrome so small tree rows and palette buttons still show the category. This prevents the browse/edit/map surfaces from assigning different visual meanings to the same frontmatter `kind`.

The contract intentionally uses stronger categorical hues and high-opacity fills (`0.97`) instead of pale product-chrome tones. Ontology kind is nominal data, so color separation must be stronger than the surrounding UI while still pairing color with labels, icons, size hierarchy, and the kind legend.

`src/widgets/topology-map-sigma/lib/graph-build.ts` also exposes `TOPOLOGY_DOMAIN_TONE` for the pre-ontology project slug-prefix fallback. That fallback is now categorical, not near-neutral: a repo without a loaded ontology extension should still show visibly separated project clusters instead of a field of similar gray dots. Once ontology nodes are loaded, the project/domain/capability/element kind palette is the primary semantic color channel.

Owner tint is explicitly secondary. `src/widgets/topology-map-sigma/lib/reducer-owner-tint.ts` lets plain project nodes show owner color, but it preserves hub identity color and ontology kind hue. This prevents an optional overlay from making project/domain/capability/element nodes look alike again.

Tests in `src/entities/ontology-class/model/tone.test.ts` lock the shared hue names, minimum RGB distance, stronger chip alpha, and unknown fallback. `src/widgets/topology-map-sigma/lib/ontology-tone.test.ts` verifies the Sigma adapter consumes the same tone source, `src/widgets/topology-map-sigma/lib/graph-build.test.ts` verifies the slug-prefix fallback tones are unique and separated, and `src/widgets/topology-map-sigma/lib/reducer-owner-tint.test.ts` guards the overlay precedence.

This element supports the dogfood claim: when Atlas maps its own ontology, project/domain/capability/element nodes should be visually separable enough that Claude Code/Codex handoff and human review can talk about the same colored semantic categories.
