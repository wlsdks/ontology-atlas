---
uid: c9f6fc1b-8321-47ce-bd51-78b1f1c1389f
slug: capabilities/wiki-pages
kind: capability
title: Wiki pages
display_en: Wiki pages
display_ko: 위키 페이지
domain: domains/meaning-layer
elements: []
path: mcp/src/wiki-schema.mjs
created_by: "agent:claude-code"
dependencies: [elements/frontmatter-parser]
relation_notes: { elements/frontmatter-parser: "You asked me to turn imports I actually witnessed into dependencies: wiki-schema.mjs imports parseFrontmatter from parser.mjs, read in its source." }
---

A second page format in the same folder for prose that must cite its sources, with required sections in a fixed order and its own findings when a page or the folder breaks the contract.

## Includes
- The page contract: required fields, five sections in order, and a citation for every stated fact.
- Folder-level findings a single page cannot see, such as a link to a page that is not there or two pages citing one source without linking each other.

## Excludes
- The typed graph itself; a wiki page enters the graph only when it carries a kind.
- Deciding whether two pages disagree, which the repository states is a human judgement and not a code.

## Uncertainty
- Read from the module header, which names the public specification section this file is the machine half of. That specification was not opened, and no wiki pages exist in this vault to check the contract against.