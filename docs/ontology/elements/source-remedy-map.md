---
uid: de104f76-4f86-4cf9-be3c-603aff15a862
slug: elements/source-remedy-map
kind: element
title: Source remedy map
display_en: Source remedy map
display_ko: 소스 수정 매핑
domain: domains/code-evidence
path: mcp/src/project-source-remedy.mjs
created_by: "agent:claude-code"
---

Maps every diagnosis the binding can return to the exact call that repairs it, so a named problem is something a person or agent can actually act on rather than just read.

## Includes
- One mapping from each action name to its tool call and its terminal command.
- Whether a remedy can be run automatically, and whether it needs a person.

## Excludes
- Performing the remedy.
- Inventing a remedy for a diagnosis that has none; those are returned as not resolvable.

## Uncertainty
- Read from the module header, which records that the app once named an action no tool could perform. Whether every current action name has a mapping was not checked exhaustively.