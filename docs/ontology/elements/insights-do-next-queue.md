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

Turns the board's separate findings into one ordered list of what to do next, so a person is not left comparing several lists to decide where to start.

## Includes
- Ordering and grouping findings from the other checks into a single queue of work.

## Excludes
- Producing the findings themselves.
- Performing any repair; the queue names work, it does not do it.

## Uncertainty
- Witnessed as an import of the insights page and read by name only. How the ordering is weighted, and whether it matches what the maintenance plan on the agent surface would order, were not compared.