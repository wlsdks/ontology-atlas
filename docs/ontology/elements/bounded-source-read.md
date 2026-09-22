---
uid: e7761a89-a867-486e-93ec-29ffe2e71e05
slug: elements/bounded-source-read
kind: element
title: Bounded source read
display_en: Bounded source read
display_ko: 제한된 소스 읽기
domain: domains/code-evidence
path: mcp/src/source-evidence.mjs
created_by: "agent:claude-code"
dependencies: [elements/source-declaration-outline]
relation_notes: { elements/source-declaration-outline: "You asked me to witness the import: mcp/src/source-evidence.mjs:14 imports outlineSource from source-outline.mjs, which is what mode outline returns." }
---

Hands a builder the exact lines of a repository file it names, under fixed ceilings on how many requests, lines and bytes one turn may spend, so a proposal can quote real code without anyone loading the repository into the conversation.

## Includes
- A line-range read pinned to the file's digest, and a table-of-contents read that returns the file's declarations instead of a range.
- Refusal of what is not source, is too large, or is shaped like a credential, and one stated aggregate budget that an outline spends from just as a range does.

## Excludes
- Deciding what the lines mean; a returned range is evidence a person still has to read, and an outline carries no citation at all.
- Reading anything outside the bound repository.

## Uncertainty
- Read the limits table and the selector validation that now accepts `mode` (`mcp/src/source-evidence.mjs:16-28` and `:85-130`), the outline row it assembles (`:232-256`), and its one caller (`mcp/src/tools/repo-analysis.mjs:19`). The refusal, digest and traversal-guard paths were read by name only, and no read was executed against a repository in this pass.