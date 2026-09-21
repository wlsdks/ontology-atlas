---
uid: 7e9aea5b-2aae-4f0e-a652-5c8def388cf7
slug: elements/wiki-page-write-judge
kind: element
title: Wiki page write judge
display_en: Wiki page write judge
display_ko: 위키 페이지 쓰기 심사
domain: domains/human-workbench
path: src/features/library/lib/judge-page-write.ts
created_by: "agent:claude-code"
---

Checks a proposed wiki page against the page contract before the person is asked to allow the write, so a page that would fail is refused at the one moment refusing still means something.

## Includes
- Validating the page at the permission card, and the verdict that card shows.

## Excludes
- Fixing the page it refuses.
- Judging pages already on disk, which the lint pass handles.

## Uncertainty
- Read from the module header, which records the 2026-09-06 probe where a brief claimed a failing page would be rejected and nothing rejected it. Whether the current card actually blocks the write was not observed, only read.