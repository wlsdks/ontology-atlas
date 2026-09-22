---
uid: 6ebac6a6-9a93-454b-afbe-b9ea6fec175c
slug: elements/insights-meaning-gaps
kind: element
title: Insights meaning gaps
display_en: Insights meaning gaps
display_ko: 인사이트 의미 공백
domain: domains/human-workbench
path: src/views/ontology-insights/lib/meaning-gap-rows.ts
created_by: "agent:claude-code"
---

Lists the nodes whose prose is missing something a concept needs as rows a person can work through, separating what one keystroke fixes from what has to be written or moved.

## Includes
- Two rows a person can close on the spot by writing one frontmatter key: no definition, and no stated parent area.
- Four rows that name the node and open it (no stated boundary, no stated unknown, an exclusion that only says what the author did not read, and a file sitting outside its kind's folder), because each is answered by writing prose or moving a file.

## Excludes
- Writing the missing prose.
- Judging whether a present definition is accurate.

## Uncertainty
- Read this module's opening and the reasoning for putting a definition in the frontmatter `description` key (`src/views/ontology-insights/lib/meaning-gap-rows.ts:1-30`), and the four codes it consumes (`src/entities/knowledge-graph/lib/meaning-gaps.ts:49-54`). Those codes now arrive with the document from the manifest build (`src/entities/docs-vault/lib/build-local-manifest.ts:9` and `:513-517`) instead of being guessed from an excerpt. The page was not opened and the parity test was not run.
