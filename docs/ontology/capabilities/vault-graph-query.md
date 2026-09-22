---
uid: 7c451ebd-9cd0-41a9-bc37-044affac786a
slug: capabilities/vault-graph-query
kind: capability
title: Vault graph query
display_en: Vault graph query
display_ko: 볼트 그래프 조회
domain: domains/meaning-layer
elements: [elements/compiled-graph-cache, elements/document-filter-dsl, elements/graph-compiler, elements/graph-engine, elements/growth-hint, elements/uncertainty-next-reads]
path: mcp/src/tools/graph.mjs
created_by: "agent:claude-code"
relation_notes: { elements/graph-compiler: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows tools/graph.mjs importing ontology-compiler.mjs.", elements/graph-engine: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows tools/graph.mjs importing ontology-engine.mjs.", elements/compiled-graph-cache: You asked for element nodes named by role under the capability that uses them; reuse across calls in one session is this role., elements/document-filter-dsl: You asked for element nodes named by role under the capability that uses them; this is the simpler filter surface for asking the vault a question., elements/growth-hint: You asked for element nodes named by role under the capability that uses them; turning an empty answer into a next step is this role., elements/vault-file-store: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows tools/graph.mjs importing vault.mjs.", capabilities/analysis-archive: "You asked me to turn imports I actually witnessed into dependencies: the scan shows tools/graph.mjs importing analysis-records.mjs, which is how past runs are served.", elements/source-receipt-store: "You asked me to turn imports I actually witnessed into dependencies: the scan shows tools/graph.mjs importing project-source-receipt.mjs.", elements/source-witness-claims: "You asked me to turn imports I actually witnessed into dependencies: the scan shows tools/graph.mjs importing project-source-witnesses.mjs.", elements/uncertainty-next-reads: "You asked me to find the node that owns growth_plan's new next-reads group; turning recorded unknowns into reads is the role it uses." }
dependencies: [capabilities/analysis-archive, elements/graph-compiler, elements/graph-engine, elements/source-receipt-store, elements/source-witness-claims, elements/vault-file-store]
---

Compiles the folder of Markdown files into one typed graph and answers structural questions over it, so a person or agent can ask what a node touches without opening every file.

## Includes
- Neighbours, paths, impact, reachability, clusters, and whole-graph health over the compiled graph.
- Duplicate and overlap candidates surfaced before a new node is written.
- A growth plan that, beside the writes it recommends, names the next reads each node's own recorded unknowns ask for.
- A second, deliberately simpler surface that filters documents by field rather than by traversal.

## Excludes
- Judging whether an answer is true of the product; a graph answer is a structural fact, not accepted meaning.
- Reading the source code the nodes cite; the growth plan names a read, it never performs one.
- Writing anything back to the vault.

## Uncertainty
- This node first cited `mcp/src/query.mjs`, which reading showed to be only the small filter expression behind the simpler surface; the entry point is now the graph tool module, confirmed by import receipts showing it pull in the compiler, the engine and the file store. The engine is roughly 6,400 lines and was not read beyond its header, so which advertised operations live there rather than in this entry point is still unverified.
- The next-reads group was read where the plan assembles it (`mcp/src/ontology-engine.mjs:3464-3499`), including the comment saying its count is deliberately kept out of `totalActions` because a read changes the reader, not the vault. Whether the reads it names are the ones a reader would have chosen was not measured.
