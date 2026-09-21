---
uid: 6ebac6a6-9a93-454b-afbe-b9ea6fec175c
slug: elements/insights-meaning-gaps
kind: element
title: Insights meaning gaps
display_en: Insights meaning gaps
display_ko: 인사이트 의미 공백
domain: domains/human-workbench
path: src/views/ontology-insights/lib/meaning-gap-rows.ts
created_by: "agent:claude-code"
---

Lists the nodes whose prose is missing something a concept needs (no definition, no stated boundary, no stated unknown) as rows a person can work through.

## Includes
- One row per node with a gap, naming which part of its meaning is absent.

## Excludes
- Writing the missing prose.
- Judging whether a present definition is accurate.

## Uncertainty
- Witnessed as an import of the insights page and read by name only. Whether it applies the same rule as the write-time prose check on the agent surface was not verified; the repository keeps several such pairs in lock-step by contract test, but that test was not run here.