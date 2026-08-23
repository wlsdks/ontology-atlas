---
uid: fa08540f-a6c0-4a13-8dd9-b43df420534f
slug: capabilities/reviewed-ontology-writing
kind: capability
title: Reviewed Ontology Writing
domain: domains/graph-modeling
elements: [elements/acp-ontology-write-review, elements/ontology-change-review, elements/ontology-meaning-editor]
path: src/features/ontology-meaning-editor
created_by: "agent:unknown"
---

## Definition
The capability to apply ontology writing requested by a user directly correcting the map or an ACP agent into markdown frontmatter only after reviewing accurate typed change proposals. It keeps the map selection context and the user's final meaning decision authority in the same flow.

## Boundaries
Change proposals are volatile pre-write states, not separate approval ledgers or second drafts. Markdown written after confirmation becomes the draft immediately. The map editor handles only one relation at a time; ACP read tools proceed automatically, but write tools wait for `allow_once` or `reject_once`. Meaning writing does not provide `allow_always`. ACP's single/bundled changes preserve all items in protocol order. Bundled cards show the entire row as an accordion, previewing only the chosen relation as a dashed line between two nodes. Allow/reject applies to the entire bundle, not using the first item as a proxy for hidden ones. If allowed, it confirms as a solid line in place during the existing `--motion-settle` 240ms before proceeding with the tool; if rejected or the `toolCallId` ends, it retracts from the map.

## Grounds
- src/features/ontology-meaning-editor (relation editor for the same anchor as the selection node inspector)
- src/entities/knowledge-graph/lib/ontology-change-set.ts (preserving all review items in batch protocol order)\n- src/features/ontology-change-review (manual/ACP common typed change review and selected item accordion)
- src/entities/knowledge-graph/lib/ontology-relation-edit.ts (frontmatter before/after plan)
- src/widgets/topology-map-v2/render/preview-edge.ts (directional preview that does not alter the force graph)
- src/features/acp-session/model/atlas-tool-policy.ts (read/write classification aligned with generated MCP surface)
- src/widgets/acp-chat-panel/ui/AcpPermissionCard.tsx (ACP write pause, allow-once/reject-once)
- src/widgets/acp-chat-panel/ui/AcpChatPanel.tsx (draft/committing map handoff for single relation change set)
- src/features/acp-session/model/use-acp-session.ts (`toolCallId`-based approval lifecycle and execution after reduced-motion-aware settle)
- docs/DECISIONS.md 2026-08-21 (92)

## Confidence
high (0.95)
