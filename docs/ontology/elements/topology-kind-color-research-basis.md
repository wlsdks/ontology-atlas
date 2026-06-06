---
slug: elements/topology-kind-color-research-basis
kind: element
title: Topology Kind Color Research Basis
domain: views
---

The topology kind-color contract is grounded in public visualization, accessibility, and ontology-learning references:

- W3C WCAG 2.2 SC 1.4.1 says color must not be the only visual means for distinguishing a visual element. Atlas pairs kind hue with labels, icons, legend rows, data attributes, and node-size hierarchy.
- W3C WCAG 2.2 SC 1.4.11 says graphical objects needed for understanding require at least 3:1 contrast against adjacent colors. Atlas keeps high-opacity fills and an executable 3:1 dark-canvas contrast floor for small graph marks.
- Brewer, Hatchard, and Harrower's ColorBrewer work separates color schemes into sequential, diverging, and qualitative families. Ontology `kind` is categorical identity, so Atlas uses qualitative hues rather than one hue ramp.
- CIEDE2000 is the modern CIE color-difference reference for perceptual color separation. Atlas currently uses RGB-distance as an inexpensive regression proxy in unit tests; future palette hardening should replace or complement it with a perceptual delta check when the test utility is worth the added complexity.
- Colorgorical frames categorical palette quality around perceptual distance, color-name difference, and preference. Atlas turns the practical part into executable fill-distance tests and distinct legend names.
- Ontology-learning surveys and taxonomy work split the problem into concept identification, concept hierarchy or taxonomy, and relation extraction. Atlas maps that into the agent classification order: project scope, domain boundary, capability behavior, implementation element, then temporary unknown.
- Gruber's ontology-design paper frames an ontology as an explicit specification of a conceptualization for knowledge sharing between agents. Atlas maps that to a small explicit `kind` contract so Claude Code and Codex commit to the same project/domain/capability/element vocabulary before writing frontmatter.
- The W3C SKOS Primer emphasizes semantic relationships and documentary notes alongside labels. Atlas therefore tells agents not to classify from the label alone; the handoff must cite source paths, symbols, routes, commands, MCP tools, graph neighbors, or relation evidence.
- Code Property Graph work shows that practical source-code reasoning benefits from combining syntax, control flow, and dependency views in a graph. Atlas uses that principle locally: `element` classification should cite concrete code artifacts, while `capability` and `domain` classification should cite behavior, ownership, containment, or relation evidence rather than a filename guess.

Implementation consequence: `project`, `domain`, `capability`, `element`, and `unknown` are visible ontology categories with separate tones. General ontology stats can still exclude `project`, but the map must show it because project is a rendered kind in the topology surface. The current muted qualitative names are `indigo`, `teal`, `amber`, `sage`, and `brick`; they replace the earlier magenta/cyan/yellow/green/orange set because the old card treatment over-weighted color and read as decorative rather than evidentiary.

Owner tint and audit overlays are secondary visual lenses. They can highlight ownership or graph health, but they must not erase the kind hue of ontology nodes because that hue is the user's first proof that the map is an ontology, not just a generic network.

The contract is shared by `src/entities/ontology-class/model/tone.ts`, the Sigma adapter, the owner-tint reducer, the ontology tree, the Browse concept detail modal, the Builder palette, `agent_brief.handoffPrompt`, CLI result-contract verification, and the `/ontology` Agent settings action packets. That keeps UI color, MCP guidance, and Codex/Claude classification rules from drifting.
