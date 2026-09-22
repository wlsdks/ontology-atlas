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
- The same five prose judgements the validator makes, computed once while the folder's manifest is built and carried on each row as codes, so the queue judges what a body states rather than whether an excerpt exists.

## Excludes
- Accepting a meaning on the person's behalf; a clean board is not evidence the meaning is right.
- The per-file well-formedness check, which the meaning layer's validation owns.
- Answering anything that needs a repository root; on this board a folder is all there is.

## Uncertainty
- Read today: the manifest builder runs the five judgements once per document, at the one point that already holds the whole body, and stores only each finding's code on the row (`src/entities/docs-vault/lib/build-local-manifest.ts:489-518`, importing the browser copy at `:9`). The comment there says the slug it passes is the file's vault-relative path, which is exactly what `slug-outside-kind-folder` asks. What the queue does with those codes afterwards was not traced.
- Of the validator's findings, only the five a browser can answer reach this board; the two needing a repository root are absent by design (`src/shared/lib/meaning-findings.ts:1-18`). Whether the board and the validator stay in step rests on the parity test named there, which was read about but not run.
- The page itself was read from the file names under `src/views/ontology-insights/lib/` and the repository's description of a six-tab Insights page. It was not opened, and the overlap between its health questions and `capabilities/vault-validation` is a boundary the owner has not yet ruled on.
