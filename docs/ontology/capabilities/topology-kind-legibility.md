---
slug: capabilities/topology-kind-legibility
kind: capability
title: Topology Kind Legibility
domain: views
elements: [elements/ontology-domain-tint-contract, elements/ontology-kind-tone-contract, elements/topology-kind-classification-contract, elements/topology-kind-color-legend, elements/topology-kind-color-research-basis, elements/topology-kind-color-tests, elements/topology-kind-color-tones]
---

# Topology Kind Legibility

Topology Kind Legibility makes ontology node kinds visually separable across Atlas browse, edit, and map surfaces.

The capability exists because a graph full of domain, capability, and element nodes is not useful if all marks read as the same muted dot. Atlas should let a human and an AI agent quickly distinguish shared vocabulary boundaries (`domain`), user-visible behavior (`capability`), concrete implementation parts (`element`), product scope roots (`project`), and uncertain nodes (`unknown`) before deciding what to inspect or change.

The implementation combines distinct qualitative hues with non-color cues: labels, icons, the visible kind legend, node labels for important anchors, and the existing size hierarchy. Focused tests guard exact tones, minimum RGB separation between every visible kind color, and whether browse/edit surfaces render the shared swatches.

Atlas also separates ontology kind from domain ownership. Kind color answers "what role is this node playing?", while the domain tint contract answers "which vocabulary or ownership boundary does this node belong to?" The dogfood domains now use named qualitative hues instead of one indigo-like ramp, so `views`, `ontology-core`, `vault-local-first`, and agent-facing domains remain visually distinct in Builder and Insights surfaces.

`src/entities/ontology-class/model/tone.ts` is the shared source. Sigma topology, ontology tree chips, and the Builder kind palette consume it so UI and Claude Code/Codex handoff prompts speak the same kind-classification contract.
