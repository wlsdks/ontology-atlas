---
slug: elements/ontology-description-helper
kind: element
title: Ontology Description Helper
domain: views
elements: [src/shared/lib/ontology-description.test.ts, src/shared/lib/ontology-description.ts]
relates: [elements/topology-ontology-drawer]
---

`src/shared/lib/ontology-description.ts` keeps graph-facing descriptions short and predictable. It normalizes whitespace, prefers a concise first sentence, and clamps long body excerpts before they enter topology tooltips or selected-node drawer summaries. The topology drawer uses the same helper with a tighter profile limit, so the top of the selected-node panel behaves like a `name` / `description` contract rather than a free-form document excerpt.

The module also retains `pruneRuntimeRecentSlugs`, a small immutable set helper
covered by unit tests. No production surface currently imports it: the retired
Sigma renderer used it for five-second drag-aware recent-state cleanup, while
the current canvas receives freshness through the topology-v2 adapter. Keep
that boundary explicit until the helper is either reused or removed.
