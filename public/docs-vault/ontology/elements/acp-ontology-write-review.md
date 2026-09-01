---
uid: 5792b459-345c-469c-8342-7e2b902cffa3
slug: elements/acp-ontology-write-review
kind: element
title: ACP Ontology Write Review
display_ko: ACP 쓰기 검토
domain: domains/graph-modeling
path: src/widgets/acp-chat-panel/ui/AcpPermissionCard.tsx
created_by: "agent:unknown"
---

The ACP permission boundary that lets Atlas read tools continue automatically but pauses every Atlas write tool on a typed change review. It offers allow_once or reject_once and deliberately hides allow_always for semantic writes. Since 2026-09-01 the same boundary also stops a non-Atlas tool whose declared kind is not read-only (edit, delete, move, execute, or unknown) even when its path stays inside the vault: path containment alone no longer auto-allows a write, so an agent's built-in file tools cannot rewrite vault Markdown without a card (decision 2026-09-01, refining 2026-08-16 (2) §3).