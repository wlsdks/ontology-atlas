---
uid: 13a4f669-cc21-4435-9a40-fbb183e6a105
slug: elements/source-declaration-outline
kind: element
title: Source declaration outline
display_en: Source declaration outline
display_ko: 소스 선언 목차
domain: domains/code-evidence
path: mcp/src/source-outline.mjs
created_by: "agent:claude-code"
---

Lists a file's declarations with the line each one starts at, so the next bounded read lands on the range that answers the question instead of the head of a long file.

## Includes
- A line scan chosen by file extension that names declarations with their line numbers and a shortened signature.
- A ceiling of 400 declarations per file, with the truncation said out loud rather than silently dropped.

## Excludes
- Claiming what a declaration does; this is a table of contents, never a reading of behaviour.
- Opening a file itself, and proving absence — a declaration it misses is not evidence there is none.

## Uncertainty
- Read the module header and its exports (`mcp/src/source-outline.mjs:1-27` and `:364`). The per-language scanning rules between them were not read, so which declaration shapes each of the listed languages actually matches is unverified here.