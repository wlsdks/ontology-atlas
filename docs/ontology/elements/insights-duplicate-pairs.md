---
uid: 5f393d83-6f0f-44d4-bc00-b3e4c43f5dce
slug: elements/insights-duplicate-pairs
kind: element
title: Insights duplicate pairs
display_en: Insights duplicate pairs
display_ko: 인사이트 중복 쌍
domain: domains/human-workbench
path: src/views/ontology-insights/lib/duplicate-pairs.ts
created_by: "agent:claude-code"
---

Retained legacy candidate matching of graph nodes that may describe the same concept.

## Includes
- Candidate pairs and their similarity values for a person to inspect.

## Excludes
- Merging records or deciding that two concepts are interchangeable.
- A duplicate-ranking surface in the current Analysis workbench.

## Uncertainty
- The module and tests remain after the 2026-10-10 Analysis redesign, but the current page no longer imports or displays this matcher. Its scores were not accepted as semantic equivalence or re-compared with the agent surface in this bounded sync.
