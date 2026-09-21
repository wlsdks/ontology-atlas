---
uid: e9fca5c2-0a8c-47f0-ad0f-c3e3b38823a8
slug: elements/growth-hint
kind: element
title: Growth hint
display_en: Growth hint
display_ko: 성장 힌트
domain: domains/meaning-layer
path: mcp/src/growth-hint.mjs
created_by: "agent:claude-code"
---

Turns a read that found nothing into a concrete suggestion of where the record should grow, on the argument that an unanswerable question is exactly the gap worth recording.

## Includes
- Near-named existing nodes to check first, or a scaffold for a node that looks genuinely new.
- Attachment only on an empty or unresolved result, never on a successful one.

## Excludes
- Creating anything; the hint is a suggestion a person or agent may ignore.
- Guessing meaning the vault does not already contain.

## Uncertainty
- Read from the module header and its stated callers. Whether the hints are useful in practice was not measured, and the repository does not claim they are.