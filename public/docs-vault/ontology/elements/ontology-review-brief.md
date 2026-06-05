---
slug: elements/ontology-review-brief
kind: element
title: Ontology Review Brief
domain: views
---

`src/views/ontology-view/lib/review-brief.ts` and `src/views/ontology-view/ui/OntologyViewPage.tsx` build the selected concept review surface for `/ontology`.

The selected concept view is a centered modal workbench, not a cramped side rail. It keeps a compact header, a left tab rail, and a scrollable reading pane so people can inspect one concept at a time without losing the graph context behind it.

The tabs separate the jobs a human or AI agent performs on a concept:

- Overview: meaning, key facts, source object, and project/topology jumps.
- Relations: typed incoming/outgoing neighbors and reachability evidence.
- Agent: copyable MCP proof packets for node profile, impact, path guard, and post-change sync.
- Review: collaborator questions, impact summary, vocabulary review, and write guard commands.

This element proves why ontology is useful during development: the UI turns a selected node into a reviewable meaning object, then gives Claude Code/Codex the exact graph checks to run before changing code or vault records.
