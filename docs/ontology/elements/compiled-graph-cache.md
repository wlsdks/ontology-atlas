---
uid: 1e1fcec4-88d6-46fe-ba74-8e2f0d2ea0ca
slug: elements/compiled-graph-cache
kind: element
title: Compiled graph cache
display_en: Compiled graph cache
display_ko: 컴파일 그래프 캐시
domain: domains/meaning-layer
path: mcp/src/server/compiled-cache.mjs
created_by: "agent:claude-code"
---

Reuses an already-compiled graph across several calls in one session, but only while no vault file has been added, removed or changed since it was compiled.

## Includes
- Up to four compiled views (the query graph, the `compile_ontology` summary, a page or two) for the current version of the vault, where the version is the one the vault file store gives each set of loaded documents.
- Compiling a document list that did not come from the vault file store on every call, so a hand-built list is never served an older graph.
- Hit and miss counts, so reuse is observable rather than assumed.

## Excludes
- Deciding whether a file changed; the vault file store owns that.
- Becoming a source of truth; the files on disk stay authoritative and a changed file moves the version.
- Persisting between processes.

## Uncertainty
- Read in full. Its production consumers are the server runtime's query cache and `compile_ontology`; whether the terminal surface gets the same reuse was not checked.
