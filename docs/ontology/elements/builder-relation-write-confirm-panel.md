---
slug: elements/builder-relation-write-confirm-panel
kind: element
title: Builder Relation Write Confirm Panel
domain: views
capabilities: [capabilities/agent-graph-readiness, capabilities/agent-practitioner-concerns-map, capabilities/builder-relation-write-confirm]
---

`src/views/ontology-edit/ui/RelationWriteConfirm.tsx` is the confirmation panel shown after dragging between two persisted vault nodes.

It makes relation writes explicit before local markdown changes happen: selected frontmatter key, inferred relation meaning, write boundary, MCP `add_relation` args, preflight result, bounded traversal check, and post-save sync gate all stay visible in one modal.

The panel now includes a compact agent write lens (`Context`, `Tools`, `Evidence`, `Drift`, `Workflow`) inside the save decision checklist. This keeps Claude Code/Codex-oriented writes aligned with the practitioner concern map: confirm both endpoint meanings, keep MCP writes blocked until read checks pass, run relation/path evidence, sync after save, and save one edge at a time.