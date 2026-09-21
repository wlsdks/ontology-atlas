---
uid: 67ff750a-bcbf-4463-b0ac-ec3ef5ca97d3
slug: elements/insights-unmatched-board
kind: element
title: Insights unmatched board
display_en: Insights unmatched board
display_ko: 인사이트 미연결 보드
domain: domains/human-workbench
path: src/views/ontology-insights/lib/unmatched-board.ts
created_by: "agent:claude-code"
---

Shows where the record and the code fail to meet: parts of the codebase no meaning claims, and recorded meaning no code backs.

## Includes
- Both directions of the mismatch, with the dismissals a person has already made kept out of the way.

## Excludes
- Creating the missing meaning or the missing evidence.
- Deciding that an unmatched item is a defect; some code is deliberately unmodelled.

## Uncertainty
- Witnessed as an import of the insights page and read by name only. It was never run against this vault, so whether it would flag the unread parts of this codebase is untested.