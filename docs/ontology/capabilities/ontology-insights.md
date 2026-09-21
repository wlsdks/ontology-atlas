---
uid: e09a683e-d8e1-4c86-bacf-1fdb86a121de
slug: capabilities/ontology-insights
kind: capability
title: Ontology insights
display_en: Ontology insights
display_ko: 온톨로지 인사이트
domain: domains/human-workbench
elements: [elements/insights-do-next-queue, elements/insights-duplicate-pairs, elements/insights-meaning-gaps, elements/insights-unmatched-board]
path: src/views/ontology-insights/ui/OntologyInsightsPage.tsx
created_by: "agent:claude-code"
dependencies: [capabilities/vault-graph-query, elements/insights-do-next-queue, elements/insights-duplicate-pairs, elements/insights-meaning-gaps]
relation_notes: { capabilities/vault-graph-query: "You asked for what depends on what: the insights board's measured questions are graph queries over the same compiled graph.", elements/insights-do-next-queue: "You asked me to turn imports I actually witnessed into dependencies: the scan shows OntologyInsightsPage.tsx importing lib/do-next-queue.ts.", elements/insights-duplicate-pairs: "You asked me to turn imports I actually witnessed into dependencies: the scan shows OntologyInsightsPage.tsx importing lib/duplicate-pairs.ts.", elements/insights-meaning-gaps: "You asked me to turn imports I actually witnessed into dependencies: the scan shows OntologyInsightsPage.tsx importing lib/meaning-gap-rows.ts.", elements/insights-unmatched-board: You asked for element nodes named by role under the capability that uses them; showing where record and code fail to meet is this role. }
---

A maintenance board that asks a fixed set of measured questions about the graph's gaps and turns the answers into an ordered list of what to do next.

## Includes
- Duplicate pairs, dependency cycles, unmatched nodes, meaning gaps, impact ranking, and a flow view of recent change.
- A do-next grouping that turns findings into concrete repairs.

## Excludes
- Accepting a meaning on the person's behalf; a clean board is not evidence the meaning is right.
- The per-file well-formedness check, which the meaning layer's validation owns.

## Uncertainty
- Read from the file names under `src/views/ontology-insights/lib/` and the repository's description of a six-tab Insights page. The page was not opened, and the overlap between its health questions and `capabilities/vault-validation` is a boundary the owner has not yet ruled on.