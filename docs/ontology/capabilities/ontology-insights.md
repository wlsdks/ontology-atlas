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
- A project board: each recorded responsibility is a row, its capabilities are cards, and each arrow names one declared cross-responsibility dependency between real concepts. Selecting a declaration keeps its source document and recorded rationale alongside it.
- Inspection of a selected capability's recorded implementation roles or path, documentary findings, and source state. Missing evidence is not proof that implementation is absent.
- Source-state scopes combine with name search and recorded gaps while keeping the selected claim open. Counts cover capabilities; unavailable or unmeasured evidence stays unchecked, and a source change does not accept or reject the recorded meaning.
- Exact document and correction entries that return to the selected claim, with visible keyboard focus.
- Three sections: product connections, the review summary, and Wiki evidence. Scope distinguishes the bundled example, a single project, and a folder containing multiple projects.
- Addresses to retired sections: a Guidance address replaces itself with Harness At a glance, and a Written explanations address opens product connections with a notice that counts the folder's saved explanations and says where to read them.
- Read-only requests tied to the visible record. Example facts can be copied without querying another vault; claim inspection requests check the exact vault root and recorded identities before reads and wait for explicit Send.

## Excludes
- Repeating the main Map's camera and topology exploration.
- Agent guidance coverage by domain, which Harness At a glance owns.
- Writing, moving, or deleting saved explanation runs under `.ontology-atlas/analyses/`.
- The retired global repair catalog, duplicate ranking, dependency-cycle dashboard, unmatched-name board, and document freshness census.
- Inferring runtime impact, implementation correctness, or accepted meaning from a declared edge, path, date, or clean structure.
- Sending an agent request, repairing a document, or accepting meaning without the person's explicit action.

## Evidence
- `src/views/ontology-insights/ui/OntologyInsightsPage.tsx` owns the three sections and legacy URL entry, including the retired Guidance and Written explanations addresses.
- `src/views/ontology-insights/ui/analysis/AnalysisWorkspace.tsx`, `ProjectBoard.tsx`, `lib/analysis-board.ts`, and `lib/analysis-model.ts` build the board and exact evidence continuation.
- `src/views/docs-vault/ui/parts/DocFrontmatterBlock.tsx` exposes stored canonical references and relationship notes in the declaring document.
- `src/views/ontology-insights/ui/analysis/AnalysisRecords.tsx` keeps explicit agent requests separate from the graph and shows the retired-section notice; `lib/count-saved-explanations.ts` counts saved runs without writing.

## Uncertainty
- Re-read against the 2026-10-21 three-section change and inspected in a local static build at 1512 and 390 pixels. The installed macOS app has not been walked for this change.
- An actual external agent explanation run was not exercised. Native request behavior has fixture coverage.
- On the web, saved explanations are no longer readable inside Atlas; only the app's agent panel and an agent over MCP read them.
- Legacy repair helpers remain in the repository and their tests. The current page does not import them; removing the former containment and import-derived dependency claims does not delete or qualify those concepts.
