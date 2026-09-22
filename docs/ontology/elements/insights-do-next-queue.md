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
- Four advisory sections for the meaning findings nobody can close by filling in a field: no stated boundary, no stated unknown, an exclusion that only reports what was not read, and a file outside its kind's folder.

## Excludes
- Producing the findings themselves.
- Performing any repair; the queue names work, it does not do it.

## Uncertainty
- Read the four section keys and their counting (`src/views/ontology-insights/lib/do-next-groups.ts:36-38` and `:59-61`). The file remains witnessed as an import of the insights page and its weighting was still not read, so whether this order matches the maintenance plan the agent surface returns has not been compared.
