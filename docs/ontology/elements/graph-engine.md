---
uid: b0d3f0d6-8977-455b-9e00-359c5c29c8eb
slug: elements/graph-engine
kind: element
title: Graph engine
display_en: Graph engine
display_ko: 그래프 엔진
domain: domains/meaning-layer
path: mcp/src/ontology-engine.mjs
created_by: "agent:claude-code"
dependencies: [capabilities/construction-guidance, elements/growth-hint, elements/meaning-gap-findings, elements/uncertainty-next-reads, elements/vault-kind-schema]
relation_notes: { elements/vault-kind-schema: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows ontology-engine.mjs importing schema.mjs.", capabilities/construction-guidance: "You asked where the import went after the engine file was split: mcp/src/ontology-engine/maintenance-queries.mjs:10 imports slugOutsideKindFolderMessage from construction-rules.mjs, and :99 puts that message on the slug-outside-kind-folder repair row.", elements/growth-hint: "You asked where the import went after the engine file was split: mcp/src/ontology-engine/artifact-context.mjs:1 imports buildSlugNotFoundGrowthHint from growth-hint.mjs, and :88 and :94 attach that hint to an unresolved-slug error.", elements/uncertainty-next-reads: "You asked where the import went after the engine file was split: mcp/src/ontology-engine/scope-queries.mjs:3 imports extractUncertaintyReads and orderUncertaintyReads from uncertainty-reads.mjs, and :849 and :858 gather and order the next reads.", elements/meaning-gap-findings: "You asked where the import went after the engine file was split: mcp/src/ontology-engine/maintenance-queries.mjs:9 ends the import of the finding builders from meaning-findings.mjs, and :71 and :118 run them to build the meaning-gap rows." }
---

Runs every traversal, ranking and grouping operation over a compiled artifact, and turns an empty or unresolved answer into a named next step rather than silence.

## Includes
- Neighbourhoods, paths, reachability, impact, clustering and centrality over the compiled graph.
- Bounded search with an explicit budget, so a large graph returns a partial answer that says it is partial.
- The health and maintenance views that name each finding's repair, and the growth plan that now carries a group of next reads beside the writes it recommends.

## Excludes
- Compiling the artifact it reads.
- Writing anything back to the vault.

## Uncertainty
- By far the largest module in this domain at roughly 6,400 lines. Read today: the import of the uncertainty reader (`mcp/src/ontology-engine.mjs:20`) and the growth plan end to end (`:3464-3499`). Everything else is still header and import receipts, so which of the advertised operations live here rather than in the tool layer above was not traced, and the helper that gathers the read candidates was seen only at its call site.
