---
uid: 82ad6500-2b7c-4510-ab2f-bb130ab7df0f
slug: elements/task-navigation-evidence
kind: element
title: Task navigation evidence
display_en: Task navigation evidence
display_ko: 작업 탐색 근거
domain: domains/agent-access
path: mcp/src/task-navigation-evidence.mjs
created_by: "agent:claude-code"
---

Selects the small set of exact code coordinates a brief may carry (at most one primary, one supporting and three test locations), and verifies each still resolves before it is handed over.

## Includes
- Hard limits per role, and a check that each cited path exists and is readable.
- Coordinates presented as navigation, never as proof that the code behaves as claimed.

## Excludes
- Reading the code's meaning.
- Growing the set when a task looks complicated; the limits are fixed.

## Uncertainty
- Read from the module header and its per-role limits. The selection rule that decides which file becomes the primary coordinate was not read, and no brief was requested in this session.