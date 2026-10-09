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

Retained legacy rows for durable graph references whose named target is missing, with viewer dismissals applied to the visible list.

## Includes
- Names, source references, relation keys, and reference counts supplied by unresolved graph asks.
- A total that includes dismissed names and a visible list that excludes them.

## Excludes
- Comparing arbitrary source code against the ontology record.
- Creating a missing concept, repairing a reference, or declaring an unresolved name a product defect.
- An unmatched-name board in the current Analysis entry.

## Uncertainty
- Read `src/views/ontology-insights/lib/unmatched-board.ts` during the 2026-10-10 retirement; the earlier record-versus-code wording was not the module's actual behavior. Legacy types and tests remain, while the current page has no runtime import of the helper. No concept deletion or general matching qualification was performed.
