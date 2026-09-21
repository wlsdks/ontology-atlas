---
uid: 42c892c8-93de-4e30-bc97-43b506732635
slug: domains/meaning-layer
kind: domain
title: Meaning layer
display_en: Meaning layer
display_ko: 의미 계층
capabilities: [capabilities/construction-guidance, capabilities/document-absorption, capabilities/meaning-write-safety, capabilities/vault-graph-query, capabilities/vault-validation, capabilities/wiki-pages]
created_by: "agent:claude-code"
relation_notes: { capabilities/vault-graph-query: You asked which capabilities sit under each domain; you approved this one under the meaning layer., capabilities/meaning-write-safety: You asked which capabilities sit under each domain; you approved this one under the meaning layer., capabilities/vault-validation: You asked which capabilities sit under each domain; you approved this one under the meaning layer., capabilities/construction-guidance: "You asked me to add any capability the code shows that the map lacks; this is one, and the tool asked the domain to declare it back.", capabilities/document-absorption: "You asked me to add any capability the code shows that the map lacks; this is one, and the tool asked the domain to declare it back.", capabilities/wiki-pages: "You asked me to add any capability the code shows that the map lacks; this is one, and the tool asked the domain to declare it back.", elements/frontmatter-parser: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/vault-kind-schema: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/vault-file-store: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/graph-compiler: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/graph-engine: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/compiled-graph-cache: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/meaning-gap-findings: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/document-filter-dsl: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/growth-hint: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back. }
elements: [elements/compiled-graph-cache, elements/document-filter-dsl, elements/frontmatter-parser, elements/graph-compiler, elements/graph-engine, elements/growth-hint, elements/meaning-gap-findings, elements/vault-file-store, elements/vault-kind-schema]
---

The reviewed record of what the codebase builds, held as Markdown files a person can read and a Git diff can show, together with the schema those files obey and the typed graph they compile into.

## Includes
- The five authorable node kinds and the frontmatter schema that defines them.
- Compiling the folder into one typed graph and answering structural questions over it.
- Checking that the files still form a well-formed graph.
- Guarding a write so one editor does not silently erase another's change.

## Excludes
- The source code that proves a meaning, and whether that proof still holds.
- The screens a person uses to look at the record.
- The interfaces through which agents reach the record.

## Uncertainty
- Read from the names and layout of `mcp/src/schema.mjs`, `mcp/src/parser.mjs`, `mcp/src/query.mjs`, `mcp/src/validate.mjs` and `mcp/src/write-consent.mjs`. The mirrored copies under `cli/src/lib/` and `src/shared/lib/` were seen referenced in prose but not read line by line, so how completely the three surfaces share one schema is unverified here.