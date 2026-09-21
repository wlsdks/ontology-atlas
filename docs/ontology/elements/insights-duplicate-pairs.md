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

Finds pairs of nodes that may be the same idea recorded twice, so the most common way a growing vault goes wrong is visible rather than accumulating quietly.

## Includes
- Candidate pairs surfaced for a person to judge, keep, or merge.

## Excludes
- Merging anything; whether two nodes are one concept is a decision a person makes.

## Uncertainty
- Witnessed as an import of the insights page and read by name only. Its scoring was not compared against the duplicate check the agent surface offers before a write, and the two may not agree.