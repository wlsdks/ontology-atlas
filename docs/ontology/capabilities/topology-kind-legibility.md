---
slug: capabilities/topology-kind-legibility
kind: capability
title: Topology Kind Legibility
display_ko: 종류를 모양으로 구분
display_en: Tell Kinds Apart at a Glance
domain: views
elements: [elements/ontology-domain-tint-contract, elements/ontology-kind-tone-contract, elements/topology-kind-classification-contract, elements/topology-kind-color-legend, elements/topology-kind-color-research-basis, elements/topology-kind-color-tests, elements/topology-kind-color-tones]
---

# Topology Kind Legibility

Topology Kind Legibility lets people and agents distinguish project, domain,
capability, element, and unknown nodes before deciding what to inspect or
change.

The current canvas uses non-color cues first: geometric node form, label,
hierarchy/scale, selected-focus treatment, and the visible kind legend. Shared
qualitative tones remain available for compact chips, summaries, and
classification guidance, while domain ownership tint answers a separate
question.

`src/entities/ontology-class/model/tone.ts` owns the categorical contract.
`topology-map-v2` owns the current canvas presentation. Sigma topology, the
ontology tree, and the Builder palette are retired and are not current proof
surfaces.
