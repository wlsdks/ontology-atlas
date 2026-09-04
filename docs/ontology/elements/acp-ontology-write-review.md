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

## Evidence

- Primary implementation: `src/features/acp-session/model/atlas-tool-policy.ts#atlasToolMode`
- Supporting implementation: `src/features/acp-session/model/permission-intent.ts#permissionIntent`
- Focused test: `src/widgets/acp-chat-panel/ui/AcpPermissionCard.test.tsx#typed change를 보여 주고 계속 허용은 숨긴다`

## Includes

- Deciding, per ACP tool call, whether a write pauses on a typed change-review card or continues automatically.
- Classifying a non-Atlas tool as read-only or as edit/delete/move/execute/unknown by its declared kind, independent of path containment.
- Offering `allow_once`/`reject_once` on a paused card while withholding `allow_always` for semantic writes.

## Excludes

- Rendering the review card body itself (elements/ontology-change-review formats the typed diff shown on the card).
- Writing the approved change to vault frontmatter (the MCP write tools and CLI own the actual mutation).
- Deciding which relation types or values are valid (mcp/src/schema.mjs owns that).
