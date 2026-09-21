---
uid: 4be7ed8e-7ef7-49f6-b4fd-55f3c25f6e3c
slug: capabilities/document-absorption
kind: capability
title: Document absorption
display_en: Document absorption
display_ko: 문서 흡수
domain: domains/meaning-layer
elements: []
path: mcp/src/absorb.mjs
created_by: "agent:claude-code"
dependencies: [elements/vault-kind-schema]
relation_notes: { elements/vault-kind-schema: "You asked me to turn imports I actually witnessed into dependencies: the import scan shows absorb.mjs importing schema.mjs, its only internal import." }
---

Converts an existing agent-instruction document such as a CLAUDE.md or AGENTS.md into typed nodes and node suggestions, so the team stops maintaining the same knowledge twice.

## Includes
- Rule, policy and decision sections becoming document nodes that carry their role.
- Architecture and component sections becoming suggestions only, never written without an explicit decision.

## Excludes
- Replacing the original document; it is absorbed, and the source keeps existing.
- Auto-writing the structural suggestions it produces.

## Uncertainty
- Read from the module header and its single import. How well the section classification holds on a document that does not follow the CLAUDE.md shape was not tested here.