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
- Capturing immutable queued request arguments, guards and options together with the originating user event, vault and session generation. Numeric and string JSON-RPC permission request IDs remain distinct.
- Refusing an ontology-write permission request with a missing origin or a mismatched session/vault before presenting it. This binds execution permission; it does not establish semantic acceptance, code verification, merge or deployment.

## Excludes

- Rendering the review card body itself (elements/ontology-change-review formats the typed diff shown on the card).
- Writing the approved change to vault frontmatter (the MCP write tools and CLI own the actual mutation).
- Deciding which relation types or values are valid (mcp/src/schema.mjs owns that).

## Task meaning review

- The originating user task remains visible across Summary, Compare and full Details. Every requested field and batch item can be inspected; selected-item coverage never certifies the batch. Complete recorded conditions, exceptions, unknowns and relation rationales remain in the review.
- A bounded two-pass pre-prompt capture supplies fresh ontology bytes and a connected source observation. The single-patch controller requires complete matching vault/scope/target evidence and a same-turn MCP connection result. Missing bases, source rebinding, or changed source without an attributed task-owned diff cannot produce trusted meaning acceptance.
- Explicit meaning acceptance rechecks the exact request and basis and never resolves the execution permission. Code verification, merge and deployment remain separately unknown without their own evidence. Known wrong-vault execution is blocked even when comparison evidence is absent.
- Request correction rejects the old request and prepares editable task context while preserving an existing draft; it never automatically sends. Deferral keeps a live request unresolved with a resume action. Cancelling refuses the pending write. These actions do not roll back code.

### Implementation evidence

- Capture: `src/features/acp-session/model/task-baseline.ts` and `src/views/home/model/use-task-review-baseline.ts`.
- Comparison and acceptance: `src/widgets/acp-chat-panel/model/use-task-meaning-review.ts`.
- Interaction: `src/widgets/acp-chat-panel/ui/AcpChatPanel.tsx` and `src/widgets/acp-chat-panel/ui/AcpPermissionCard.tsx`.
- Regression proof: the corresponding capture, controller and ChatPanel tests, including provider replacement, contradictory connection evidence, correction and defer/cancel.

### Uncertainty

- Two bounded reads are not an atomic filesystem snapshot. Native integer millisecond times are only coarsely compatible with a fractional MCP write guard.
- The current controller does not establish exact task-owned code diffs, trusted batch semantic acceptance, durable decisions, human decision-quality improvement or repeated-use benefit.
