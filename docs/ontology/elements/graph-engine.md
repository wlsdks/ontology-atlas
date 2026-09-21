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
dependencies: [capabilities/construction-guidance, elements/growth-hint, elements/meaning-gap-findings, elements/vault-kind-schema]
relation_notes: { elements/vault-kind-schema: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows ontology-engine.mjs importing schema.mjs.", elements/meaning-gap-findings: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows ontology-engine.mjs importing meaning-findings.mjs.", elements/growth-hint: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows ontology-engine.mjs importing growth-hint.mjs.", capabilities/construction-guidance: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows ontology-engine.mjs importing construction-rules.mjs." }
---

Runs every traversal, ranking and grouping operation over a compiled artifact, and turns an empty or unresolved answer into a named next step rather than silence.

## Includes
- Neighbourhoods, paths, reachability, impact, clustering and centrality over the compiled graph.
- Bounded search with an explicit budget, so a large graph returns a partial answer that says it is partial.
- The health and maintenance views that name each finding's repair.

## Excludes
- Compiling the artifact it reads.
- Writing anything back to the vault.

## Uncertainty
- By far the largest module in this domain at roughly 6,400 lines; only its header and import receipts were read. Which of the advertised operations live here rather than in the tool layer above was not traced.