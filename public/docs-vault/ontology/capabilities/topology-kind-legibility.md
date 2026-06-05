---
slug: capabilities/topology-kind-legibility
kind: capability
title: Topology Kind Legibility
domain: views
elements: [elements/topology-kind-classification-contract, elements/topology-kind-color-legend, elements/topology-kind-color-research-basis, elements/topology-kind-color-tests, elements/topology-kind-color-tones]
---

Topology Kind Legibility makes ontology node kinds visually separable in the `/topology` Sigma map.

The capability exists because a graph full of domain, capability, and element nodes is not useful if all marks read as the same muted dot. The map should let a human and an AI agent quickly distinguish shared vocabulary boundaries (`domain`), user-visible behavior (`capability`), concrete implementation parts (`element`), and uncertain nodes (`unknown`) before deciding what to inspect or change.

The implementation combines distinct, colorblind-safe hues with non-color cues: the visible kind legend, node labels for important anchors, and the existing size hierarchy. Focused tests guard both exact tones and minimum RGB separation between every visible kind color.