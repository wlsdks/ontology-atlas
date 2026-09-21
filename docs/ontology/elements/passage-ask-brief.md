---
uid: 64d33552-a9c8-42a8-9b3c-58166405085a
slug: elements/passage-ask-brief
kind: element
title: Passage ask brief
display_en: Passage ask brief
display_ko: 구절 질문 지시문
domain: domains/human-workbench
path: src/features/library/lib/ask-brief.ts
created_by: "agent:claude-code"
---

Carries one question about a sentence a person selected in a page, together with the rule that keeps the answer honest: read the page and the originals it cites, quote them, and say plainly when they do not answer.

## Includes
- The exact passage, the page it came from, and a question either chosen from a short list or typed.
- The instruction that an answer must quote rather than paraphrase from memory.

## Excludes
- Producing the answer.
- Changing the page the passage came from.

## Uncertainty
- Read in full at 76 lines, including the owner direction from 2026-09-07 that a person dragging over a sentence should be able to ask about it at once. Whether answers in practice honour the quoting rule was not observed.