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

Retained legacy presentation of per-document meaning findings as candidate repair rows for the former Insights board.

## Includes
- Rows describing missing definitions, responsibility placement, boundaries, uncertainty, unsupported exclusions, and kind-folder placement.
- Distinguishing an editable field from prose or file placement that a person must decide.

## Excludes
- Writing missing prose or accepting a meaning.
- The current Analysis comparison and implementation-evidence view.

## Uncertainty
- Re-read in the 2026-10-10 Analysis retirement. The current page no longer imports this module; retained legacy tabs, types, and tests still refer to it. Its earlier comparison with MCP maintenance ordering was not repeated, and the concept was not deleted.
