---
uid: 34d66336-dc02-4e81-ac3c-5e85e596f27c
slug: elements/insights-do-next-queue
kind: element
title: Insights do-next queue
display_en: Insights do-next queue
display_ko: 인사이트 다음 할 일 목록
domain: domains/human-workbench
path: src/views/ontology-insights/lib/do-next-queue.ts
created_by: "agent:claude-code"
---

Retained legacy ordering and grouping of findings into candidate work for the former Insights repair board.

## Includes
- Turning existing findings into ordered repair rows and advisory groups.
- Templates that name a proposed next action without performing it.

## Excludes
- Producing source evidence, performing a repair, or accepting meaning.
- Ordering the current Analysis relationship comparisons.

## Uncertainty
- Re-read in the 2026-10-10 retirement. The current Analysis entry does not import this queue. Legacy helper and test consumers remain; agreement with the latest agent maintenance plan was not requalified and no concept deletion was performed.
