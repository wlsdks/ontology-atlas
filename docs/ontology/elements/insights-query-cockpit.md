---
slug: elements/insights-query-cockpit
kind: element
title: Insights Query Cockpit
domain: views
---

`src/views/ontology-insights/ui/OntologyInsightsPage.tsx` renders the first-viewport query cockpit for `/ontology/insights`.

It presents the local markdown vault as a small graph database without adding a server: readiness, graph DB pack size, MCP call count, CLI fallback count, run order, representative `MATCH ...` intents, result contracts, and the JSON self-check gate all sit above the deeper charts.

The cockpit keeps the evidence flow visible before the run order: plan costly scans/traversal with `query_plan`, treat scan rows as candidates until follow-up calls such as `node_profile`, `match_edges`, `blast_radius`, and `explain_relation` narrow them, then close writes with `relation_check`, `all_paths` evidence, and the post-change sync gate.

The first-viewport styling follows `docs/DESIGN-SYSTEM.md`: neutral surfaces carry the cockpit, dashed borders distinguish planning, and indigo is the only accent for proof/gate affordances. Success is represented as a verified state, not a separate green color system, so the screen reads as an executable graph validation surface without breaking the local workbench visual contract.
