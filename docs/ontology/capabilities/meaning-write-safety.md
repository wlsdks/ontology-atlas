---
uid: 0c07c890-9147-4052-afb4-67d6cb071a4c
slug: capabilities/meaning-write-safety
kind: capability
title: Meaning write safety
display_en: Meaning write safety
display_ko: 의미 기록 안전장치
domain: domains/meaning-layer
elements: [elements/frontmatter-parser, elements/vault-file-store, elements/vault-kind-schema]
path: mcp/src/write-consent.mjs
created_by: "agent:claude-code"
relation_notes: { elements/vault-file-store: You asked for element nodes named by role under the capability that uses them; the store performs the write and holds the stale-overwrite check., elements/vault-kind-schema: You asked for element nodes named by role under the capability that uses them; the schema declares what a valid write has to carry., elements/frontmatter-parser: You asked for element nodes named by role under the capability that uses them; a safe rewrite has to read the existing file first. }
---

Lets a change land in the vault files without silently erasing a concurrent edit, and asks the person for consent before a write takes effect.

## Includes
- The modification-time guard that stops a second writer overwriting a first.
- The consent checkpoint an agent's write waits at, answered allow or reject.

## Excludes
- Deciding whether the proposed change is correct; that judgment belongs to the review surfaces.
- Version history, which Git owns.

## Uncertainty
- Read from `mcp/src/write-consent.mjs` by name alongside prose describing the modification-time guard in `mcp/src/vault.mjs`; neither file's implementation was read, and no concurrent write was exercised in this scan.