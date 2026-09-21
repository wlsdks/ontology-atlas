---
uid: fd5670a3-6a86-449e-9346-03773cc9d8dc
slug: elements/wiki-compile-brief
kind: element
title: Wiki compile brief
display_en: Wiki compile brief
display_ko: 위키 컴파일 지시문
domain: domains/human-workbench
path: src/features/library/lib/compile-brief.ts
created_by: "agent:claude-code"
---

Composes the instruction that turns a raw source into a proposed wiki page, carrying the page template, the required section order, and which sources still need compiling.

## Includes
- Selecting which sources are not yet covered by a page, and the brief that asks for one.

## Excludes
- Writing the page to disk.
- Deciding whether the produced page is acceptable, which the write judge does.

## Uncertainty
- Read from its imports of the page schema and the sources-needing-compile check, plus its file name. The brief text itself was not read, and no compile was run.