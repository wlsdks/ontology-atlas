---
uid: 2a1c1f4e-5004-4510-b8b3-90ab2d81e2a2
slug: elements/wiki-lint-brief
kind: element
title: Wiki lint brief
display_en: Wiki lint brief
display_ko: 위키 점검 지시문
domain: domains/human-workbench
path: src/features/library/lib/lint-brief.ts
created_by: "agent:claude-code"
---

Composes the judgement half of the wiki health check: the questions a validator cannot answer, such as whether two pages disagree or whether a later source replaced a claim an older page still makes.

## Includes
- Readings of prose that a shape check cannot decide, returned as findings for a person.

## Excludes
- The mechanical page and folder checks, which the wiki contract decides on its own.
- Repairing what it finds.

## Uncertainty
- Read from the module header, which draws the line between facts a validator settles and readings that need a judgement. The brief text was not read and no lint was run in this vault, which holds no wiki pages.