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
relation_notes: { elements/passage-ask-brief: You asked for element nodes named by role under the capability that uses them; asking about a selected passage is this role., capabilities/wiki-pages: "You asked me to name where the witness is: LibraryPage.tsx:112 imports isWikiFurnitureSlug and WIKI_CITATION_PATTERN from shared/lib/wiki-page-schema.ts, whose header at :6-7 names mcp/src/wiki-schema.mjs as the canonical copy of that page shape.", elements/vault-source-import: "You asked me to name where the witness is: LibraryPage.tsx:19-20 and :36 import addSources, addSourcesInBrowser and summarizeAddSources from @/features/library, which re-exports all three from lib/add-sources.ts at features/library/index.ts:1.", elements/wiki-compile-brief: "You asked me to name where the witness is: LibraryPage.tsx:21 and :29 import buildCompileBrief and selectCompileTargets from @/features/library, which re-exports both from lib/compile-brief.ts at features/library/index.ts:13.", elements/wiki-lint-brief: "You asked me to name where the witness is: LibraryPage.tsx:23, :28, :39 and :44 import buildLintBrief, parseLintCandidates, dropCandidatesWithNodes and parseLintFindings from @/features/library, re-exported from lib/lint-brief.ts at features/library/index.ts:14.", elements/wiki-page-write-judge: "You asked me to name where the witness is: LibraryPage.tsx:27 and :40 import judgePageWrite and wikiPagePathOf from @/features/library, re-exported from lib/judge-page-write.ts at features/library/index.ts:20, and :1325 calls wikiPagePathOf on the file a write targets." }
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
