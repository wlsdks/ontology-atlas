---
uid: b0b4b90f-453f-46e0-84c2-50c048b49d99
slug: capabilities/library-workspace
kind: capability
title: Library workspace
display_en: Library workspace
display_ko: 라이브러리 작업대
domain: domains/human-workbench
elements: [elements/passage-ask-brief, elements/vault-source-import, elements/wiki-compile-brief, elements/wiki-lint-brief, elements/wiki-page-write-judge]
path: src/views/library/ui/LibraryPage.tsx
created_by: "agent:claude-code"
relation_notes: { elements/passage-ask-brief: Library uses the selected-passage Ask brief to ask about a page and its cited original without treating the brief as write permission., capabilities/wiki-pages: "src/views/library/ui/LibraryPage.tsx imports isWikiFurnitureSlug and WIKI_CITATION_PATTERN from src/shared/lib/wiki-page-schema.ts, whose schema mirrors the canonical mcp/src/wiki-schema.mjs page contract.", elements/vault-source-import: "LibraryPage imports addSources, addSourcesInBrowser and summarizeAddSources through src/features/library/index.ts from lib/add-sources.ts to bring originals into the open folder.", elements/wiki-compile-brief: LibraryPage imports buildCompileBrief and selectCompileTargets through src/features/library/index.ts from lib/compile-brief.ts to prepare a cited-page proposal for chosen originals., elements/wiki-lint-brief: "LibraryPage imports buildLintBrief, parseLintCandidates, dropCandidatesWithNodes and parseLintFindings through src/features/library/index.ts from lib/lint-brief.ts to turn a requested check into inspectable findings.", elements/wiki-page-write-judge: "src/features/library/index.ts:20 re-exports judgePageWrite and wikiPagePathOf from ./lib/judge-page-write; src/views/library/ui/LibraryPage.tsx imports both from that barrel to identify and judge proposed Wiki writes before permission." }
dependencies: [capabilities/wiki-pages, elements/vault-source-import, elements/wiki-compile-brief, elements/wiki-lint-brief, elements/wiki-page-write-judge]
---

The local workspace for gathering originals, writing and checking Wiki pages that cite them, and asking questions whose evidence a person can inspect. Sources, Wiki, Ontology, and Check history retain distinct roles in one destination.

## Includes
- Importing originals into the open folder, proposing Wiki pages, linting and repairing them, and judging a page before a permitted write.
- A Wiki question desk that searches bounded local Wiki fact/decision sentences and original source units only after an explicit search. It shows coverage, omissions, freshness observations and exact source anchors. Local search and original-file entry rows work without an agent or a Jev key.
- An explicit read-only ACP investigation that rereads originals and returns an unreviewed report: answer, source evidence, disagreements, and unknowns. A new question or changed inventoried listing invalidates the prior report. Unexpected writes retain the permission review. Exact runtime retries preserve the original question, read-only authority and strict report filing context; invalidated replies cannot become ordinary fileable answers.
- Local Markdown download and document-only A4 Print/PDF. Exported external links/images are inert; unsupported unsafe syntax remains literal text. File as Wiki answer is a separate explicit action with report structure, current-source, citation, and Wiki write guards.
- Ontology navigation containing Concept documents and Concept sets. Existing set links, immutable membership IDs, unresolved members, and unsaved document drafts survive the view change.
- Concept document properties expose stored canonical neighbour fields, exact reference tokens, and actual relationship notes. Resolved references open the existing document; unresolved references and legacy element code paths remain visible without fabricated concept links.
- Optional native Jev advice for a selected current Wiki claim and cited passage, after exact-transfer consent. It is supplementary to the local inquiry.

## Excludes
- The Wiki schema, typed ontology meta-model, or semantic acceptance of either a page or a report.
- Automatically settling a disagreement as accepted knowledge. An agent draft and a matching source hash do not establish that a claim follows from the original.
- Background Jev transfer, a required service key, or a report action that implicitly authorizes writing.

## Evidence
- `src/views/library/ui/LibraryPage.tsx` coordinates the authoring and question/report flows; `src/views/library/ui/parts/LibraryQuestionDesk.tsx` owns the inquiry surface and guarded source opening.
- `src/features/library/lib/question-desk.ts` implements bounded local retrieval; `src/features/library/lib/question-desk-brief.ts` owns the report brief, section handling and inert export boundary.
- `src/app/library-workspace/index.tsx` owns navigation and legacy set-link canonicalization. `tests/e2e/library-question-desk.spec.ts` and `tests/e2e/library-workspace.spec.ts` cover search, current report behavior, source reach, URL identity and draft recovery.

## Uncertainty
- Re-read and exercised in the installed macOS app on 2026-09-28 with two synthetic Wiki pages and two originals: local search, real Codex source rereading/report arrival, exact source navigation, Markdown export, and earlier A4 PDF/file-as-Wiki proof. PR #2059 carries native captures and motion evidence. This replaces the earlier unrun-workspace note.
- These checks establish the observed fixture flow, not the correctness of arbitrary generated answers, unsupported document extraction, large-corpus behavior, or accepted ontology meaning. Report and Jev results remain advisory until a person reviews their evidence.

- The 2026-10-10 Analysis continuation exposed a missing canonical-field inventory in the document reader. The bounded correction was inspected in a browser: the declaring dependency is visible, its target resolves, and return keeps the original selected claim. This does not requalify the other Library abilities or introduce an additional editor or write authority.
