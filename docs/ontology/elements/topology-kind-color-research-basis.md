---
slug: elements/topology-kind-color-research-basis
kind: element
title: Topology Kind Color Research Basis
domain: views
---

# Topology Kind Color Research Basis

The topology kind-color contract is grounded in public visualization and accessibility references:

- W3C WCAG Understanding SC 1.4.1 says color must not be the only visual means for distinguishing a visual element. Atlas pairs kind hue with labels, icons, legend rows, and node-size hierarchy.
- W3C WCAG Understanding SC 1.4.11 explains that graphical objects needed for understanding require sufficient contrast. Atlas keeps high-opacity fills and tested separation for small graph marks.
- Cynthia Brewer, Mark Harrower, and ColorBrewer separate color schemes into sequential, diverging, and qualitative families. Ontology `kind` is categorical identity, so Atlas uses qualitative hues rather than one hue ramp.
- Colin Ware's visualization work treats color coding as a perceptual channel that must be selected for the data semantics. Atlas reserves hue for nominal kind identity and uses size for scope/importance.

Implementation consequence: `project`, `domain`, `capability`, `element`, and `unknown` are visible ontology categories with separate tones. General ontology stats can still exclude `project`, but the map must show it because project is a rendered kind in the topology surface.

The contract is now shared by `src/entities/ontology-class/model/tone.ts`. Sigma, the ontology tree, and the Builder palette consume that shared source so the product UI and agent-facing classification contract do not drift.