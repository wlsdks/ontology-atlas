---
slug: elements/ontology-graph-proof-rail
kind: element
title: Ontology Graph Proof Rail
domain: views
relates: [elements/insights-query-cockpit]
---

`src/views/ontology-view/lib/graph-proof-rail.ts` derives the compact graph proof model shown near the top of `/ontology`, and `src/views/ontology-view/ui/OntologyViewPage.tsx` renders it as an executable query proof strip.

The strip is intentionally not a marketing card and no longer sits above the tree role contract. `/ontology` first explains that the hierarchy is a browse index via the Tree role / Graph refs / Evidence strip, then shows this compact proof strip as the executable query contract for the same markdown graph.

It summarizes the same `buildAgentGraphDbQueryPack` payload used by `/ontology/insights`, showing intent count, MCP calls, CLI fallbacks, query_plan gate, one sample MATCH-style intent, and operation chips without pushing the tree far below the first viewport. It still exposes copy actions for the full MCP graph DB query pack and the matching CLI fallback pack, so `/ontology` can hand Claude Code / Codex an executable scan plan without forcing the user to open the deeper Insights cockpit first. This keeps the Browse / Write / Query loop visible on the ontology tree page while preserving `/ontology/insights` as the deeper graph DB cockpit.
