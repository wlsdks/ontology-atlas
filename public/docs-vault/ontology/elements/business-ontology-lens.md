---
slug: elements/business-ontology-lens
kind: element
title: Business Ontology Lens
domain: views
relates: [elements/ontology-tree-view]
---

# Business Ontology Lens

`src/shared/lib/business-ontology-lens.ts` defines the shared business-first read-order contract used by the ontology browse surface. The lens keeps the visible `/ontology` meaning gate aligned with the agent handoff contract: business/product domains first, then product capabilities, then implementation evidence.

This element exists so UI copy, copyable briefs, and agent-facing payloads do not drift back toward path/API/route-first ontology framing.