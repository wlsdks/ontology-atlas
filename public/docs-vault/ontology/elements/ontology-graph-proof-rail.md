---
slug: elements/ontology-graph-proof-rail
kind: element
title: Ontology Graph Proof Rail
domain: views
relates: [elements/insights-query-cockpit]
---

`src/views/ontology-view/lib/graph-proof-rail.ts` derives the compact graph proof model shown near the top of `/ontology`, and `src/views/ontology-view/ui/OntologyViewPage.tsx` renders it as an executable query proof rail.

The rail is intentionally not a marketing card: it summarizes the same `buildAgentGraphDbQueryPack` payload used by `/ontology/insights`, showing intent count, MCP calls, CLI fallbacks, query_plan gate, representative MATCH-style intents, and operation chips. This keeps the Browse / Write / Query loop visible on the ontology tree page while preserving `/ontology/insights` as the deeper graph DB cockpit.