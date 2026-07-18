---
slug: elements/builder-relation-write-confirm-panel
kind: element
title: Builder Relation Write Confirm Panel
domain: views
capabilities: [capabilities/agent-graph-readiness, capabilities/agent-practitioner-concerns-map, capabilities/builder-relation-write-confirm]
---

`src/views/ontology-edit/ui/RelationWriteConfirm.tsx` is the confirmation panel shown after dragging between two persisted vault nodes.

It makes relation writes explicit before local markdown changes happen: selected frontmatter key, inferred relation meaning, write boundary, MCP `add_relation` args, preflight result, bounded traversal check, and post-save sync gate all stay visible in one modal.

The panel includes a compact agent write lens (`Context`, `Tools`, `Evidence`, `Drift`, `Workflow`) inside the save decision checklist. This keeps Claude Code/Codex-oriented writes aligned with the practitioner concern map: confirm both endpoint meanings, keep MCP writes blocked until read checks pass, run relation/path evidence, sync after save, and save one edge at a time.

The write lens consumes `AGENT_PRACTITIONER_CONCERNS` from `src/shared/lib/ontology-tree/agent-query-recipes.ts` instead of keeping a separate local order. `RelationWriteConfirm` maps each stable concern id to save-flow-specific copy and exposes the ids in test-only DOM attributes. As of the 2026-07 map rebuild this is the only UI surface consuming that shared concern order — the old graph DB query cockpit that used to share it was removed with the `/ontology/insights` rebuild, so "fail together if the order drifts" is now scoped to this modal and its test suite alone.