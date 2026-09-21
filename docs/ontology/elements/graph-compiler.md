---
uid: b0cea195-ef7e-4f05-ba2c-ed919941c869
slug: elements/graph-compiler
kind: element
title: Graph compiler
display_en: Graph compiler
display_ko: 그래프 컴파일러
domain: domains/meaning-layer
path: mcp/src/ontology-compiler.mjs
created_by: "agent:claude-code"
dependencies: [elements/vault-file-store, elements/vault-kind-schema]
relation_notes: { elements/vault-kind-schema: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows ontology-compiler.mjs importing schema.mjs.", elements/vault-file-store: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows ontology-compiler.mjs importing vault.mjs." }
---

Turns the loaded documents into one graph artifact of nodes, edges and aliases, and stamps it with a hash that changes exactly when the graph does.

## Includes
- Resolving each declared reference to a node, an external path, or nothing, and reporting which.
- A summary mode that returns counts without the arrays, so a large vault can be sized cheaply.
- The stable graph hash other parts compare against to notice change.

## Excludes
- Answering questions about the compiled graph; traversal is the engine's role.
- Reading files from disk.

## Uncertainty
- Read from the module header and its import receipts. The compiler version constant suggests a prior format; whether older artifacts are still readable was not checked.