---
uid: e09a683e-d8e1-4c86-bacf-1fdb86a121de
slug: capabilities/ontology-insights
kind: capability
title: Ontology insights
display_en: Analysis
display_ko: 분석
domain: domains/human-workbench
elements: []
path: src/views/ontology-insights/ui/OntologyInsightsPage.tsx
created_by: "agent:claude-code"
relation_notes: { capabilities/vault-graph-query: "Both read the typed Markdown graph. Analysis derives its comparison from the loaded graph in the renderer; it does not invoke the graph tool module. This relates entry marks the shared record contract, not a runtime import or health-parity verdict." }
relates: [capabilities/vault-graph-query]
---

A workbench where a person compares declared product relationships with their declaring documents, recorded implementation, and remaining evidence gaps.

## Includes
- A bounded directional comparison between responsibility pairs. Each arrow names one declared relationship between real concepts; selecting a declaration keeps its source document and recorded rationale alongside it.
- Inspection of a selected capability's recorded implementation roles or path, documentary findings, and source state. Missing evidence is not proof that implementation is absent.
- Exact document and correction entries that return to the selected claim, with visible keyboard focus.
- Supporting review notices, Wiki evidence, guidance, and saved explanations. Scope distinguishes the bundled example, a single project, and a folder containing multiple projects.
- Read-only requests tied to the visible record. Example facts can be copied without querying another vault; local explanation requests check the exact vault root and recorded identities before reads and wait for explicit Send.

## Excludes
- Repeating the main Map's camera and topology exploration.
- The retired global repair catalog, duplicate ranking, dependency-cycle dashboard, unmatched-name board, and document freshness census.
- Inferring runtime impact, implementation correctness, or accepted meaning from a declared edge, path, date, or clean structure.
- Sending an agent request, repairing a document, or accepting meaning without the person's explicit action.

## Evidence
- `src/views/ontology-insights/ui/OntologyInsightsPage.tsx` owns the five sections and legacy URL entry.
- `src/views/ontology-insights/ui/analysis/AnalysisWorkspace.tsx`, `DependencyDiagram.tsx`, and `lib/analysis-model.ts` build the comparison and exact evidence continuation.
- `src/views/docs-vault/ui/parts/DocFrontmatterBlock.tsx` exposes stored canonical references and relationship notes in the declaring document.
- `src/views/ontology-insights/ui/analysis/AnalysisRecords.tsx` keeps explanation archives and explicit agent requests separate from the graph.

## Uncertainty
- Re-read against the 2026-10-10 redesign and inspected in a local browser. The focused tests and recordings establish the observed fixture interactions, not the business meaning of arbitrary records.
- The redesigned installed Atlas app and an actual external agent explanation run were not exercised in this bounded sync. Native request behavior has fixture coverage.
- Legacy repair helpers remain in the repository and their tests. The current page does not import them; removing the former containment and import-derived dependency claims does not delete or qualify those concepts.
