---
uid: 4ec4ac53-4773-460a-be08-256301523d4f
slug: elements/evidence-verdict-rule
kind: element
title: Evidence verdict rule
display_en: Evidence verdict rule
display_ko: 근거 판정 규칙
domain: domains/code-evidence
path: mcp/src/evidence-verdict.mjs
created_by: "agent:claude-code"
---

States in one place whether a concept still stands on the code it cites, so the screen and the agent surface answer the question with the same word instead of two implementations that disagree.

## Includes
- The four possible verdicts and the precedence between them when a concept cites several paths.
- A single rule imported by both surfaces rather than copied into each.

## Excludes
- Gathering the dates the verdict is computed from.
- Deciding what to do about a stale verdict.

## Uncertainty
- Read from the module header, which records the day the two implementations disagreed about a concept citing both a missing path and an unreached one. The mirrored copy at `src/shared/lib/evidence-verdict.mjs` was seen in the file list but not opened.