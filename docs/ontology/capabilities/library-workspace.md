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
relation_notes: { elements/vault-source-import: "You asked me to turn imports I actually witnessed into dependencies: the library barrel re-exports addSources from lib/add-sources.ts and LibraryPage.tsx imports that barrel.", elements/wiki-compile-brief: "You asked me to turn imports I actually witnessed into dependencies: the library barrel re-exports buildCompileBrief from lib/compile-brief.ts and LibraryPage.tsx imports that barrel.", elements/wiki-lint-brief: "You asked me to turn imports I actually witnessed into dependencies: the library barrel re-exports buildLintBrief from lib/lint-brief.ts and LibraryPage.tsx imports that barrel.", elements/wiki-page-write-judge: "You asked me to turn imports I actually witnessed into dependencies: the library barrel re-exports judgePageWrite from lib/judge-page-write.ts and LibraryPage.tsx imports that barrel.", elements/passage-ask-brief: You asked for element nodes named by role under the capability that uses them; asking about a selected passage is this role., capabilities/wiki-pages: "You asked me to turn imports I actually witnessed into dependencies: the scan shows LibraryPage.tsx importing the wiki page schema, so the workspace is bound to the page contract the meaning layer owns." }
dependencies: [capabilities/wiki-pages, elements/vault-source-import, elements/wiki-compile-brief, elements/wiki-lint-brief, elements/wiki-page-write-judge]
---

The workspace where raw source documents brought into the folder are turned into wiki pages that cite them, checked, repaired, and then questioned, so a person can ask something and get an answer that quotes the originals.

## Includes
- Bringing raw sources into the open folder and discovering which ones still need a page.
- Compiling a source into a page proposal, linting the result, and repairing what the lint found.
- Judging a page before the write is allowed, rather than reporting its problems afterwards.
- Asking a question about a selected passage and getting an answer that quotes the page and the originals it cites.

## Excludes
- The page contract itself and its findings codes, which the meaning layer's wiki capability owns.
- The typed graph nodes; a wiki page enters the graph only when it carries a kind.
- Deciding whether two pages disagree automatically; that judgement stays with a person reading the prose.

## Uncertainty
- This node's first version called it a document library that holds and reads narrative Markdown. Reading `src/features/library/` showed that is wrong: the folder is an authoring loop of add sources, compile, lint, fix, judge and ask. The definition and boundary above are rewritten from that reading. The rounds and constellation views under `src/views/library/` were listed but not opened, and no part of this workspace was run.
