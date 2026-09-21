---
uid: a6359e02-8d0b-4415-8b96-4b001356076c
slug: elements/document-filter-dsl
kind: element
title: Document filter expression
display_en: Document filter expression
display_ko: 문서 필터 식
domain: domains/meaning-layer
path: mcp/src/query.mjs
created_by: "agent:claude-code"
dependencies: [elements/graph-engine, elements/vault-file-store]
relation_notes: { elements/graph-engine: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows query.mjs importing ontology-engine.mjs.", elements/vault-file-store: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows query.mjs importing vault.mjs." }
---

Parses the small filter expression that lets someone ask which documents have or lack a given field, without learning a graph query language.

## Includes
- Equality, inequality, presence of an array field, and the three boolean operators with parentheses.
- The deliberately narrow grammar behind the simpler of the two ask-the-vault surfaces.

## Excludes
- Path questions and aggregation, which the graph engine answers instead.
- Any write.

## Uncertainty
- Read from the module's grammar comment. This file was cited as the whole of graph querying in the first pass of this map, which was wrong; how often this simpler surface is used compared with the graph engine was not measured.