---
slug: elements/topology-kind-color-research-basis
kind: element
title: Topology Kind Color Research Basis
domain: views
---

# Topology Kind Color Research Basis

The topology kind-color contract is grounded in public visualization, accessibility, and ontology-learning references:

- W3C WCAG Understanding SC 1.4.1 says color must not be the only visual means for distinguishing a visual element. Atlas pairs kind hue with labels, icons, legend rows, and node-size hierarchy.
- W3C WCAG Understanding SC 1.4.11 explains that graphical objects needed for understanding require sufficient contrast. Atlas keeps high-opacity fills and tested separation for small graph marks.
- ColorBrewer's public guidance separates color schemes into sequential, diverging, and qualitative families. Ontology `kind` is categorical identity, so Atlas uses qualitative hues rather than one hue ramp.
- Colorgorical frames categorical palette quality around perceptual distance, color-name difference, and preference. Atlas turns that into executable RGB-distance tests for kind fills and keeps names distinct in the legend.
- Ontology-learning surveys and taxonomy work split the problem into concept identification, concept hierarchy or taxonomy, and relation extraction. Atlas maps that into the agent classification order: project scope, domain boundary, capability behavior, implementation element, then temporary unknown.

Implementation consequence: `project`, `domain`, `capability`, `element`, and `unknown` are visible ontology categories with separate tones. General ontology stats can still exclude `project`, but the map must show it because project is a rendered kind in the topology surface.

Owner tint and audit overlays are secondary visual lenses. They can highlight ownership or graph health, but they must not erase the kind hue of ontology nodes because that hue is the user's first proof that the map is an ontology, not just a generic network.

The contract is shared by `src/entities/ontology-class/model/tone.ts`, the Sigma adapter, the owner-tint reducer, the ontology tree, the Builder palette, and `agent_brief.handoffPrompt`. That keeps UI color, MCP guidance, and Codex/Claude classification rules from drifting.
