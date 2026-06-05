---
slug: elements/topology-kind-color-tones
kind: element
title: Topology Kind Color Tones
domain: views
---

`src/widgets/topology-map-sigma/lib/ontology-tone.ts` defines the visible ontology-kind tone contract for the Sigma topology map.

The map now treats `project`, `domain`, `capability`, `element`, and `unknown` as the visible topology kinds. General stats still keep `project` out of "meaningful ontology" counts, but the topology canvas needs project color because the rendered graph says users are reading projects together with domains, capabilities, and elements.

Current tone semantics:

- `project` = vermillion: product/system scope anchor.
- `domain` = sky blue: shared vocabulary boundary.
- `capability` = yellow: user-visible behavior.
- `element` = green: implementation part.
- `unknown` = purple: classification/review needed.

This is intentionally stronger than surrounding product chrome because `/topology` is a data-visualization surface. Color is paired with size, labels, and the visible legend so kind is not conveyed by color alone.