---
uid: e493e922-d415-486b-bf3e-19f2469f85e0
slug: elements/ontology-class
kind: element
title: Ontology Class
display_ko: 온톨로지 클래스
domain: domains/graph-modeling
path: src/entities/ontology-class
created_by: "agent:unknown"
---

Kind-specific schema class definition entity. Evidence of implementation for capabilities/vault-ontology.

## Evidence

- Primary implementation: `src/entities/ontology-class/model/icons.ts#getOntologyKindIcon`
- Supporting implementation: `src/entities/ontology-class/model/labels.ts#getOntologyKindLabel`
- Focused test: `src/entities/ontology-class/model/tone.test.ts#keeps one named qualitative hue for each visible ontology kind`
- Focused test: `src/entities/ontology-class/model/tone.test.ts#keeps categorical fills far enough apart for graph scanning`

## Includes

- Mapping each ontology kind (project, domain, capability, element, document) to a representative Lucide icon and human label.
- Falling back to a generic icon/label for unknown, stub, or legacy kinds.

## Excludes

- Choosing colour for a kind: icons take `currentColor`; the caller decides colour under the single-indigo palette rule.
- The graph node/edge model itself, owned by elements/knowledge-graph.
- Rendering the icon on the map canvas, owned by elements/topology-map-v2.
