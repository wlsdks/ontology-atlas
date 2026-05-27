---
slug: elements/insights-query-cockpit
kind: element
title: Insights Query Cockpit
domain: views
---

`src/views/ontology-insights/ui/OntologyInsightsPage.tsx` renders the first-viewport query cockpit for `/ontology/insights`.

The cockpit makes the local markdown graph feel executable before the analytic charts begin. It exposes readiness, graph DB pack size, MCP call count, CLI fallback count, the copyable graph DB pack, and the JSON self-check gate that proves connector/fallback health before scans run.

The cockpit now includes a live proof strip derived from the current graph manifest: shaped concept/relation counts, blocker counts for unresolved stubs and orphans, and traversal density through hub count plus average degree. This keeps the surface from reading like static documentation for query commands; the first viewport shows whether the current graph is actually ready for scan, path, blast radius, and domain matrix queries.

The evidence flow is explicit: plan expensive work with `query_plan`, treat scan rows as candidates until follow-up calls narrow them, and close write decisions with `relation_check`, bounded `all_paths` evidence, and the shared sync gate.
