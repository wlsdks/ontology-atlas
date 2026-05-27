---
slug: elements/insights-query-cockpit
kind: element
title: Insights Query Cockpit
domain: views
---

`src/views/ontology-insights/ui/OntologyInsightsPage.tsx` renders the first-viewport query cockpit for `/ontology/insights`.

The cockpit makes the local markdown graph feel executable before the analytic charts begin. It exposes readiness, graph DB pack size, MCP call count, CLI fallback count, the copyable graph DB pack, and the self-check plus health gate that proves connector/fallback health and vault graph health before scans run.

The cockpit now includes a live proof strip derived from the current graph manifest: shaped concept/relation counts, blocker counts for unresolved stubs and orphans, and traversal density through hub count plus average degree. This keeps the surface from reading like static documentation for query commands; the first viewport shows whether the current graph is actually ready for scan, path, blast radius, and domain matrix queries.

The representative query cards now show the first operation badge plus MCP payload and CLI fallback counts for each visible `MATCH ...` intent. This makes the query pack feel like an executable queue: users can see which operation starts the scan and whether the same run can be copied through MCP or terminal-only fallbacks.

The cockpit also accepts a focused node handoff from the builder via `?node=<slug>`. When present, `/ontology/insights` renders a focused proof panel with Browse and Builder return links plus a copyable packet containing CLI `node`, CLI incoming `blast-radius`, MCP `node_profile`, MCP incoming `blast_radius`, and the post-change sync gate. The panel resolves the selected graph node back to its vault slug before building CLI/MCP payloads, so a builder handoff such as `capability:*` still copies executable `capabilities/*` terminal fallbacks. This makes the Builder `Proof` cell an executable graph verification step rather than a generic navigation link.

The evidence flow is explicit: plan expensive work with `query_plan`, treat scan rows as candidates until follow-up calls narrow them, and close write decisions with `relation_check`, bounded `all_paths` evidence, and the shared sync gate.

The cockpit promise is now backed by `scripts/dogfood-graph-db-pack.mjs` and
`pnpm dogfood:graph-db`. That runner executes the same setup self-check, facets,
health gate, planned node scan, planned edge scan, domain matrix, bounded path
evidence, and `relation_check` preflight plus relation explanation over
`docs/ontology`, then fails closed when a result contract or health check is
missing. The UI can therefore claim
"graph DB-style" exploration
because the repo dogfoods the complete query pack against its own markdown graph.

Its copy buttons keep the target name after success (for example `CLI pack 복사 · 복사됨`) so the dense Insights surface does not collapse multiple adjacent copy actions into an ambiguous generic `복사됨` state.
