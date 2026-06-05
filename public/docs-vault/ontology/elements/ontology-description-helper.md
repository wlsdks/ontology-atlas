---
slug: elements/ontology-description-helper
kind: element
title: Ontology Description Helper
domain: views
elements: [src/shared/lib/ontology-description.test.ts, src/shared/lib/ontology-description.ts]
relates: [capabilities/topology-sigma-render, elements/topology-ontology-drawer]
---

`src/shared/lib/ontology-description.ts` keeps graph-facing descriptions short and predictable. It normalizes whitespace, prefers a concise first sentence, and clamps long body excerpts before they enter topology tooltips or selected-node drawer summaries. The topology drawer uses the same helper with a tighter profile limit, so the top of the selected-node panel behaves like a `name` / `description` contract rather than a free-form document excerpt.

The helper also owns the small runtime-recent pruning utility used by `SigmaTopology` so the 5-second recent-change cleanup can be deferred while a node is actively being dragged.
